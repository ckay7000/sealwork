"""Add local narration to a continuous recording without cutting video or waiting time.

See docs/DEMO.md for dependency and Kokoro model setup. The raw input must match
its public capture report. No keys or service credentials are used by this script.
"""
from pathlib import Path
import argparse, hashlib, json, re, subprocess, wave
import imageio_ffmpeg
import numpy as np
import onnxruntime as ort
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('scenario', choices=['accepted', 'rejected'])
parser.add_argument('--input', type=Path, required=True)
parser.add_argument('--model', type=Path, default=ROOT/'reports/demo/tts-model/kokoro-v1.0.onnx')
parser.add_argument('--voices', type=Path, default=ROOT/'reports/demo/tts-model/voices-v1.0.bin')
args = parser.parse_args()
report = json.loads((ROOT/f'deployments/continuous-{args.scenario}-capture.json').read_text())
assert report['status'] == 'passed'
assert hashlib.sha256(args.input.read_bytes()).hexdigest() == report['video_sha256']
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
probe = subprocess.run([ffmpeg, '-i', str(args.input)], capture_output=True, text=True)
match = re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)', probe.stderr)
assert match
duration = round(int(match[1])*3600 + int(match[2])*60 + float(match[3]), 3)
work = ROOT/f'reports/continuous-demo/{args.scenario}'; work.mkdir(parents=True, exist_ok=True)
out = ROOT/'public/media'; out.mkdir(exist_ok=True)
slug = 'sealwork-live-paid' if args.scenario == 'accepted' else 'sealwork-live-refund'
opt = ort.SessionOptions(); opt.intra_op_num_threads = 2; opt.inter_op_num_threads = 1
session = ort.InferenceSession(str(args.model), sess_options=opt, providers=['CPUExecutionProvider'])
speaker = Kokoro.from_session(session, str(args.voices))
texts = json.loads((ROOT/'scripts/continuous-demo-narration.json').read_text())[args.scenario]
timeline = report['timeline']; assert len(texts) == len(timeline)
rate = 24000; audio = np.zeros(round(duration*rate), dtype=np.float32); captions = []
for i, (text, event) in enumerate(zip(texts, timeline)):
    start = event['at_seconds']; end = timeline[i+1]['at_seconds'] if i+1 < len(timeline) else duration
    room = max(.5, end-start-.12)
    samples, actual_rate = speaker.create(text, voice='af_heart', speed=1.05, lang='en-us')
    assert actual_rate == rate and np.isfinite(samples).all()
    if len(samples)/rate > room:
        speed = min(1.5, 1.05 * (len(samples)/rate)/room * 1.03)
        samples, actual_rate = speaker.create(text, voice='af_heart', speed=speed, lang='en-us')
    assert len(samples)/rate <= room, f'Shorten narration {i} to fit the unchanged recording.'
    first = round(start*rate); audio[first:first+len(samples)] = samples
    captions.append({'start': start, 'end': start+len(samples)/rate, 'text': text})
    print(f'Narrated {args.scenario} {i+1}/{len(texts)}', flush=True)
wav = work/'narration.wav'
with wave.open(str(wav), 'wb') as f:
    f.setnchannels(1); f.setsampwidth(2); f.setframerate(rate)
    f.writeframes((np.clip(audio, -.999, .999)*32767).astype(np.int16).tobytes())
mp4 = out/f'{slug}.mp4'
subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-i', str(args.input), '-i', str(wav), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'fast', '-crf', '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-t', str(duration), str(mp4)], check=True)
def timestamp(value):
    ms = round(value*1000)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}.{ms%1000:03}'
(out/f'{slug}.vtt').write_text('WEBVTT\n\n'+'\n\n'.join(f"{timestamp(c['start'])} --> {timestamp(c['end'])}\n{c['text']}" for c in captions)+'\n')
poster_time = next(e['at_seconds']+2 for e in timeline if 'checks passed' in e['text'] or 'separate checker rejected' in e['text'])
subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-ss', str(poster_time), '-i', str(mp4), '-frames:v', '1', str(out/f'{slug}-poster.jpg')], check=True)
evidence = {'schema': 'sealwork.continuous-demo.v1', 'scenario': args.scenario, 'capture_report': f'deployments/continuous-{args.scenario}-capture.json', 'job_id': report['receipt']['job']['id'], 'duration_seconds': duration, 'width': 1280, 'height': 800, 'video_processing': 'Continuous input video transcoded to H264; no cuts, speed changes or skipped waits. Local synthetic narration added. Explanatory overlay was present during capture.', 'source_webm_sha256': report['video_sha256'], 'file': f'public/media/{slug}.mp4', 'sha256': hashlib.sha256(mp4.read_bytes()).hexdigest(), 'bytes': mp4.stat().st_size, 'narration': {'model': 'Kokoro-82M v1.0', 'voice': 'af_heart', 'captions': captions}}
(ROOT/f'deployments/continuous-{args.scenario}-video.json').write_text(json.dumps(evidence, indent=2)+'\n')
print('Packaged unchanged continuous recording:', slug, duration, 'seconds', flush=True)
