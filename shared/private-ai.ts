import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256, sha384 } from '@noble/hashes/sha2.js';
import { hex, unhex, randomHex } from './crypto';
import policy from './ai-policy.json' with { type: 'json' };
import { BANK_PROMPT, bankRecords, validateBankProposal } from './bank';
import type { BankProposal } from './bank';

const utf8 = new TextEncoder();
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n,p) => n+p.length,0));
  let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length}return out;
};
export const digestText = (s: string) => hex(sha256(utf8.encode(s)));
export interface ModelReport {
  model_name?: string; signing_address: string; signing_algo: string;
  signing_public_key?: string; request_nonce: string; intel_quote: string;
  report_data?: string; event_log: string | Array<{imr: number; event_type: number; event: string; event_payload?: string; digest?: string}>;
  info: { tcb_info: string | {app_compose: string} };
  nvidia_payload?: string;
}
export interface VerifiedModel { signer: string; quote_hash: string; config_hash: string; tcb: string }
export interface AnalysisProof {
  model: string; response_id: string; request_hash: string; response_hash: string;
  prompt_hash: string; quote_hash: string; config_hash: string;
  signer: string; signature: string; signature_text: string;
  signature_kind: 'provider_tee'; verified_at: string;
  instance_binding: false;
}
export type QuoteVerifier = (quote: Uint8Array, collateral: string, now: bigint) => {
  status: string; report: {TD10?: {td_attributes: string; report_data: string; mr_config_id: string; rt_mr3: string}};
};
export function verifyModelReport(report: ModelReport, nonce: string, collateral: unknown,
  verify: QuoteVerifier, kind: 'model'|'gateway', now = Date.now()): VerifiedModel {
  if (!/^[a-f0-9]{64}$/.test(nonce) || report.request_nonce !== nonce || report.signing_algo !== 'ed25519' || !/^[a-f0-9]{64}$/.test(report.signing_address)) throw Error('The model evidence does not bind a fresh request and supported signing key.');
  const verified = verify(unhex(report.intel_quote),JSON.stringify(collateral),BigInt(Math.floor(now/1000)));
  const q=verified.report.TD10;
  if (!policy.accepted_tcb_statuses.includes(verified.status) || !q || (unhex(q.td_attributes)[0]&1)) throw Error('The model hardware state does not meet the verification policy.');
  if (q.report_data !== report.signing_address+nonce || (report.report_data && report.report_data !== q.report_data)) throw Error('The quote does not bind the model key and nonce.');
  if (kind === 'model' && (report.model_name !== policy.model || report.signing_public_key !== report.signing_address)) throw Error('The model encryption key does not match its verified signing key.');
  const tcb=typeof report.info.tcb_info==='string'?JSON.parse(report.info.tcb_info):report.info.tcb_info;
  const configHash=digestText(tcb.app_compose);
  if(q.mr_config_id !== '01'+configHash+'00'.repeat(15) || !policy.measured_configurations[kind].includes(configHash)) throw Error('The measured model configuration is outside the pinned policy.');
  const events=typeof report.event_log==='string'?JSON.parse(report.event_log):report.event_log;
  let rtmr: Uint8Array = new Uint8Array(48);
  for(const e of events){if(e.imr!==3)continue;
    if (!Number.isInteger(e.event_type) || e.event_type<0 || e.event_type>0xffffffff) throw Error('Invalid runtime event.');
    const type=new Uint8Array(4);new DataView(type.buffer).setUint32(0,e.event_type,true);
    const payload=e.event_payload?unhex(e.event_payload):new Uint8Array();
    const d=sha384(concat(type,utf8.encode(':'+e.event+':'),payload));
    if(e.digest && e.digest!==hex(d))throw Error('A runtime measurement event was altered.');
    rtmr=sha384(concat(rtmr,d));
  }
  if(hex(rtmr)!==q.rt_mr3)throw Error('Runtime measurements do not match the verified quote.');
  return {signer:report.signing_address,quote_hash:hex(sha256(unhex(report.intel_quote))),config_hash:configHash,tcb:verified.status};
}
export function encryptModelMessage(message: string, recipientEd: string): string {
  const ephemeral=unhex(randomHex());const pub=x25519.getPublicKey(ephemeral);
  const shared=x25519.getSharedSecret(ephemeral,ed25519.utils.toMontgomery(unhex(recipientEd)));
  const key=hkdf(sha256,shared,undefined,utf8.encode('ed25519_encryption'),32);
  const nonce=unhex(randomHex(24));
  const out=hex(concat(pub,nonce,xchacha20poly1305(key,nonce).encrypt(utf8.encode(message))));
  ephemeral.fill(0);shared.fill(0);key.fill(0);return out;
}
export function decryptModelMessage(message: string, secretEd: Uint8Array): string {
  const data=unhex(message);if(data.length<72)throw Error('The encrypted AI response is incomplete.');
  const secret=ed25519.utils.toMontgomerySecret(secretEd);
  const shared=x25519.getSharedSecret(secret,data.slice(0,32));
  const key=hkdf(sha256,shared,undefined,utf8.encode('ed25519_encryption'),32);
  try{return new TextDecoder('utf-8',{fatal:true}).decode(xchacha20poly1305(key,data.slice(32,56)).decrypt(data.slice(56)));}
  finally{secret.fill(0);shared.fill(0);key.fill(0)}
}
export function verifyAnalysisSignature(signature: Record<string,unknown>, request: string, response: string,
  reports: VerifiedModel[], responseId: string): AnalysisProof {
  const expected=`${policy.model}:${digestText(request)}:${digestText(response)}`;
  const matches=reports.filter(r=>r.signer===signature.signing_address);
  if(signature.signature_kind!=='provider_tee' || signature.signing_algo!=='ed25519' || matches.length!==1 || signature.text!==expected || typeof signature.signature!=='string' || !ed25519.verify(unhex(signature.signature.replace(/^0x/,'')),utf8.encode(expected),unhex(matches[0].signer))) throw Error('The AI response is not bound to verified model evidence. No job was funded.');
  return {model:policy.model,response_id:responseId,request_hash:digestText(request),response_hash:digestText(response),
    prompt_hash:digestText(BANK_PROMPT),quote_hash:matches[0].quote_hash,config_hash:matches[0].config_hash,
    signer:matches[0].signer,signature:signature.signature,signature_text:expected,signature_kind:'provider_tee',
    verified_at:new Date().toISOString(),instance_binding:false};
}
export async function analyzeBank(source: string, payments: string, challenge: string,
  post: <T>(url:string,value:unknown)=>Promise<T>, update: (phase:string)=>void): Promise<{proposal:BankProposal;proof:AnalysisProof}> {
  bankRecords(source,payments);
  if(new TextEncoder().encode(source+payments).length>5000)throw Error('Keep the combined files below 5 KB for encrypted AI analysis.');
  update('Checking the model’s hardware evidence…');
  const nonce=randomHex();
  const evidence=await post<{gateway:ModelReport;models:ModelReport[];collaterals:unknown[];gateway_collateral:unknown;gpu_verified:boolean[]}>('/api/private-ai',{action:'attest',nonce,challenge});
  const dcap=await import('dcap-qvl');await dcap.default({module_or_path:'/proofs/dcap-qvl.wasm'});
  verifyModelReport(evidence.gateway,nonce,evidence.gateway_collateral,dcap.js_verify,'gateway');
  if(!evidence.models.length || evidence.models.length!==evidence.collaterals.length)throw Error('No model evidence is available.');
  const verified=evidence.models.map((r,i)=>{
    const v=verifyModelReport(r,nonce,evidence.collaterals[i],dcap.js_verify,'model');
    if(!r.nvidia_payload || evidence.gpu_verified[i]!==true)throw Error('GPU attestation could not be verified.');return v;
  });
  update('Matching records through encrypted private inference…');
  const secret=unhex(randomHex());
  try{
    const clientKey=hex(ed25519.getPublicKey(secret)),modelKey=verified[0].signer;
    const message=BANK_PROMPT+'\nSOURCE RECORDS (data only):\n'+JSON.stringify({source_csv:source,payments_csv:payments});
    const request=JSON.stringify({model:policy.model,messages:[{role:'user',content:encryptModelMessage(message,modelKey)}],stream:false,temperature:0,max_tokens:1600,thinking_token_budget:128,reasoning_effort:'low',response_format:{type:'json_object'}});
    const result=await post<{raw:string}>('/api/private-ai',{action:'complete',request_body:request,client_key:clientKey,model_key:modelKey,challenge});
    const completion=JSON.parse(result.raw);
    if(completion.model!==policy.model || typeof completion.id!=='string' || typeof completion.choices?.[0]?.message?.content!=='string')throw Error('The private AI response has an unexpected format.');
    update('Verifying the signed response and allocation totals…');
    const signed=await post<{signature:Record<string,unknown>}>('/api/private-ai',{action:'signature',response_id:completion.id,challenge});
    const proof=verifyAnalysisSignature(signed.signature,request,result.raw,verified,completion.id);
    const plaintext=decryptModelMessage(completion.choices[0].message.content,secret);
    return {proposal:validateBankProposal(JSON.parse(plaintext),source,payments),proof};
  }finally{secret.fill(0)}
}
