import {test,expect} from '@playwright/test';
import {x25519} from '@noble/curves/ed25519.js';
import {hex} from '../../shared/crypto';
import built from '../../deployments/builds.json' with {type:'json'};

test('a bookkeeper resolves an ambiguous receipt and must approve the changed batch',async({page})=>{
  const builds=built.builds.filter(b=>b.feature!=='verifier').map(b=>({...b,wasm_url:`/wasm/${b.hash}.wasm`,created_at:'0',accepted:1,rejected:0,timed_out:0,execution_errors:0,earned:'0'}));
  await page.route('**/api/config',route=>route.fulfill({json:{ready:true,network:'testnet',contract_id:built.contract_id,buyer_id:'buyer.sealwork-next-1103.testnet',project_id:built.project_id,encryption_public_key:hex(x25519.getPublicKey(new Uint8Array(32).fill(17))),budget:'50000000000000000000000',builds,jobs:[],bank_supported:true,private_ai:{ready:false},planner:{ready:false},create_challenge:'synthetic-browser-challenge'}}));
  await page.goto('/new?task=bank');
  await page.getByRole('button',{name:'Suggest exact matches locally'}).click();
  await expect(page.getByRole('status').filter({hasText:'Local exact-match suggestions ready'})).toBeVisible();
  const fern=page.locator('.reconciliation-review .bank-decision').filter({hasText:'PAY-02'});
  await expect(fern).toContainText('Needs review');
  await page.getByLabel('I reviewed the proposed matches').check();
  await expect(page.getByRole('button',{name:'Encrypt & fund the job'})).toBeEnabled();
  await fern.getByRole('button',{name:'Review allocation'}).click();
  await page.getByLabel('Invoice for allocation 1 of PAY-02').selectOption('FERN-1');
  await page.getByLabel('Why does this receipt belong to these invoices?').fill('The bookkeeper checked the remittance reference for FERN-1.');
  await fern.getByRole('button',{name:'Apply reviewed allocation'}).click();
  await expect(fern).toContainText('Proposed match');
  await expect(fern).toContainText('FERN-1');
  await expect(page.getByLabel('I reviewed the proposed matches')).not.toBeChecked();
  await expect(page.getByRole('button',{name:'Encrypt & fund the job'})).toBeDisabled();
  await fern.getByRole('button',{name:'Keep unresolved'}).click();
  await expect(fern).toContainText('Needs review');
  await expect(page.locator('.reconciliation-totals')).toContainText('349.00');
});
