"""Extract an inspection sheet and measure final audio/video, without changing it."""
import importlib.util,json,subprocess
from pathlib import Path
from PIL import Image,ImageDraw
spec=importlib.util.spec_from_file_location('promo',Path(__file__).with_name('build.py'))
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
film=p.OUT/'DSH-ShaderToy-宣传片-1080p.mp4'
timeline=json.loads((p.OUT/'剪辑时间线.json').read_text(encoding='utf-8'))
import re
srt=(p.OUT/'字幕.srt').read_text(encoding='utf-8-sig')
stamps=re.findall(r'(\d\d):(\d\d):(\d\d),(\d{3})',srt)
seconds=[int(h)*3600+int(m)*60+int(s)+int(ms)/1000 for h,m,s,ms in stamps]
assert all(seconds[i]<seconds[i+1] for i in range(0,len(seconds),2)),'Caption has zero/negative duration'
assert all(seconds[i]<=seconds[i+1] for i in range(1,len(seconds)-1,2)),'Captions overlap'
vtt=re.sub(r'(?m)^\d+\n','',srt)
vtt=re.sub(r'(\d\d:\d\d:\d\d),(\d{3})',r'\1.\2',vtt)
(p.ASSETS/'film.vtt').write_text('WEBVTT\n\n'+vtt,encoding='utf-8')
assert abs(p.duration(film)-sum(s['duration'] for s in timeline))<.1
sheet=Image.new('RGB',(1440,4*440),'#0c1220');d=ImageDraw.Draw(sheet)
for i,scene in enumerate(timeline):
    at=scene['start']+min(scene['duration']/2,4)
    frame=p.WORK/f'qa-{i}.png'
    p.run(['-ss',at,'-i',film,'-frames:v','1','-vf','scale=700:-1','-y',frame])
    x,y=(i%2)*720+10,(i//2)*440+33
    sheet.paste(Image.open(frame),(x,y))
    d.text((x,y-28),f'{i+1:02d}  {scene["id"]}  / {at:.1f}s',font=p.font(21,True),fill='white')
sheet.save(p.OUT/'成片检查图.jpg',quality=93)
info=subprocess.run([p.FFMPEG,'-hide_banner','-i',str(film)],capture_output=True).stderr.decode('utf-8','replace')
audio=subprocess.run([p.FFMPEG,'-hide_banner','-i',str(film),'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json','-f','null','-'],capture_output=True).stderr.decode('utf-8','replace')
(p.OUT/'技术检查.txt').write_text(info+'\n'+audio[-2000:],encoding='utf-8')
assert '1920x1080' in info and '30 fps' in info and '48000 Hz' in info and 'stereo' in info
match=re.search(r'"input_tp"\s*:\s*"([\d.-]+)"',audio)
assert match and float(match[1])<-.5,'Audio is too close to clipping'
print(info[:1200]);print(audio[-600:])
print('PASS: picture, duration, stereo audio, true peak and non-overlapping captions')
