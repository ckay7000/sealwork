import { route,body,method } from '../server/http.js';
import { HttpError,limitRequests,verifyChallenge } from '../server/security.js';
import { cloudRequest,privateEvidence,validateEncryptedCompletion } from '../server/private-ai.js';

export default route(async(req,res)=>{
  method(req,'POST');const input=body(req);
  const allowed=input.action==='attest'?['action','nonce','challenge']:input.action==='complete'?['action','request_body','client_key','model_key','challenge']:input.action==='signature'?['action','response_id','challenge']:[];
  if(!allowed.length||Object.keys(input).some(k=>!allowed.includes(k)))throw new HttpError(400,'Use the encrypted private analysis protocol. Raw financial fields are not accepted.');
  verifyChallenge(input.challenge);
  limitRequests(`${String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'local').split(',')[0].trim()}:private-ai:${input.action}`);
  if(input.action==='attest'){
    if(typeof input.nonce!=='string'||! /^[a-f0-9]{64}$/.test(input.nonce))throw new HttpError(400,'Provide a fresh 32-byte verification nonce.');
    return res.status(200).json(await privateEvidence(input.nonce));
  }
  if(input.action==='complete'){
    validateEncryptedCompletion(input);
    const raw=await cloudRequest('/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','X-Signing-Algo':'ed25519','X-Client-Pub-Key':String(input.client_key),'X-Model-Pub-Key':String(input.model_key),'X-Encryption-Version':'2'},body:String(input.request_body)});
    return res.status(200).json({raw});
  }
  if(typeof input.response_id!=='string'||! /^[A-Za-z0-9_.:-]{1,160}$/.test(input.response_id))throw new HttpError(400,'Invalid inference response identifier.');
  let signature:Record<string,unknown>={};
  for(let attempt=0;attempt<3;attempt++){
    try{signature=JSON.parse(await cloudRequest(`/v1/signature/${encodeURIComponent(input.response_id)}?signing_algo=ed25519`));if(signature.signature)break}catch{ /* briefly allow signature persistence */ }
    if(attempt<2)await new Promise(resolve=>setTimeout(resolve,(attempt+1)*500));
  }
  if(!signature.signature)throw new HttpError(503,'The model response signature is unavailable. No job was funded.');
  return res.status(200).json({signature});
});
