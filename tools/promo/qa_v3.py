"""Check the motion-led edit, full decode, captions and original music alignment."""
import json,re,subprocess,math,argparse
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
import build_v3 as p

parser=argparse.ArgumentParser();parser.add_argument('--revision',type=int,choices=[3,4],default=3);args=parser.parse_args()
p.configure(args.revision)
film=p.OUT/f'DSH-ShaderToy-介绍片-v{p.REVISION}-1080p.mp4'
timeline=json.loads((p.OUT/'剪辑时间线.json').read_text(encoding='utf-8'))
srt=(p.OUT/'字幕.srt').read_text(encoding='utf-8-sig')
assert srt.splitlines()[2]=='各位人类和ai大家好呀。'
assert 'dshmarket' in srt and '音乐也能用代码实时合成' in srt and '一两百行代码' in srt
stamps=re.findall(r'(\d\d):(\d\d):(\d\d),(\d{3})',srt)
seconds=[int(h)*3600+int(m)*60+int(s)+int(ms)/1000 for h,m,s,ms in stamps]
assert all(seconds[i]<seconds[i+1] for i in range(0,len(seconds),2))
assert all(seconds[i]<=seconds[i+1] for i in range(1,len(seconds)-1,2))
length=sum(s['duration'] for s in timeline)
assert abs(p.duration(film)-length)<.1 and seconds[-1]<=length
assert timeline[0]['shots'][0]['kind']=='cover' and 4<=timeline[0]['shots'][0]['duration']<=6
assert abs(next(s for s in timeline if s['id']=='play')['duration']-17.4)<.04
raw=sum(shot['duration'] for s in timeline for shot in s['shots'] if shot['kind']=='recording')
assert raw<(35 if p.REVISION>=4 else 30) and raw/length<(.3 if p.REVISION>=4 else .25)
assert all('132941.mp4' not in shot['source'] for s in timeline for shot in s['shots'])
assert p.motion.rain_lines()==145
source=(p.ROOT/'native-dist/presets/seascape.glsl').read_text(encoding='utf-8')
source=re.sub(r'/\*.*?\*/|//[^\n]*','',source,flags=re.S)
assert sum(bool(l.strip()) for l in source.splitlines())==176

def samples(file,at,seconds=.45):
    result=subprocess.run([p.FFMPEG,'-v','error','-ss',str(at),'-i',str(file),'-t',str(seconds),'-vn','-f','f32le','-ac','1','-ar','48000','pipe:1'],capture_output=True)
    assert result.returncode==0,result.stderr
    return np.frombuffer(result.stdout,dtype='<f4')

music_picture=p.WORK/'aligned-picture.mov'
if not music_picture.exists():music_picture=p.WORK/'picture-with-music.mov'
music=[]
for scene in timeline:
    assert abs(sum(s['duration'] for s in scene['shots'])-scene['duration'])<.04
    at=scene['start']
    for shot in scene['shots']:
        if shot['out'] is not None:
            assert shot['out']<=p.duration(shot['source'])+.04
            assert shot['duration']<=(shot['out']-shot['in'])*1.17+.3
        if shot['music']:
            original=samples(shot['source'],shot['in']+.5)
            stem=samples(music_picture,at+.5)
            n=min(len(original),len(stem));correlation=float(np.corrcoef(original[:n],stem[:n])[0,1])
            assert correlation>.97,(shot['source'],'music synchronization',correlation)
            assert float(np.sqrt(np.mean(stem*stem)))>.01
            music.append({'start':at,'duration':shot['duration'],'source':Path(shot['source']).name,'correlation':correlation})
        at+=shot['duration']
assert len(music)==(3 if p.REVISION>=4 else 2)
silent=samples(music_picture,1)
assert np.max(np.abs(silent))<1e-6
musical=next(s for s in timeline if s['id']=='music')
assert musical['duration']-musical['voiceDuration']-.16>=(11 if p.REVISION>=4 else 7.6)
audible=samples(film,musical['start']+musical['duration']-2)
assert float(np.sqrt(np.mean(audible*audible)))>.01,'Music-only passage is inaudible'

if p.REVISION>=4:
    assert next(s for s in timeline if s['id']=='settings')['duration']<7
    assert not any(shot['kind']=='ui' for s in timeline for shot in s['shots'])
    result=subprocess.run([p.FFMPEG,'-v','error','-i',str(film),'-t','5','-vf','crop=620:170:40:40,format=rgb24','-f','rawvideo','pipe:1'],capture_output=True,check=True)
    frames=np.frombuffer(result.stdout,dtype=np.uint8).reshape(-1,170,620,3);edges=[]
    for frame in frames:
        mask=(frame[:,:,2]>185)&(frame[:,:,1]>100)&(frame[:,:,0]>70)&(frame[:,:,2].astype(int)-frame[:,:,0].astype(int)>65)
        ys,xs=np.where(mask);edges.append(int(np.quantile(xs,.01)))
    assert max(edges)-min(edges)<=1,('Opening still moves',edges)
    opening={'framesChecked':len(edges),'badgeEdgeMin':min(edges),'badgeEdgeMax':max(edges)}
    (p.OUT/'开场稳定检查.json').write_text(json.dumps(opening,indent=2),encoding='utf-8')

for page,start in enumerate(range(0,len(timeline),6),1):
    group=timeline[start:start+6];sheet=Image.new('RGB',(1440,math.ceil(len(group)/2)*435),'#0c1220');d=ImageDraw.Draw(sheet)
    for i,scene in enumerate(group):
        at=scene['start']+min(scene['duration']/2,4)
        frame=p.WORK/f'qa-{scene["id"]}.png'
        p.run(['-ss',at,'-i',film,'-frames:v','1','-vf','scale=700:-1','-y',frame])
        x,y=i%2*720+10,i//2*435+32;sheet.paste(Image.open(frame),(x,y))
        d.text((x,y-28),f'{scene["id"]} / {at:.1f}s',font=p.old.font(21,bold=True),fill='white')
    sheet.save(p.OUT/f'成片检查图-{page}.jpg',quality=94)

info=subprocess.run([p.FFMPEG,'-hide_banner','-i',str(film)],capture_output=True).stderr.decode('utf-8','replace')
audio=subprocess.run([p.FFMPEG,'-hide_banner','-threads','4','-i',str(film),'-vn','-af','loudnorm=I=-17:TP=-2:LRA=9:print_format=json','-f','null','-'],capture_output=True)
assert audio.returncode==0
audio=audio.stderr.decode('utf-8','replace')
assert '1920x1080' in info and '30 fps' in info and '48000 Hz' in info and 'stereo' in info
peak=re.search(r'"input_tp"\s*:\s*"([\d.-]+)"',audio)
assert peak and float(peak[1])<-1
decode=subprocess.run([p.FFMPEG,'-v','error','-threads','4','-i',str(film),'-map','0:v:0','-f','null','-'],capture_output=True)
assert decode.returncode==0 and not decode.stderr,decode.stderr
report=info+'\n'+audio[-1500:]+'\nFull decode, captions, line counts, cover opener: PASS\n'+json.dumps({'rawRecordingSeconds':raw,'rawRecordingRatio':raw/length,'sourceMusicAlignment':music,'musicOnlySeconds':musical['duration']-musical['voiceDuration']-.16},ensure_ascii=False,indent=2)
(p.OUT/'技术检查.txt').write_text(report,encoding='utf-8')
print('PASS: full decode, exact greeting, captions, music alignment, music-only passage, audio peak and reduced recording usage')
print(report[-1400:])
