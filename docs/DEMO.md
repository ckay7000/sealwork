# Sealwork product film

[Watch or download the MP4](https://sealwork.vercel.app/media/sealwork-demo.mp4?v=2).

The film is approximately 50 seconds, 1920×1080 at 30 fps, with narration, burned-in captions, an optional WebVTT caption track, and an original ambient score. It combines illustrative diagrams with captures of actual public NEAR testnet receipts. The records are fictional sample finance data.

The revised audio uses Kokoro's neural `af_heart` voice, generated locally at a calmer pace. Names and initials have explicit pronunciation hints. Dialogue is normalized to -16 LUFS, scene boundaries leave a 0.65-second pause, and the music is lowered beneath the speech. There is no post-production speech speed-up or paid inference request.

## Transcript

AI agents are starting to handle our financial records. But who can see the files?

Who checks the work? And when an agent changes its code, does its old reputation still count?

As more businesses use agents, these risks grow. Private computing and payment marketplaces solve different parts. Businesses need both, with clear rules.

Meet Sealwork. Your agent picks a specific worker version. Your files are encrypted before upload.

A separate verifier checks the result. Correct work gets paid. Failed or late work returns the job budget. Each version earns its own reputation.

NEAR connects private work with automatic payments through OutLayer. Sealwork. Private work. Proof before payment.

## Claims and evidence

- [Agent Market payment rules](https://docs.market.near.ai/concepts/payments-and-disputes.md) describe held payments and buyer acceptance/disputes. The film does not claim that every competing product lacks privacy or verification.
- [OutLayer documentation](https://app.outlayer.ai/docs/getting-started) describes hash-pinned TEE computation and NEAR yield/resume callbacks. Sealwork implements the application agreement, independent acceptance checks, escrow, and build-specific outcomes.
- The captured [accepted](https://sealwork.vercel.app/jobs/sw_ce7958686c9d77b5d5ec8cbe8d1d4665), [rejected](https://sealwork.vercel.app/jobs/sw_1ef36ea1ae0d2f6baf70479dc0908088), and [timeout](https://sealwork.vercel.app/jobs/sw_aac248e432b800d6f6c63f8dab54c4a8) receipts are genuine testnet outcomes.
- NEAR provides a suitable combination of asynchronous contracts, programmable settlement and OutLayer infrastructure. The film makes no claim that the system is impossible on another chain.
- “Job budget returned” excludes consumed execution fees and persistent storage costs, as explained in the README.
- The AI hiring scene illustrates the optional procurement workflow. After the film was rendered, real NEAR AI Cloud hiring passed through [verified delivery and payment](https://sealwork.vercel.app/jobs/sw_24aa8e6a85d9bc9f74f49d50b678e093); its [sample planning trace](ai-hiring-example.json) is available. Financial files and payment keys are not model input. Worker execution is attested; the offchain planning model is not represented as attested.

## Reproduce the film

The storyboard and pronunciation hints are in `scripts/demo-storyboard.json`. Install the Python packages in `scripts/demo-requirements.txt`. Download [Kokoro v1.0](https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx) and [its voices](https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin) into ignored `reports/demo/tts-model/`. Place the OFL-licensed Manrope/DM Sans fonts under ignored `reports/demo/`, then generate narration, capture receipts, and render:

```bash
python3 scripts/narrate-demo.py
npm run test:e2e -- --config=scripts/demo-capture.config.ts
python3 scripts/render-demo.py
```

The narration is generated locally using the [Apache-2.0 Kokoro model](https://huggingface.co/hexgrad/Kokoro-82M) and the [MIT-licensed kokoro-onnx library](https://github.com/thewh1teagle/kokoro-onnx). Model files and intermediate audio remain ignored. The score is generated locally by the renderer. The font licenses are retained in `public/licenses/`. No customer files, private recovery material, or credentials are used to render the film.
