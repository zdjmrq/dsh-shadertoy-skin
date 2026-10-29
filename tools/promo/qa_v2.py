"""Validate the revised film, captions, edit ranges and final audio; extract a contact sheet."""
import importlib.util,json,re,subprocess,math
from pathlib import Path
from PIL import Image,ImageDraw

spec=importlib.util.spec_from_file_location('promo_v2',Path(__file__).with_name('build_v2.py'))
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
film=p.OUT/'DSH-ShaderToy-介绍片-v2-1080p.mp4'
timeline=json.loads((p.OUT/'剪辑时间线.json').read_text(encoding='utf-8'))
srt=(p.OUT/'字幕.srt').read_text(encoding='utf-8-sig')
assert srt.splitlines()[2]=='各位人类和ai大家好呀。'
assert '大肥鱼' not in srt
stamps=re.findall(r'(\d\d):(\d\d):(\d\d),(\d{3})',srt)
seconds=[int(h)*3600+int(m)*60+int(s)+int(ms)/1000 for h,m,s,ms in stamps]
assert all(seconds[i]<seconds[i+1] for i in range(0,len(seconds),2))
assert all(seconds[i]<=seconds[i+1] for i in range(1,len(seconds)-1,2))
assert abs(p.duration(film)-sum(s['duration'] for s in timeline))<.1
assert seconds[-1]<=p.duration(film)
for scene in timeline:
    assert abs(sum(s['duration'] for s in scene['shots'])-scene['duration'])<.04
    for shot in scene['shots']:
        if shot['out'] is not None:
            assert shot['out']<=p.duration(shot['source'])+.04
            assert shot['duration']<=(shot['out']-shot['in'])*1.17+.3

sheet=Image.new('RGB',(1440,math.ceil(len(timeline)/2)*435),'#0c1220');d=ImageDraw.Draw(sheet)
for i,scene in enumerate(timeline):
    at=scene['start']+min(scene['duration']/2,4)
    frame=p.WORK/f'qa-{i}.png'
    p.run(['-ss',at,'-i',film,'-frames:v','1','-vf','scale=700:-1','-y',frame])
    x,y=(i%2)*720+10,(i//2)*435+32
    sheet.paste(Image.open(frame),(x,y))
    d.text((x,y-28),f'{i+1:02d} {scene["id"]} / {at:.1f}s',font=p.font(21,bold=True),fill='white')
sheet.save(p.OUT/'成片检查图.jpg',quality=94)
info=subprocess.run([p.FFMPEG,'-hide_banner','-i',str(film)],capture_output=True).stderr.decode('utf-8','replace')
audio=subprocess.run([p.FFMPEG,'-hide_banner','-threads','4','-i',str(film),'-vn','-af','loudnorm=I=-17:TP=-2:LRA=9:print_format=json','-f','null','-'],capture_output=True)
assert audio.returncode==0
audio=audio.stderr.decode('utf-8','replace')
assert '1920x1080' in info and '30 fps' in info and '48000 Hz' in info and 'stereo' in info
peak=re.search(r'"input_tp"\s*:\s*"([\d.-]+)"',audio)
assert peak and float(peak[1])<-1,'Audio too close to clipping'
decode=subprocess.run([p.FFMPEG,'-v','error','-threads','4','-i',str(film),'-map','0:v:0','-f','null','-'],capture_output=True)
assert decode.returncode==0 and not decode.stderr,decode.stderr
(p.OUT/'技术检查.txt').write_text(info+'\n'+audio[-1500:]+'\nFull video decode: PASS\nEdit ranges and caption timing: PASS\nRequested greeting: PASS\n',encoding='utf-8')
print('PASS: complete video decode, edit ranges, caption timing, exact greeting, stereo audio and true peak')
print(audio[-500:])
