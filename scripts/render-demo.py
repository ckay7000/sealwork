"""Render Sealwork's narrated, captioned marketing film from actual receipt captures.

Inputs: scripts/demo-storyboard.json, ignored audio/scene-{0..5}.wav, licensed
Manrope.ttf and DMSans.ttf, and stills/{accepted,rejected,timeout}.png.
Output: public/media/sealwork-demo.mp4, poster.jpg and captions.vtt.
No private configuration, recovery data, or signing keys are read.
"""
from pathlib import Path
import json, math, subprocess, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "reports/demo"
OUT = ROOT / "public/media"
OUT.mkdir(parents=True, exist_ok=True)
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
W, H, FPS = 1920, 1080, 30
PAPER, GREEN, MINT, LIME, INK = "#f6f7f3", "#194c3c", "#e7eee1", "#d6e6bb", "#23372d"
RED = "#a64b41"
STORYBOARD = json.loads((ROOT / "scripts/demo-storyboard.json").read_text())
SCENES = STORYBOARD["scenes"]
fonts = {}
def font(size, weight=500, heading=False):
    key = size, weight, heading
    if key not in fonts:
        f = ImageFont.truetype(str(WORK / ("Manrope.ttf" if heading else "DMSans.ttf")), size)
        f.set_variation_by_axes([weight] if heading else [14, weight])
        fonts[key] = f
    return fonts[key]
def text(draw, xy, value, size=32, fill=INK, weight=500, heading=False, spacing=15):
    draw.multiline_text(xy, value, font=font(size, weight, heading), fill=fill, spacing=spacing)
def wrap(value, max_width, size=32):
    f = font(size); lines, line = [], ""
    for word in value.split():
        candidate = f"{line} {word}".strip()
        if f.getlength(candidate) > max_width and line: lines.append(line); line = word
        else: line = candidate
    if line: lines.append(line)
    return lines
def panel(draw, box, fill="white", outline=None, radius=25):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=2)
def check(draw, x, y, color=GREEN, scale=1):
    draw.line([(x, y+12*scale),(x+9*scale,y+21*scale),(x+28*scale,y)], fill=color, width=max(3,int(5*scale)))
def brand(draw, x=96, y=62, dark=False, size=36):
    c = LIME if dark else GREEN
    draw.regular_polygon((x+19,y+23,23),6,rotation=30,fill=c)
    check(draw,x+8,y+11,GREEN if dark else PAPER,.75)
    text(draw,(x+54,y),"sealwork.",size,c,750,True)
def pill(draw, x, y, value, dark=False):
    width = int(font(23,600).getlength(value))+38
    panel(draw,(x,y,x+width,y+46),"#315b49" if dark else MINT,radius=12)
    text(draw,(x+19,y+8),value,23,LIME if dark else GREEN,600)
    return width
def ease(value): return 1-(1-min(1,max(0,value)))**3
def lock(draw, x, y, size=1, color=GREEN):
    draw.arc((x+7*size,y,x+43*size,y+40*size),180,360,fill=color,width=int(5*size))
    panel(draw,(x,y+22*size,x+50*size,y+62*size),color,radius=int(8*size))
    draw.ellipse((x+22*size,y+35*size,x+28*size,y+42*size),fill=PAPER)
def arrow(draw, x, y, length=90, color=GREEN):
    draw.line((x,y,x+length,y),fill=color,width=4)
    draw.line([(x+length-14,y-12),(x+length,y),(x+length-14,y+12)],fill=color,width=4)

# Keep natural speech speed, normalize dialogue, and leave a short breath.
chunks, lengths = [], []
(WORK / "audio-mix").mkdir(exist_ok=True)
for i in range(6):
    file = WORK / f"audio-mix/scene-{i}.wav"
    pause = STORYBOARD["narration"]["scene_pause_seconds"]
    subprocess.run([FFMPEG,"-y","-loglevel","error","-i",str(WORK/f"audio/scene-{i}.wav"),
        "-af",f"highpass=f=75,lowpass=f=11000,loudnorm=I=-16:LRA=7:TP=-1.5,apad=pad_dur={pause}",
        "-ar","48000","-ac","1","-c:a","pcm_s16le",str(file)],check=True)
    with wave.open(str(file),"rb") as wav:
        data = np.frombuffer(wav.readframes(wav.getnframes()),dtype=np.int16).astype(np.float64)/32768
    chunks.append(data); lengths.append(len(data)/48000)
voice = np.concatenate(chunks)
duration = len(voice)/48000
assert duration < 59, f"Film exceeds the under-a-minute brief: {duration:.2f}s"
t = np.arange(len(voice))/48000
music = np.zeros(len(voice))
# Original, quiet ambient score; no licensed stock music is used.
for frequency, strength in [(110,.008),(164.81,.005),(220,.004),(261.63,.003),(329.63,.002)]:
    music += strength*np.sin(2*np.pi*frequency*t)*(0.65+0.35*np.sin(2*np.pi*0.07*t))
music *= .40*np.minimum(1,t/2)*np.minimum(1,(duration-t)/2)
mixed = voice + music
peak = np.max(np.abs(mixed))
if peak > .89: mixed *= .89/peak
with wave.open(str(WORK/"narration-and-score.wav"),"wb") as wav:
    wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(48000)
    wav.writeframes((mixed*32767).astype(np.int16).tobytes())

starts = np.cumsum([0]+lengths)
receipt = Image.open(WORK/"stills/accepted.png").convert("RGB")
receipt = receipt.crop((220,70,1420,1180)).resize((864,800),Image.Resampling.LANCZOS)
def draw_scene(index, elapsed):
    dark = index in [0,1,5]
    im = Image.new("RGB",(W,H),GREEN if dark else PAPER)
    d = ImageDraw.Draw(im)
    brand(d,dark=dark)
    text(d,(1370,76),"PRIVATE FINANCE · VERIFIED WORK",20,LIME if dark else "#73836a",600)
    offset = int((1-ease(elapsed/.7))*28)
    if index == 0:
        text(d,(96,236+offset),"Agents are becoming\nour coworkers.",88,PAPER,650,True,12)
        text(d,(100,478+offset),"The work is private.\nThe trust question is growing.",37,LIME,450,spacing=14)
        panel(d,(1110,230,1760,790),PAPER)
        lock(d,1160,275,1.3)
        text(d,(1245,281),"Confidential records",35,GREEN,650,True)
        for i,v in enumerate(["invoices.csv","payment-ledger.csv","customer-finance.csv"]):
            y=390+i*100
            panel(d,(1160,y,1710,y+74),MINT,radius=14)
            text(d,(1182,y+17),v,29,GREEN)
        pill(d,100,695,"Who can see the files?",True)
    elif index == 1:
        text(d,(96,214+offset),"An agent's name\nisn't its code.",86,PAPER,650,True,12)
        text(d,(100,451),"Who checks the result when\na trusted agent changes?",36,LIME,450)
        for x,version,tone,state in [(1100,"1.0",LIME,"Accepted work"),(1450,"1.1","#f4d3b9","Changed code")]:
            panel(d,(x,260,x+310,625),PAPER)
            text(d,(x+28,292),"Ledgerline",36,GREEN,700,True)
            text(d,(x+28,350),f"v{version}",65,GREEN,650,True)
            panel(d,(x+28,453,x+282,513),tone,radius=11)
            text(d,(x+43,467),state,24,GREEN,600)
            text(d,(x+28,548),"Different fingerprint",23,"#6b7863")
        text(d,(1098,682),"New code needs its own evidence.",31,LIME)
    elif index == 2:
        midpoint = lengths[index]*.48
        if elapsed < midpoint:
            text(d,(96,222+offset),"More agents.\nMore trust decisions.",84,INK,650,True,12)
            text(d,(100,459),"Every private job adds another\nfile, counterparty and payment.",34,"#6b7863")
            count = min(24,4+int(elapsed*4))
            for i in range(count):
                x=1110+(i%6)*115;y=280+(i//6)*125
                if i>0: d.line((x,y,x-45,y-36),fill="#c0d4b0",width=2)
                d.ellipse((x-28,y-28,x+28,y+28),fill=GREEN)
                check(d,x-13,y-10,LIME,.7)
        else:
            text(d,(96,207),"Separate pieces.\nOne complete agreement.",74,INK,650,True,12)
            for x,title,sub in [(105,"Marketplaces","Hold a payment"),(725,"Private compute","Protect execution"),(1345,"Acceptance rules","Decide when to pay")]:
                panel(d,(x,470,x+470,735),"white","#dce5d5")
                text(d,(x+35,515),title,35,GREEN,650,True)
                text(d,(x+35,589),sub,30,"#6b7863")
            arrow(d,600,590,65);arrow(d,1220,590,65)
    elif index == 3:
        text(d,(96,202+offset),"Meet Sealwork.",94,GREEN,700,True)
        text(d,(101,345),"Your agent hires.\nYour rules control the money.",41,INK,450)
        stages=[("01","Set constraints","Budget + acceptance"),("02","AI chooses","Public build histories"),
            ("03","Encrypt files","Before upload"),("04","Hire exact code","One build fingerprint")]
        for i,(n,title,sub) in enumerate(stages):
            x=96+i*455;y=580+int((1-ease((elapsed-i*.35)/.6))*35)
            panel(d,(x,y,x+420,y+234),"white","#d9e4d0")
            pill(d,x+26,y+25,n)
            text(d,(x+26,y+91),title,33,GREEN,650,True)
            text(d,(x+26,y+159),sub,26,"#6b7863")
    elif index == 4:
        text(d,(96,202+offset),"Checked work.\nAutomatic payment.",77,INK,650,True,12)
        text(d,(100,420),"An independent verifier\nenforces the agreed checks.",34,"#6b7863")
        panel(d,(1000,143,1870,907),"white","#dce5d5")
        cropped=receipt.crop((0,0,864,755))
        im.paste(cropped,(1003,146));d=ImageDraw.Draw(im)
        y=615
        panel(d,(98,y,860,y+100),MINT,radius=15)
        check(d,124,y+33,GREEN,1.1)
        text(d,(179,y+30),"Checks pass → provider paid",33,GREEN,600)
        panel(d,(98,y+122,860,y+222),"#f8e8e0",radius=15)
        text(d,(124,y+150),"Invalid / late → job budget returned",30,RED,600)
        text(d,(101,875),"Each outcome follows the exact code.",29,GREEN,600)
    else:
        text(d,(96,204+offset),"Built on NEAR.",96,PAPER,700,True)
        text(d,(100,356),"Private computation meets\nprogrammable money.",45,LIME,450)
        x=100
        for value in ["Asynchronous contracts","OutLayer attested compute","Automatic settlement"]:
            width=pill(d,x,559,value,True);x+=width+18
        text(d,(100,706),"Private work. Proof before payment.",55,PAPER,650,True)
        panel(d,(104,816,776,883),LIME,radius=12)
        text(d,(127,831),"Try it: sealwork.vercel.app",32,GREEN,650)
        text(d,(1470,365),"NEAR",86,LIME,700,True)
        text(d,(1470,485),"+ OutLayer",36,PAPER,600)
    return im

def caption(draw, index):
    lines=wrap(SCENES[index],1660,30)
    # Keep the full narration accessible without crowding the product visual.
    if len(lines)>2:
        lines=wrap(SCENES[index],1720,27)
    panel(draw,(76,954,1844,1059),"#102d23",radius=13)
    text(draw,(103,968),"\n".join(lines),30 if len(lines)<=2 else 27,"#f7faf4",450,spacing=8)

frames=math.ceil(duration*FPS)
command=[FFMPEG,"-y","-loglevel","error","-f","rawvideo","-pix_fmt","rgb24","-s",f"{W}x{H}","-r",str(FPS),"-i","pipe:0",
    "-i",str(WORK/"narration-and-score.wav"),"-c:v","libx264","-preset","fast","-crf","19","-pix_fmt","yuv420p",
    "-c:a","aac","-b:a","192k","-movflags","+faststart","-shortest",str(OUT/"sealwork-demo.mp4")]
encoder=subprocess.Popen(command,stdin=subprocess.PIPE)
last=-1
frozen={}
try:
    for frame in range(frames):
        moment=frame/FPS
        index=min(5,int(np.searchsorted(starts,moment,side="right")-1))
        elapsed=moment-starts[index]
        if index!=last:
            print(f"Rendering scene {index+1}/6 at {moment:.1f}s",flush=True);last=index
        freeze = (index != 2 and elapsed >= 2) or (index == 2 and elapsed >= lengths[index] * .48)
        if freeze and index in frozen:
            encoder.stdin.write(frozen[index])
            continue
        image=draw_scene(index,elapsed)
        # Short fades at scene boundaries, with no abrupt flashes.
        if elapsed < .22:
            image=Image.blend(Image.new("RGB",(W,H),GREEN if index in [0,1,5] else PAPER),image,ease(elapsed/.22))
        caption(ImageDraw.Draw(image),index)
        pixels=image.tobytes()
        if freeze: frozen[index]=pixels
        encoder.stdin.write(pixels)
    encoder.stdin.close()
    assert encoder.wait()==0,"Video encoding failed"
except BaseException:
    encoder.kill();raise
poster=draw_scene(3,3)
poster.save(OUT/"sealwork-demo-poster.jpg",quality=94)
def timestamp(seconds):
    ms=round(seconds*1000);return f"{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}.{ms%1000:03}"
vtt=["WEBVTT\n"]
for i,line in enumerate(SCENES):
    vtt.append(f"{timestamp(float(starts[i]))} --> {timestamp(float(starts[i+1]))}\n{line}\n")
(OUT/"sealwork-demo.vtt").write_text("\n".join(vtt))
(WORK/"render-report.json").write_text(json.dumps({"duration_seconds":duration,"width":W,"height":H,"fps":FPS,
    "narrated":True,"captioned":True,"original_background_score":True,"real_receipt_capture":True,
    "only_chain_claim":False,"mp4_bytes":(OUT/"sealwork-demo.mp4").stat().st_size,
    "voice":STORYBOARD["narration"]["voice"],"speech_speed":STORYBOARD["narration"]["speed"],"dialogue_target_lufs":-16,
    "music_gain":0.40,"local_neural_narration":True},indent=2)+"\n")
print(f"Completed {duration:.2f}s, {W}x{H}, narrated and captioned.",flush=True)
