"""Generate the public film's voice locally, with no API key or inference bill.

Download Kokoro v1.0 and voices-v1.0.bin into ignored reports/demo/tts-model
as described in docs/DEMO.md. Only the public storyboard is read.
"""
from pathlib import Path
import hashlib
import json
import re
import wave

import numpy as np
import onnxruntime as ort
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "reports/demo"
storyboard = json.loads((ROOT / "scripts/demo-storyboard.json").read_text())
settings = storyboard["narration"]
model = WORK / "tts-model/kokoro-v1.0.onnx"
voices = WORK / "tts-model/voices-v1.0.bin"
options = ort.SessionOptions()
options.intra_op_num_threads = 2
options.inter_op_num_threads = 1
session = ort.InferenceSession(str(model), sess_options=options, providers=["CPUExecutionProvider"])
narrator = Kokoro.from_session(session, str(voices))
(WORK / "audio").mkdir(parents=True, exist_ok=True)
report = {"model": settings["model"], "voice": settings["voice"], "speed": settings["speed"],
          "model_sha256": hashlib.sha256(model.read_bytes()).hexdigest(),
          "voices_sha256": hashlib.sha256(voices.read_bytes()).hexdigest(),
          "local_inference": True, "paid_api_requests": 0, "scenes": []}
for index, line in enumerate(storyboard["scenes"]):
    spoken = line
    for name, pronunciation in settings["pronunciations"].items():
        spoken = re.sub(r"\b" + re.escape(name) + r"\b", pronunciation, spoken)
    samples, rate = narrator.create(spoken, voice=settings["voice"], speed=settings["speed"], lang="en-us")
    assert np.isfinite(samples).all() and len(samples) > rate, "Narration is missing or invalid."
    with wave.open(str(WORK / f"audio/scene-{index}.wav"), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes((np.clip(samples, -.999, .999) * 32767).astype(np.int16).tobytes())
    seconds = len(samples) / rate
    report["scenes"].append({"index": index, "seconds": seconds, "transcript": line})
    print(f"Narrated scene {index + 1}/6: {seconds:.2f}s", flush=True)
report["speech_seconds"] = sum(scene["seconds"] for scene in report["scenes"])
report["film_seconds"] = report["speech_seconds"] + len(report["scenes"]) * settings["scene_pause_seconds"]
assert report["film_seconds"] < 59, "Shorten the script to keep natural speech under a minute."
(WORK / "narration-report.json").write_text(json.dumps(report, indent=2) + "\n")
print(f"Narration complete: {report['film_seconds']:.2f}s including pauses.", flush=True)
