import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,chmod} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import deployment from '../deployments/testnet.json' with {type:'json'};
import built from '../deployments/builds.json' with {type:'json'};
import {BANK_INVOICES,BANK_PAYMENTS,approvedLedger} from '../shared/bank';
import type {BankProposal} from '../shared/bank';
import type {Job,PrivateInput,PublicConfig} from '../shared/types';
import {inputCommitment,sealToKeystore,randomHex,openResult,resultCommitment} from '../shared/crypto';

const site=new URL(process.env.SEALWORK_TEST_URL||process.env.SEALWORK_SITE_URL||'');
assert.equal(site.origin,new URL(deployment.site_url).origin);
async function request<T>(path:string,data?:unknown):Promise<T>{
  const r=await fetch(new URL(path,site),{method:data?'POST':'GET',headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(240000)});
  const value=await r.json();assert.ok(r.ok,JSON.stringify(value));return value as T;
}
const config=await request<PublicConfig>('/api/config');assert.ok(config.ready&&config.bank_supported&&config.private_ai?.ready);
assert.equal(config.contract_id,deployment.contract_id);
const good=built.builds.find(b=>b.feature==='ledgerline-v1')!,faulty=built.builds.find(b=>b.feature==='ledgerline-v2')!;
const browser=await chromium.launch({headless:true,executablePath:process.env.SEALWORK_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
await mkdir('reports/screenshots',{recursive:true});await mkdir('.local',{recursive:true,mode:0o700});
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage();
  page.setDefaultTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const requests:string[]=[];page.on('request',r=>{if(r.url().includes('/api/')&&r.method()==='POST')requests.push(r.postData()||'');});
  await page.goto(new URL(`/new?task=bank&mode=agent&build=${good.hash}`,site).href);
  await page.getByRole('button',{name:'Choose a worker within my rules'}).click();
  await expect(page.locator('.hiring-recommendation')).toBeVisible({timeout:120000});
  await page.getByRole('button',{name:'Analyze bank payments privately'}).click();
  await expect(page.locator('.bank-decisions')).toBeVisible({timeout:240000});
  await expect(page.locator('.bank-decision')).toHaveCount(4);
  await expect(page.getByText('Needs review',{exact:true})).toHaveCount(1);
  await page.getByRole('checkbox',{name:/I reviewed the proposed matches/}).check();
  await page.getByRole('button',{name:'Approve rules & let the agent hire'}).click();
  await expect(page).toHaveURL(/\/jobs\/sw_[a-f0-9]{32}/,{timeout:180000});
  const id=new URL(page.url()).pathname.split('/').at(-1)!;console.log('Checking private AI bank job:',id);
  await expect(page.locator('.job-detail-heading .pill')).toHaveText('Verified & paid',{timeout:180000});
  await expect(page.locator('.bank-decision')).toHaveCount(4);await expect(page.getByText('Needs review',{exact:true})).toHaveCount(1);
  const own=await page.evaluate(jobId=>JSON.parse(sessionStorage.getItem(`sealwork:private:${jobId}`)||'null'),id);
  assert.equal(own.bank_proof.model,'z-ai/glm-5.3-flash');assert.equal(own.bank_proof.signature_kind,'provider_tee');assert.equal(own.bank_proof.instance_binding,false);
  let pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download private decisions'}).click();
  let download=await pending;const decisionText=await readFile((await download.path())!,'utf8'),proposal={decisions:JSON.parse(decisionText).decisions} as BankProposal;
  assert.equal(proposal.decisions.find(d=>d.payment_id==='PAY-01')?.allocations.length,2);
  assert.equal(proposal.decisions.find(d=>d.payment_id==='PAY-02')?.status,'review');
  assert.deepEqual(proposal.decisions.find(d=>d.payment_id==='PAY-02')?.allocations,[]);
  pending=page.waitForEvent('download');await page.getByRole('button',{name:'Save recovery file'}).click();download=await pending;
  const recovery='.local/bank-live-recovery.json';await download.saveAs(recovery);await chmod(recovery,0o600);
  pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export receipt'}).click();download=await pending;
  const receiptText=await readFile((await download.path())!,'utf8');assert.ok(!receiptText.includes(own.buyer_key)&&!receiptText.includes('Northstar Studio')&&!receiptText.includes('Fern Cafe'));
  assert.ok(requests.every(r=>!r.includes('Northstar Studio')&&!r.includes('Fern Cafe')&&!r.includes(own.buyer_key)));
  const other=await context.newPage();await other.goto(page.url());await expect(other.locator('.bank-decision')).toHaveCount(0);
  await other.getByLabel('Import private delivery recovery file').setInputFiles(recovery);await expect(other.getByText('Needs review',{exact:true})).toHaveCount(1);await other.close();
  for(let i=0;i<2;i++){await page.getByRole('button',{name:'Inspect attestation'}).nth(i).click();await expect(page.getByText('Binary fingerprint matches',{exact:true})).toHaveCount(i+1);}
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});await page.evaluate(async()=>{await document.fonts.ready;window.scrollTo({top:0,behavior:'instant'});});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`reports/screenshots/bank-live-${width}.png`,fullPage:true,animations:'disabled'});
  }
  const cases:Array<Record<string,unknown>>=[{job_id:id,outcome:'accepted',settlement:'paid',receipt_url:page.url()}];
  for(const kind of ['faulty','invalid-allocation'] as const){
    const cfg=await request<PublicConfig>('/api/config'),p=structuredClone(proposal);
    if(kind==='invalid-allocation')p.decisions[0].allocations[0].amount_minor+=1;
    const input:PrivateInput={job_id:`sw_${randomHex(16)}`,source_csv:BANK_INVOICES,ledger_csv:approvedLedger(proposal,BANK_INVOICES,BANK_PAYMENTS),buyer_key:randomHex(),salt:randomHex(),bank:{payments_csv:BANK_PAYMENTS,proposal:p}};
    const commitment=inputCommitment(input),encrypted=sealToKeystore(JSON.stringify({SEALWORK_INPUT:JSON.stringify({input,input_commitment:commitment})}),cfg.encryption_public_key);
    const funded=await request<{capability:string}>('/api/jobs',{job_id:input.job_id,title:kind==='faulty'?'Private bank report rejection test':'Invalid bank allocation test',build_hash:kind==='faulty'?faulty.hash:good.hash,input_commitment:commitment,encrypted_input:encrypted,challenge:cfg.create_challenge,scenario:'normal'});
    await writeFile(`.local/bank-${kind}-recovery.json`,JSON.stringify({job_id:input.job_id,buyer_key:input.buyer_key,salt:input.salt,input_commitment:commitment,capability:funded.capability}),{mode:0o600});
    await request('/api/control',{job_id:input.job_id,action:'execute',capability:funded.capability});
    const end=Date.now()+210000;let job:Job;
    do{job=(await request<{job:Job}>(`/api/jobs?id=${input.job_id}`)).job;if(job.state==='settled'&&job.settlement==='refunded')break;await new Promise(r=>setTimeout(r,2000));}while(Date.now()<end);
    assert.equal(job.settlement,'refunded');assert.equal(job.outcome,kind==='faulty'?'rejected':'execution_error');
    if(kind==='faulty'){assert.equal(job.checks.find(c=>c.id==='amounts_preserved')?.passed,false);const opened=await openResult(job.result_ciphertext!,input.buyer_key,job.id,commitment);assert.equal(resultCommitment(opened.bytes,input.salt),job.result_commitment);assert.equal(opened.result.bank!.decisions.find(d=>d.payment_id==='PAY-02')!.status,'review');}
    cases.push({kind,job_id:job.id,outcome:job.outcome,settlement:job.settlement,receipt_url:new URL(`/jobs/${job.id}`,site).href});console.log('Bank rejection/refund verified:',kind,job.id);
  }
  assert.deepEqual(errors,[]);
  const evidence={success:true,checked_at:new Date().toISOString(),contract_id:deployment.contract_id,cases,encrypted_inference:true,model_signature_verified:true,independent_bank_checks:true,ambiguity_preserved:true,private_recovery_verified:true,public_receipt_excludes_plaintext:true,desktop_and_mobile_checked:true,page_errors:errors};
  await writeFile('reports/bank-live.json',JSON.stringify(evidence,null,2)+'\n');
  await writeFile('docs/bank-ai-example.json',JSON.stringify({schema:'sealwork.public-fictional-bank-example.v1',example_uses_fictional_data:true,model_evidence:own.bank_proof,proposal,...evidence},null,2)+'\n');
  console.log('Private AI analysis, acceptance, refunds, privacy and recovery passed.');
}finally{await browser.close();}
