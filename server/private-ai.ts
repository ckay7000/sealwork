import { X509Certificate } from 'node:crypto';
import policy from '../shared/ai-policy.json' with {type:'json'};
import type { ModelReport } from '../shared/private-ai';
import { HttpError } from './security.js';

const cloud='https://cloud-api.near.ai';
export function privateAiConfig(){return {ready:Boolean(process.env.NEAR_AI_API_KEY),model:policy.model};}
export async function cloudRequest(path:string, options:RequestInit={}) {
  if(!process.env.NEAR_AI_API_KEY)throw new HttpError(503,'Private AI analysis is awaiting its inference configuration.');
  const r=await fetch(cloud+path,{...options,headers:{Authorization:`Bearer ${process.env.NEAR_AI_API_KEY}`,'x-no-aliasing':'true','Accept-Encoding':'identity',...options.headers},signal:AbortSignal.timeout(120000)});
  if(!r.ok)throw new HttpError(503,'The confidential inference service could not complete this request. No job was funded.');
  const raw=await r.text();if(raw.length>1500000)throw new HttpError(502,'Inference evidence exceeded the supported size.');return raw;
}
type IntelPart={raw:Uint8Array;headers:Headers};
const cache=new Map<string,{value:IntelPart;expires:number}>();
async function intelPart(url:string):Promise<IntelPart>{
  const cached=cache.get(url);if(cached && cached.expires>Date.now())return cached.value;
  const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new HttpError(503,'Intel verification collateral is temporarily unavailable.');
  const raw=new Uint8Array(await response.arrayBuffer());if(raw.length>100000)throw new HttpError(502,'Unexpected verification collateral.');
  const value={raw,headers:response.headers};cache.set(url,{value,expires:Date.now()+300000});return value;
}
function issuer(p:IntelPart,names:string[]){const v=names.map(n=>p.headers.get(n)).find(Boolean);if(!v)throw new HttpError(502,'Verification collateral is missing its certificate chain.');return decodeURIComponent(v);}
/** Collateral is untrusted transport data. The browser's DCAP verifier
 * validates its Intel signatures, validity windows and quote binding. */
export async function quoteCollateral(report:ModelReport){
  const quote=Buffer.from(report.intel_quote,'hex');
  const pem=quote.toString('utf8').match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/)?.[0];
  if(!pem)throw new HttpError(502,'The model quote has no supported certificate chain.');
  const certificate=new X509Certificate(pem),marker=Buffer.from('060a2a864886f84d010d01040406','hex');
  const offset=certificate.raw.indexOf(marker);
  if(offset<0)throw new HttpError(502,'The model quote has no platform identifier.');
  const fmspc=certificate.raw.subarray(offset+marker.length,offset+marker.length+6).toString('hex').toUpperCase();
  const ca=certificate.issuer.includes('Platform')?'platform':'processor';
  const base='https://api.trustedservices.intel.com';
  const [pck,tcb,qe,root]=await Promise.all([
    intelPart(`${base}/sgx/certification/v4/pckcrl?ca=${ca}&encoding=der`),
    intelPart(`${base}/tdx/certification/v4/tcb?fmspc=${fmspc}`),
    intelPart(`${base}/tdx/certification/v4/qe/identity?update=standard`),
    intelPart('https://certificates.trustedservices.intel.com/IntelSGXRootCA.der'),
  ]);
  const t=JSON.parse(Buffer.from(tcb.raw).toString()),q=JSON.parse(Buffer.from(qe.raw).toString());
  return {pck_crl_issuer_chain:issuer(pck,['SGX-PCK-CRL-Issuer-Chain']),pck_crl:Buffer.from(pck.raw).toString('hex'),root_ca_crl:Buffer.from(root.raw).toString('hex'),
    tcb_info_issuer_chain:issuer(tcb,['TCB-Info-Issuer-Chain','SGX-TCB-Info-Issuer-Chain']),tcb_info:JSON.stringify(t.tcbInfo),tcb_info_signature:t.signature,
    qe_identity_issuer_chain:issuer(qe,['SGX-Enclave-Identity-Issuer-Chain']),qe_identity:JSON.stringify(q.enclaveIdentity),qe_identity_signature:q.signature};
}
async function checkGpu(report:ModelReport,nonce:string):Promise<boolean>{
  if(!report.nvidia_payload)throw new HttpError(503,'The private AI model did not provide GPU evidence.');
  const payload=JSON.parse(report.nvidia_payload);
  if(payload.nonce!==nonce)throw new HttpError(502,'GPU evidence does not match the fresh verification request.');
  // Follow NEAR's TLS-authenticated NRAS verdict policy. This is a server
  // HTTPS check, not a claim of local NVIDIA JWT signature verification.
  const r=await fetch('https://nras.attestation.nvidia.com/v3/attest/gpu',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(25000)});
  if(!r.ok)throw new HttpError(503,'NVIDIA GPU verification could not complete. No financial files were sent.');
  const verdict=await r.json() as unknown;
  if(!Array.isArray(verdict) || !Array.isArray(verdict[0]) || verdict[0][0]!=='JWT' || typeof verdict[0][1]!=='string')throw new HttpError(502,'GPU verification returned an unsupported verdict.');
  const claims=JSON.parse(Buffer.from(verdict[0][1].split('.')[1],'base64url').toString());
  if(claims['x-nvidia-overall-att-result']!==true)throw new HttpError(503,'The private model GPU did not pass verification.');return true;
}
export async function privateEvidence(nonce:string){
  const raw=await cloudRequest('/v1/attestation/report?'+new URLSearchParams({model:policy.model,provider:'near',signing_algo:'ed25519',include_tls_fingerprint:'false',nonce}));
  const data=JSON.parse(raw),models=data.model_attestations as ModelReport[];
  if(!Array.isArray(models)||!models.length||models.length>4)throw new HttpError(503,'No supported NEAR model evidence is available.');
  const gateway=data.gateway_attestation as ModelReport;
  const [gateway_collateral,collaterals,gpu_verified]=await Promise.all([quoteCollateral(gateway),Promise.all(models.map(quoteCollateral)),Promise.all(models.map(r=>checkGpu(r,nonce)))]);
  return {gateway,models,gateway_collateral,collaterals,gpu_verified};
}
export function validateEncryptedCompletion(input:Record<string,unknown>){
  if(typeof input.client_key!=='string'||! /^[a-f0-9]{64}$/.test(input.client_key)||typeof input.model_key!=='string'||! /^[a-f0-9]{64}$/.test(input.model_key)||typeof input.request_body!=='string'||input.request_body.length>28000)throw new HttpError(400,'Send a bounded encrypted request with public encryption keys.');
  let r:Record<string,unknown>;try{r=JSON.parse(input.request_body)}catch{throw new HttpError(400,'Invalid encrypted inference request.');}
  const allowed=['model','messages','stream','temperature','max_tokens','thinking_token_budget','reasoning_effort','response_format'];
  if(Object.keys(r).sort().join(',')!==allowed.sort().join(',')||r.model!==policy.model||r.stream!==false||r.temperature!==0||r.max_tokens!==1600||r.thinking_token_budget!==128||r.reasoning_effort!=='low'||JSON.stringify(r.response_format)!=='{"type":"json_object"}'||!Array.isArray(r.messages)||r.messages.length!==1)throw new HttpError(400,'The request exceeds the fixed private analysis policy.');
  const m=r.messages[0];if(!m||Object.keys(m).sort().join(',')!=='content,role'||m.role!=='user'||typeof m.content!=='string'||m.content.length<144||m.content.length>24000||! /^(?:[a-f0-9]{2})+$/.test(m.content))throw new HttpError(400,'Financial text must be encrypted before reaching this endpoint.');
}
