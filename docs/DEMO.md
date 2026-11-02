# Sealwork: practical hackathon demo

## Fresh uninterrupted recordings

- **Paid bank job:** https://sealwork.vercel.app/media/sealwork-live-paid.mp4
- **Faulty worker refund:** https://sealwork.vercel.app/media/sealwork-live-refund.mp4

Each video shows one fresh job from creation to outcome and a successful direct NEAR receipt check. They are separate continuous screen recordings, with natural waiting time preserved. Explanatory overlays were visible during capture; local synthetic narration was added afterward. No video cuts or speed changes are applied. All financial data is fictional. Browser actions are automated with Playwright.

The [paid receipt](https://sealwork.vercel.app/jobs/sw_0d581be7aa22c51183f620896a188c16) and [refunded receipt](https://sealwork.vercel.app/jobs/sw_aa52b5907359ecd885e1a239a87ace6b) belong to these fresh runs. [Paid capture](../deployments/continuous-accepted-capture.json) and [refund capture](../deployments/continuous-rejected-capture.json) preserve timelines, public receipts, checker reports and raw recording hashes. [Paid video metadata](../deployments/continuous-accepted-video.json) and [refund video metadata](../deployments/continuous-rejected-video.json) give duration, output hashes and narration timing. Private recovery contents are excluded.

English captions: [paid](../public/media/sealwork-live-paid.vtt), [refund](../public/media/sealwork-live-refund.vtt). You can choose either fresh recording in the homepage demo player.

### Record and package another continuous run

Install Playwright Chromium and FFmpeg with `npx playwright install chromium ffmpeg`. Then run `node --import tsx scripts/record-live-demo.ts accepted` or `rejected`. This creates a genuine sponsored testnet job and writes the raw recording and public report under ignored `reports/continuous-demo/`. It consumes testnet sponsorship and, for the bank flow, private inference credits. Use your own configured deployment through `DEMO_BASE_URL` when appropriate.

Copy a successful public capture report to `deployments/continuous-accepted-capture.json` or `continuous-rejected-capture.json`. Install the Python requirements and Kokoro model described below, then run:

```bash
python3 scripts/package-continuous-demo.py accepted --input reports/continuous-demo/accepted-raw.webm
python3 scripts/package-continuous-demo.py rejected --input reports/continuous-demo/rejected-raw.webm
```

The packager verifies the raw video hash and adds narration to the unchanged continuous video. A new capture needs a narration timeline appropriate to its measured stages. This recording is not an independent audit or evidence of real customer adoption.

## Explained overview

[Watch/download the video](https://sealwork.vercel.app/media/sealwork-hackathon-demo.mp4) · [English captions](../public/media/sealwork-hackathon-demo.vtt) · [Subtitle file](../public/media/sealwork-hackathon-demo.srt) · [Poster](../public/media/sealwork-hackathon-demo-poster.jpg).

This is a narrated, captioned walkthrough assembled from **genuine screenshots of the hosted application**, with small pans and zooms for readability. It is not an uninterrupted screen recording. Waiting time between real operations is omitted. All documents, claims and finance records are fictional demo data.

The capture script used Playwright against the public app. [Capture provenance](../deployments/demo-capture.json) records each screenshot’s source URL, time, measured focus rectangle and SHA-256, plus the real underlying transaction or job evidence. No vault password, holder seed or private delivery recovery file is included. [Render report](../deployments/demo-video.json) gives actual duration, resolution, codecs, timeline and file hash.

## Watch the action and result

| Step | Visible action/result | Real capture |
| --- | --- | --- |
| 1 | Choose task → fictional bank records | [01-bank-job](demo-captures/01-bank-job.jpg) |
| 2 | Ask agent → reviewed build | [02-hiring-decision](demo-captures/02-hiring-decision.jpg) |
| 3 | Review → encrypted inference input | [03-private-records](demo-captures/03-private-records.jpg) |
| 4 | Analyze → $900 = $500 + $400 | [04-ai-bank-proposal](demo-captures/04-ai-bank-proposal.jpg) |
| 5 | Review proposal → approve checks | [05-acceptance-rules](demo-captures/05-acceptance-rules.jpg) |
| 6 | Approve → fixed 0.050 testnet NEAR | [06-job-budget](demo-captures/06-job-budget.jpg) |
| 7 | Execute → verified and settled | [07-paid-receipt](demo-captures/07-paid-receipt.jpg) |
| 8 | Decrypt → matches and open items | [08-checked-private-result](demo-captures/08-checked-private-result.jpg) |
| 9 | Inspect → worker and verifier hashes | [09-attestation-checks](demo-captures/09-attestation-checks.jpg) |
| 10 | Another page → encrypted delivery | [10-encrypted-public-delivery](demo-captures/10-encrypted-public-delivery.jpg) |
| 11 | Import private recovery → readable report | [11-recovered-private-delivery](demo-captures/11-recovered-private-delivery.jpg) |
| 12 | Earlier faulty job → rejected and refunded | [12-rejected-refunded](demo-captures/12-rejected-refunded.jpg) |

## Narration transcript

A business receives nine hundred dollars covering two invoices. Sealwork helps match those private records and pays the worker only after the agreed checks pass.

I ask the hiring agent to choose within my rules. It uses public build history, recommends a reviewed executable, and cannot change my budget or payment destination.

I review the fictional invoices and bank records. The bank-analysis path encrypts the private input for NEAR AI Cloud, separately from the public hiring decision.

The live private model proposes allocating nine hundred dollars across five hundred and four hundred dollar invoices. The ambiguous two hundred fifty dollar payment stays Needs review.

I review the proposed matches and acceptance rules before funding. The model’s suggestion is only a proposal. A separate deterministic verifier will check the original records.

The worker fee is zero point zero five testnet NEAR. It pays for processing; it does not move the fictional bank payment. I approve the pinned-build agreement.

The worker and separate verifier execute privately through OutLayer. The checks pass, NEAR escrow settles the fee, and the receipt now says Verified and paid.

I can inspect the checked private report. The combined payment matches, and the ambiguous item remains open. The public receipt excludes the plaintext financial records.

Both execution records identify the agreed binary fingerprints. NEAR holds the budget, processes authenticated callbacks and records the outcome. Full hardware evidence is linked for inspection.

Opening the same receipt in a separate page shows encrypted delivery. Public visitors can inspect settlement and evidence, but they cannot read the private report.

Importing the private recovery file restores access to the report. Keep that file private. Its access material is excluded from the repository and this demo evidence.

Finally, this genuine earlier faulty-build receipt is rejected and refunded. Its failure belongs to that code version. Sealwork combines confidential work, independent checks and conditional NEAR payment.

## Rebuild the video

Use Python 3.11 or newer. Install `scripts/hackathon-demo-requirements.txt` in a virtual environment. Download [Kokoro v1.0](https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx) and [voices-v1.0.bin](https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin) into ignored `reports/demo/tts-model/`.

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r scripts/hackathon-demo-requirements.txt
python3 scripts/render-hackathon-demo.py
```

The renderer reads only the public storyboard, screenshots and OFL-licensed Manrope font in `docs/video-tools/`. Kokoro narration runs locally without a paid API. Intermediate audio and model files remain ignored. Final output is 1920×1080 H264/AAC, with faststart, burned-in captions, WebVTT and SRT. Subtitle timing is proportional within each narrated scene. The [Apache-2.0 Kokoro model](https://huggingface.co/hexgrad/Kokoro-82M), [MIT kokoro-onnx library](https://github.com/thewh1teagle/kokoro-onnx) and font retain their own licenses.

To use other model-file locations, pass `--model` and `--voices`. To reuse generated narration, pass `--mode render`. The storyboard contains pronunciation hints and source-shot names. Capture provenance describes the test run; video rendering itself does not sign transactions or access private application data.

The accepted job was created during this capture. The final rejected/refunded receipt is an explicitly labeled genuine earlier faulty-build example. Balanced hiring selected reviewed Archivist 2.0 without claiming previous accepted history. The worker fee is separate from the fictional bank amount. [Original 52-second promotional clip](PROMO_VIDEO.md) is preserved.

## Capture a new real run

```bash
npx playwright install chromium
node --import tsx scripts/capture-hackathon-demo.ts
```

This deliberately creates real sponsored **testnet** records/jobs and, for Sealwork, uses private inference credits. It writes only screenshots and public evidence. It does not export private vault backups or delivery recovery material. Set `DEMO_BASE_URL` to your own configured deployment if desired. A sandbox that cannot launch Chromium needs a browser-capable host. After a new capture, render again so the video and capture hashes match.
