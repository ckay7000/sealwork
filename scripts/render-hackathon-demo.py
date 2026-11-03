"""Rebuild an edited narrated walkthrough from genuine hosted UI screenshots.

Reads only the public storyboard and docs/demo-captures. It does not access
vaults, delivery recovery files, keys or private application configuration.
See docs/DEMO.md for model downloads, dependency versions and licensing.
"""
from pathlib import Path
import argparse,hashlib,json,math,re,subprocess,wave
import numpy as np
from PIL import Image,ImageDraw,ImageFont
import imageio_ffmpeg

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--model',type=Path,default=ROOT/'reports/demo/tts-model/kokoro-v1.0.onnx')
parser.add_argument('--voices',type=Path,default=ROOT/'reports/demo/tts-model/voices-v1.0.bin')
parser.add_argument('--mode',choices=['all','narrate','render'],default='all')
args=parser.parse_args()
story=json.loads((ROOT/'scripts/hackathon-demo-storyboard.json').read_text())
scenes=story['scenes']; settings=story['narration']; base=story['base']; theme=story['theme']
WORK=ROOT/'reports/hackathon-demo';WORK.mkdir(parents=True,exist_ok=True)
OUT=ROOT/'public/media';OUT.mkdir(parents=True,exist_ok=True)
FFMPEG=imageio_ffmpeg.get_ffmpeg_exe(); W,H,FPS=1920,1080,24
FONT=ROOT/'docs/video-tools/Manrope.ttf'
def font(size,bold=False):
 f=ImageFont.truetype(str(FONT),size)
 try:f.set_variation_by_axes([650 if bold else 450])
 except (OSError,AttributeError):pass
 return f
FONTS={}
def ft(size,bold=False):
 key=(size,bold)
 if key not in FONTS:FONTS[key]=font(size,bold)
 return FONTS[key]
def lines(text,width,size,bold=False):
 result=[];line=''
 for word in text.split():
  candidate=(line+' '+word).strip()
  if line and ft(size,bold).getlength(candidate)>width:result.append(line);line=word
  else:line=candidate
 if line:result.append(line)
 return result

def drawtext(draw,xy,text,size,color,width,bold=False,spacing=10):
 x,y=xy
 for line in lines(text,width,size,bold):draw.text((x,y),line,font=ft(size,bold),fill=color);y+=size+spacing
 return y

def stamp(t,sep='.'):
 ms=round(t*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}{sep}{ms%1000:03}'

if args.mode in ['all','narrate']:
 import onnxruntime as ort
 from kokoro_onnx import Kokoro
 opt=ort.SessionOptions();opt.intra_op_num_threads=2;opt.inter_op_num_threads=1
 session=ort.InferenceSession(str(args.model),sess_options=opt,providers=['CPUExecutionProvider'])
 speaker=Kokoro.from_session(session,str(args.voices))
 for i,scene in enumerate(scenes):
  spoken=scene['narration']
  for name,pron in sorted(settings['pronunciations'].items(),key=lambda x:-len(x[0])):
   spoken=re.sub(r'\b'+re.escape(name)+r'\b',pron,spoken)
  samples,rate=speaker.create(spoken,voice=settings['voice'],speed=settings['speed'],lang='en-us')
  assert np.isfinite(samples).all() and len(samples)>rate
  with wave.open(str(WORK/f'scene-{i}.wav'),'wb') as f:
   f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate);f.writeframes((np.clip(samples,-.999,.999)*32767).astype(np.int16).tobytes())
  print(f'Narrated {i+1}/{len(scenes)}: {len(samples)/rate:.1f}s',flush=True)
 if args.mode=='narrate':raise SystemExit(0)

samples=[];timings=[];cues=[];now=0
for i,scene in enumerate(scenes):
 with wave.open(str(WORK/f'scene-{i}.wav'),'rb') as f:
  rate=f.getframerate();assert f.getnchannels()==1
  raw=np.frombuffer(f.readframes(f.getnframes()),dtype=np.int16)
 start=now;voice_end=now+len(raw)/rate;now=voice_end+settings['pause_seconds']
 timings.append({'start':start,'voice_end':voice_end,'end':now,'shot':scene['shot']})
 samples.extend([raw,np.zeros(round(rate*settings['pause_seconds']),dtype=np.int16)])
 # Short readable captions with approximate proportional timing.
 words=scene['narration'].split();groups=[];line=[]
 for word in words:
  if len(' '.join(line+[word]))>100 and line:groups.append(' '.join(line));line=[]
  line.append(word)
 if line:groups.append(' '.join(line))
 total=sum(len(g.split()) for g in groups);cursor=start
 for g in groups:
  end=cursor+(voice_end-start)*len(g.split())/total;cues.append((cursor,end,g));cursor=end
with wave.open(str(WORK/'narration.wav'),'wb') as f:
 f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate);f.writeframes(np.concatenate(samples).tobytes())
subprocess.run([FFMPEG,'-y','-loglevel','error','-i',str(WORK/'narration.wav'),'-af','loudnorm=I=-16:TP=-1.5:LRA=11','-ar','48000',str(WORK/'normalized.wav')],check=True)
assert 80<now<190,f'Unexpected video duration {now}'

meta=json.loads((ROOT/'deployments/demo-capture.json').read_text());assert meta['status']=='passed'
shots={s['name']:s for s in meta['shots']}
IMAGES={s['shot']:Image.open(ROOT/shots[s['shot']]['file']).convert('RGB') for s in scenes}

# Crop toward a real measured UI element. Only pan/scale the actual screenshot.
def cropbox(shot,zoom):
 f=shots[shot]['focus'];iw,ih=IMAGES[shot].size;aspect=1404/812
 if f:
  cropw=min(iw,max(1060,f['width']+140,(f['height']+100)*aspect));cx=f['x']+f['width']/2;cy=f['y']+f['height']/2
 else:cropw=iw;cx=iw/2;cy=ih/2
 cropw/=zoom;croph=cropw/aspect
 x=max(0,min(iw-cropw,cx-cropw/2));y=max(0,min(ih-croph,cy-croph/2))
 return (x,y,x+cropw,y+croph)

def frame(index,elapsed,cue=None):
 scene=scenes[index];im=Image.new('RGB',(W,H),theme['background']);d=ImageDraw.Draw(im)
 d.text((48,28),story['name'].lower()+'.',font=ft(38,True),fill=theme['accent'])
 d.text((270,40),'NEAR HACKATHON 2026  /  REAL TESTNET WALKTHROUGH',font=ft(18,True),fill=theme['ink'])
 d.text((1450,40),f'STEP {index+1:02} / {len(scenes):02}',font=ft(18,True),fill=theme['ink'])
 d.line((48,98,1872,98),fill=theme['soft'],width=2)
 y=drawtext(d,(48,153),scene['title'],42,theme['ink'],330,True,12)
 y+=36;d.rounded_rectangle((48,y,378,y+160),radius=15,fill=theme['soft'])
 drawtext(d,(70,y+22),scene['result'],26,theme['accent'],286,True)
 drawtext(d,(48,685),'Fictional sample data\nGenuine hosted UI captures'.replace('\n',' · '),20,theme['ink'],322,False,10)
 drawtext(d,(48,786),'Edited walkthrough. Waiting time is omitted.',18,theme['ink'],315)
 drawtext(d,(48,873),'facet-near.vercel.app' if story['name']=='Facet' else 'sealwork.vercel.app',18,theme['accent'],340,True)
 zoom=1+0.045*min(1,elapsed/7)
 ui=IMAGES[scene['shot']].crop(cropbox(scene['shot'],zoom)).resize((1404,812),Image.Resampling.LANCZOS)
 d.rounded_rectangle((421,123,1878,951),radius=13,fill='#cbd1da')
 im.paste(ui,(436,131));d=ImageDraw.Draw(im)
 d.rounded_rectangle((48,971,1872,1060),radius=13,fill=theme['ink'])
 if cue:
  ls=lines(cue,1760,27);y=984 if len(ls)>1 else 1000
  for line in ls:
   width=ft(27).getlength(line);d.text(((W-width)/2,y),line,font=ft(27),fill='#ffffff');y+=35
 d.rectangle((48,1069,48+1824*(timings[index]['start']+elapsed)/now,1074),fill=theme['accent'])
 return im

command=[FFMPEG,'-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','pipe:0','-i',str(WORK/'normalized.wav'),'-c:v','libx264','-threads','2','-preset','fast','-crf','22','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart','-shortest',str(OUT/(base+'.mp4'))]
encoder=subprocess.Popen(command,stdin=subprocess.PIPE);index=0;ci=0;last=-1
try:
 for n in range(math.ceil(now*FPS)):
  t=n/FPS
  while index<len(scenes)-1 and t>=timings[index]['end']:index+=1
  while ci<len(cues)-1 and t>=cues[ci][1]:ci+=1
  cue=cues[ci][2] if cues[ci][0]<=t<=cues[ci][1] else None
  if index!=last:print(f'Rendering scene {index+1}/{len(scenes)}',flush=True);last=index
  encoder.stdin.write(frame(index,t-timings[index]['start'],cue).tobytes())
 encoder.stdin.close();assert encoder.wait()==0
except BaseException:encoder.kill();raise
poster_index=4 if story['name']=='Facet' else 3
frame(poster_index,3,scenes[poster_index]['narration'].split('.')[0]+'.').save(OUT/(base+'-poster.jpg'),quality=92)
vtt=['WEBVTT\n'];srt=[]
for i,(a,b,c) in enumerate(cues):
 vtt.append(f'{stamp(a)} --> {stamp(b)}\n{c}\n');srt.append(f'{i+1}\n{stamp(a,",")} --> {stamp(b,",")}\n{c}\n')
(OUT/(base+'.vtt')).write_text('\n'.join(vtt));(OUT/(base+'.srt')).write_text('\n'.join(srt))
report={'project':story['name'],'duration_seconds':round(now,2),'width':W,'height':H,'fps':FPS,'video_codec':'H264','audio_codec':'AAC','faststart':True,'narrated':True,'burned_in_captions':True,'caption_files':['vtt','srt'],'caption_timing':'Proportional phrase timing within each narrated scene','source':'Edited real hosted screenshots; not an uninterrupted screen recording','capture_evidence':'deployments/demo-capture.json','fictional_data':True,'voice':settings,'shots':[s['shot'] for s in scenes],'scene_timing':timings,'bytes':(OUT/(base+'.mp4')).stat().st_size,'sha256':hashlib.sha256((OUT/(base+'.mp4')).read_bytes()).hexdigest()}
(ROOT/'deployments/demo-video.json').write_text(json.dumps(report,indent=2)+'\n')
print(f'Completed {story["name"]}: {now:.1f}s, {report["bytes"]} bytes',flush=True)
