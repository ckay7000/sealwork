# Sealwork product film

[Watch or download the MP4](https://sealwork.vercel.app/media/sealwork-demo.mp4?v=3).

The film is approximately 52 seconds, 1920×1080 at 30 fps, with narration, burned-in captions, an optional WebVTT caption track, and an original ambient score. It combines illustrative diagrams with captures of actual public NEAR testnet receipts. The records are fictional sample finance data.

The revised audio uses Kokoro's neural `af_heart` voice, generated locally at a calmer pace. Names and initials have explicit pronunciation hints. Dialogue is normalized to -16 LUFS, scene boundaries leave a 0.65-second pause, and the music is lowered beneath the speech. There is no post-production speech speed-up or paid inference request.

## Transcript

AI agents are starting to handle our financial records. But who can see the files?

Who checks the work? And when an agent changes its code, does its old reputation still count?

As agent adoption grows, so do these risks. Private computing and payment marketplaces solve different parts.

Meet Sealwork. Private AI matches messy bank payments to invoices, explains the evidence, and flags uncertainty.

Approve the proposal. An independent verifier checks the records and allocations. Correct reports get paid. Failed or late work returns the job budget.

NEAR combines confidential AI, OutLayer execution, and programmable payments. Every build earns its own record. Sealwork. Proof before payment.

## Claims and evidence

- [Agent Market payment rules](https://docs.market.near.ai/concepts/payments-and-disputes.md) describe held payments and buyer acceptance/disputes. The film does not claim that every competing product lacks privacy or verification.
- [OutLayer documentation](https://app.outlayer.ai/docs/getting-started) describes hash-pinned TEE computation and NEAR yield/resume callbacks. Sealwork implements the application agreement, independent acceptance checks, escrow, and build-specific outcomes.
- The captured [accepted](https://sealwork.vercel.app/jobs/sw_61d5c23989d10f9d1c7271265fc329ad), [rejected](https://sealwork.vercel.app/jobs/sw_cd527cf5498aca5edb472294ca72ade1), and [timeout](https://sealwork.vercel.app/jobs/sw_23a46154077f9c6cfc1c3a8fc930f76f) receipts are genuine testnet outcomes.
- NEAR provides a suitable combination of asynchronous contracts, programmable settlement and OutLayer infrastructure. The film makes no claim that the system is impossible on another chain.
- “Job budget returned” excludes consumed execution fees and persistent storage costs, as explained in the README.
- The financial AI scene illustrates the tested encrypted bank-matching workflow. A real NEAR AI response signature was verified before its proposal was approved and the report was [independently checked and paid](https://sealwork.vercel.app/jobs/sw_61d5c23989d10f9d1c7271265fc329ad). The sample combined payment and ambiguous payment are fictional. [Evidence and decisions](bank-ai-example.json) and [trust boundaries](PRIVATE_AI.md) describe the separate inference charge, buyer review, shared model keys, and deterministic verifier.

## Reproduce the film

The storyboard and pronunciation hints are in `scripts/demo-storyboard.json`. Install the Python packages in `scripts/demo-requirements.txt`. Download [Kokoro v1.0](https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx) and [its voices](https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin) into ignored `reports/demo/tts-model/`. Place the OFL-licensed Manrope/DM Sans fonts under ignored `reports/demo/`, then generate narration, capture receipts, and render:

```bash
python3 scripts/narrate-demo.py
npm run test:e2e -- --config=scripts/demo-capture.config.ts
python3 scripts/render-demo.py
```

The narration is generated locally using the [Apache-2.0 Kokoro model](https://huggingface.co/hexgrad/Kokoro-82M) and the [MIT-licensed kokoro-onnx library](https://github.com/thewh1teagle/kokoro-onnx). Model files and intermediate audio remain ignored. The score is generated locally by the renderer. The font licenses are retained in `public/licenses/`. No customer files, private recovery material, or credentials are used to render the film.
