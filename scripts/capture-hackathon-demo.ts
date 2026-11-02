// Creates real sponsored testnet actions. Use fictional data; see docs/DEMO.md.
import { chromium } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { captureSealwork } from './demo-capture/sealwork.js';
const browser=await chromium.launch({headless:true});
try{
 const report=await captureSealwork(browser);
 if(report.status!=='passed')throw new Error('Capture failed at '+report.stage+': '+report.error);
 await mkdir('docs/demo-captures',{recursive:true});
 for(const shot of report.shots as any[]){const bytes=Buffer.from(shot.data,'base64');delete shot.data;shot.file='docs/demo-captures/'+shot.name+'.jpg';shot.sha256=createHash('sha256').update(bytes).digest('hex');await writeFile(shot.file,bytes);}
 await writeFile('deployments/demo-capture.json',JSON.stringify(report,null,2)+'\n');
 console.log('Real capture passed:',report.shots.length,'screenshots; private access material excluded.');
}finally{await browser.close();}
