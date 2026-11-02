import { checkPublicReceipt } from '../shared/receipt-check';
import deployment from '../deployments/testnet.json' with { type: 'json' };
const args = process.argv.slice(2);
const argument = (name: string, fallback: string) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1] || ''; };
if (!args[0] || args.includes('--help')) {
  console.log('Read-only receipt check. No wallet or private key is needed.\n\nnode --import tsx scripts/verify-receipt.ts JOB_ID [--contract ACCOUNT.testnet] [--json]\n\nReads final NEAR state and hashes published worker/verifier bytes. It does not rerun private work or verify hardware quotes.');
} else {
  try {
    const report = await checkPublicReceipt({ jobId: args[0], contractId: argument('--contract', deployment.contract_id), rpcUrl: argument('--rpc', deployment.rpc_url), siteUrl: argument('--site', 'https://sealwork.vercel.app') });
    if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else { console.log(`NEAR block ${report.block_height}\n${report.job_id}: ${report.outcome} / ${report.settlement}\n`); for (const c of report.checks) console.log(`${c.passed ? 'PASS' : 'FAIL'}  ${c.label}`); console.log('\n'+report.scope); }
    if (!report.passed) process.exitCode = 1;
  } catch (e) { console.error((e as Error).message); process.exitCode = 1; }
}
