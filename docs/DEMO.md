# Sealwork product film

[Watch or download the MP4](https://sealwork.vercel.app/media/sealwork-demo.mp4).

The film is 54.17 seconds, 1920×1080 at 30 fps, with narration, burned-in captions, an optional WebVTT caption track, and an original ambient score. It combines illustrative diagrams with captures of actual public NEAR testnet receipts. The records are fictional sample finance data.

## Transcript

AI agents are starting to hire other agents. But with financial records, who sees the files?

Who checks the work? And what happens when a trusted agent changes its code?

As adoption grows, those risks multiply with every job. Marketplaces hold payments. Private compute protects execution. Businesses need both, with enforceable rules.

Meet Sealwork. Set your constraints. An AI hiring agent selects an exact worker build. Your files are encrypted before upload.

An independent verifier checks the delivery. Passing work gets paid. Failed or late work returns the job budget. Every outcome follows the code that ran.

NEAR's asynchronous contracts coordinate OutLayer's private compute with programmable payments. Sealwork. Private work. Proof before payment.

## Claims and evidence

- [Agent Market payment rules](https://docs.market.near.ai/concepts/payments-and-disputes.md) describe held payments and buyer acceptance/disputes. The film does not claim that every competing product lacks privacy or verification.
- [OutLayer documentation](https://app.outlayer.ai/docs/getting-started) describes hash-pinned TEE computation and NEAR yield/resume callbacks. Sealwork implements the application agreement, independent acceptance checks, escrow, and build-specific outcomes.
- The captured [accepted](https://sealwork.vercel.app/jobs/sw_ce7958686c9d77b5d5ec8cbe8d1d4665), [rejected](https://sealwork.vercel.app/jobs/sw_1ef36ea1ae0d2f6baf70479dc0908088), and [timeout](https://sealwork.vercel.app/jobs/sw_aac248e432b800d6f6c63f8dab54c4a8) receipts are genuine testnet outcomes.
- NEAR provides a suitable combination of asynchronous contracts, programmable settlement and OutLayer infrastructure. The film makes no claim that the system is impossible on another chain.
- “Job budget returned” excludes consumed execution fees and persistent storage costs, as explained in the README.
- The AI hiring scene illustrates the optional procurement workflow. It requires a configured model API key; live inference was not verified when this film was rendered. Financial files and payment keys are not model input. Worker execution is attested; the offchain planning model is not represented as attested.

## Reproduce the film

The storyboard is in `scripts/demo-storyboard.json`; rendering code is `scripts/render-demo.py`. Install the Python packages in `scripts/demo-requirements.txt`. Place narration segments and the OFL-licensed Manrope/DM Sans fonts under ignored `reports/demo/`, then capture receipts and render:

```bash
npm run test:e2e -- --config=scripts/demo-capture.config.ts
python3 scripts/render-demo.py
```

The narration was synthesized from the public transcript using the free Google Translate speech endpoint. The score is generated locally by the renderer. The font licenses are retained in `public/licenses/`. No customer files, private recovery material, or credentials are used to render the film.
