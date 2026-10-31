import {beforeAll,describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import init,{js_verify} from 'dcap-qvl';
import {ed25519} from '@noble/curves/ed25519.js';
import fixture from '../fixtures/near-model-evidence.json' with {type:'json'};
import {verifyModelReport,verifyAnalysisSignature,encryptModelMessage,decryptModelMessage,digestText} from '../../shared/private-ai';
import type {ModelReport} from '../../shared/private-ai';
import {hex} from '../../shared/crypto';
import {validateEncryptedCompletion} from '../../server/private-ai';

beforeAll(async()=>{await init({module_or_path:await readFile('node_modules/dcap-qvl/dcap-qvl-web_bg.wasm')});});
describe('confidential model evidence',()=>{
  it('cryptographically verifies captured Intel quotes and all runtime bindings',()=>{
    for(const f of fixture.reports)expect(verifyModelReport(f.report as ModelReport,fixture.nonce,f.collateral,js_verify,f.kind as 'model'|'gateway',fixture.now).tcb).toBe('UpToDate');
  });
  it.each(['nonce','signer','quote','event','configuration'])('rejects altered %s evidence',kind=>{
    const f=structuredClone(fixture.reports[1]),r=f.report as ModelReport;
    if(kind==='nonce')r.request_nonce='00'.repeat(32);
    if(kind==='signer')r.signing_address='11'.repeat(32);
    if(kind==='quote')r.intel_quote=r.intel_quote.slice(0,1140)+(r.intel_quote[1140]==='0'?'1':'0')+r.intel_quote.slice(1141);
    if(kind==='event'){const e=r.event_log as Array<{imr:number;event:string}>;e.find(x=>x.imr===3)!.event+=' altered';}
    if(kind==='configuration')r.info.tcb_info={app_compose:'unapproved model service'};
    expect(()=>verifyModelReport(r,fixture.nonce,f.collateral,js_verify,'model',fixture.now)).toThrow();
  });
  it('encrypts to the recipient and detects altered encrypted responses',()=>{
    const secret=new Uint8Array(32).fill(9),key=hex(ed25519.getPublicKey(secret));
    const encrypted=encryptModelMessage('private invoice data',key);
    expect(decryptModelMessage(encrypted,secret)).toBe('private invoice data');
    const changed=encrypted.slice(0,-2)+(encrypted.endsWith('00')?'01':'00');
    expect(()=>decryptModelMessage(changed,secret)).toThrow();
    expect(()=>decryptModelMessage(encrypted,new Uint8Array(32).fill(8))).toThrow();
  });
  it('binds signatures to exact bytes and rejects gateway substitution and ambiguous signers',()=>{
    const secret=new Uint8Array(32).fill(7),signer=hex(ed25519.getPublicKey(secret));
    const request='{"model":"z-ai/glm-5.3-flash"}',response='{"id":"test"}';
    const text=`z-ai/glm-5.3-flash:${digestText(request)}:${digestText(response)}`;
    const signature={signature_kind:'provider_tee',signing_algo:'ed25519',signing_address:signer,text,signature:hex(ed25519.sign(new TextEncoder().encode(text),secret))};
    const report={signer,quote_hash:'11'.repeat(32),config_hash:'22'.repeat(32),tcb:'UpToDate'};
    expect(verifyAnalysisSignature(signature,request,response,[report],'test').instance_binding).toBe(false);
    expect(()=>verifyAnalysisSignature(signature,request+' ',response,[report],'test')).toThrow();
    expect(()=>verifyAnalysisSignature({...signature,signature_kind:'gateway'},request,response,[report],'test')).toThrow();
    expect(()=>verifyAnalysisSignature(signature,request,response,[report,report],'test')).toThrow();
  });
  it('rejects plaintext, extra authority, model changes and excess inference spend',()=>{
    const base={client_key:'11'.repeat(32),model_key:'22'.repeat(32),request_body:JSON.stringify({model:'z-ai/glm-5.3-flash',messages:[{role:'user',content:'33'.repeat(80)}],stream:false,temperature:0,max_tokens:1600,thinking_token_budget:128,reasoning_effort:'low',response_format:{type:'json_object'}})};
    expect(()=>validateEncryptedCompletion(base)).not.toThrow();
    for(const change of [{messages:[{role:'user',content:'RAW PRIVATE INVOICE'}]},{max_tokens:99999},{tools:[{type:'function'}]},{model:'other-model'}]){
      expect(()=>validateEncryptedCompletion({...base,request_body:JSON.stringify({...JSON.parse(base.request_body),...change})})).toThrow();
    }
  });
});
