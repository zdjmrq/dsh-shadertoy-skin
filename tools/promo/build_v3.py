"""Motion-led revision with source-synchronized shader music and voice ducking.

Keeps all v2 deliverables. Reads original recordings without changing them.
"""
import argparse,hashlib,json,math,re,subprocess,shutil
from pathlib import Path
from PIL import Image,ImageDraw
import build_v2 as old
import motion_v3 as motion

ROOT=old.ROOT;WORK=ROOT/'.tmp-validation/promo-v3';OUT=ROOT/'artifacts/promo-v3';ASSETS=ROOT/'site/assets'
STORY=json.loads(Path(__file__).with_name('storyboard-v3.json').read_text(encoding='utf-8'))
FFMPEG=old.FFMPEG;run=old.run;duration=old.duration
for folder in [WORK/'renders',OUT]:folder.mkdir(parents=True,exist_ok=True)

def timings(scene):
    chars=[]
    for line in (WORK/f'narration/{scene["id"]}.jsonl').read_text(encoding='utf-8').splitlines():
        event=json.loads(line)
        if event['type']!='WordBoundary':continue
        text=old.normalize(event['text']);start=event['offset']/1e7;seconds=event['duration']/1e7
        chars.extend((c,start+i*seconds/len(text),start+(i+1)*seconds/len(text)) for i,c in enumerate(text))
    actual=''.join(c[0] for c in chars)
    assert actual==old.normalize(scene['text'])==old.normalize(''.join(scene['captions'])),scene['id']
    return actual,chars

def cue(scene,phrase):
    actual,chars=timings(scene);return .16+chars[actual.index(old.normalize(phrase))][1]

def captions(scene,offset,ass,srt):
    _,chars=timings(scene);position=0
    for line in scene['captions']:
        n=len(old.normalize(line));start=offset+.16+chars[position][1];end=offset+.16+chars[position+n-1][2]+.08;position+=n
        if position<len(chars):end=min(end,offset+.16+chars[position][1]-.025)
        value=old.caption_wrap(line)
        ass.append(f'Dialogue: 0,{old.stamp(start)},{old.stamp(end)},Default,,0,0,0,,{value}')
        srt.append(f'{len(srt)+1}\n{old.stamp(start,True)} --> {old.stamp(end,True)}\n{value.replace(chr(92)+"N",chr(10))}\n')

def overlay(label,index):
    dest=WORK/f'renders/label-{index}.png';im=Image.new('RGBA',(1920,1080));d=ImageDraw.Draw(im)
    if label:
        width=math.ceil(d.textlength(label,font=old.font(26)))+52
        d.rounded_rectangle((55,25,55+width,80),radius=10,fill=(15,25,42,225))
        old.text(d,(80,36),label,26,'white')
    im.save(dest);return dest

def clip(spec,length,index):
    length=round(length*30)/30;source=spec['file'];still=source.suffix.lower() in ['.png','.jpg','.webp']
    info={'spec':{**spec,'file':str(source)},'seconds':length,'producer':Path(__file__).read_text(encoding='utf-8'),'mtime':source.stat().st_mtime,'size':source.stat().st_size}
    key=hashlib.sha256(json.dumps(info,ensure_ascii=False).encode()).hexdigest()[:12]
    dest=WORK/f'renders/{index}-{key}.mov'
    if dest.exists():return dest
    music=spec.get('music',False);start=spec.get('in',0);speed=1
    if not still:
        available=spec.get('out',duration(source))-start
        assert length<=available*1.17+.3,(index,length,available)
        speed=max(1.,length/available)
        if music:
            assert speed<1.000001,'Music clips must preserve original sound/image timing'
            speed=1
    args=['-loop','1','-framerate','30','-i',source] if still else ['-ss',start,'-i',source]
    label=overlay(spec.get('label',''),index)
    args+=['-loop','1','-i',label]
    if not music:args+=['-f','lavfi','-i','anullsrc=r=48000:cl=stereo']
    timing='' if still else f'setpts={speed:.8f}*(PTS-STARTPTS),tpad=stop_mode=clone:stop_duration=0.3,'
    layout=spec.get('layout','cover')
    if spec.get('zoom'):
        resize="scale=2304:1296,zoompan=z='1+0.025*on/"+str(max(1,round(length*30)-1))+"':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1920x1080:fps=30"
    elif layout=='contain':resize='scale=1920:900:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:60:color=0x0d1524'
    else:resize='scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080:0:(ih-1080)*0.35'
    graph=f'[0:v]{timing}{resize},setsar=1,fps=30[v0];[v0][1:v]overlay=0:0[v];'
    if music:
        graph+=f'[0:a]atrim=duration={length},asetpts=PTS-STARTPTS,aresample=48000,loudnorm=I=-18:TP=-3:LRA=9,afade=t=in:d=0.08,afade=t=out:st={max(0,length-.18)}:d=0.18,apad,atrim=duration={length}[a]'
    else:graph+=f'[2:a]atrim=duration={length}[a]'
    temporary=dest.with_suffix('.partial.mov')
    # PCM keeps every edit on an exact 48 kHz boundary, avoiding per-clip AAC padding.
    run([*args,'-filter_complex',graph,'-map','[v]','-map','[a]','-t',length,'-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-threads','4','-c:a','pcm_s16le','-ar','48000','-ac','2','-y',temporary])
    temporary.replace(dest);print('shot ready',index,round(length,2),'music' if music else '',flush=True);return dest

def plan(scene,length,sources,capture):
    def graphic(name,seconds):return {'file':motion.render(name,seconds),'kind':'motion'},seconds
    def raw(n,start,end,label='',layout='cover',music=False):return {'file':sources[n],'in':start,'out':end,'label':label,'layout':layout,'music':music,'kind':'recording'}
    def ui(name,start=None,end=None):
        c=capture[name];return {'file':Path(c['file']),'in':c['marks']['start'] if start is None else start,'out':c['marks']['end'] if end is None else end,'label':'实际插件界面 · 演示配置','layout':'contain','kind':'ui'}
    def image(name):return {'file':old.card(name),'kind':'card'}
    sid=scene['id']
    if sid=='intro':return [({'file':OUT/'B站封面.png','zoom':True,'kind':'cover'},5.2),graphic('intro',length-5.2)]
    if sid=='purpose':return [graphic('purpose',length-1.9),(raw(1,2.05,3.95,'下雨的窗户 · DSH 实录'),1.9)]
    if sid=='code':return [graphic('code',length)]
    if sid=='music':return [graphic('music',5),(raw(4,6.8,10.2,'Take On Me · 原作品的代码合成音乐',music=True),3.4),(raw(8,1.0,1.0+length-8.4,'Never Gonna Give You Up · 原作品的代码合成音乐',music=True),length-8.4)]
    if sid=='install':
        split=round(cue(scene,'也可以在插件页')*30)/30
        return [graphic('market',split),graphic('install',length-split-3.2),(ui('select',2.37,5.57),3.2)]
    if sid=='settings':return [(ui('settings'),length)]
    if sid=='discover':return [graphic('discover',length)]
    if sid=='import':return [graphic('files',length-3.7),(ui('multi-import',2.1,5.8),3.7)]
    if sid=='modify':
        split=round(cue(scene,'不会写的话')*30)/30
        return [(image('compare'),split),(image('ai'),length-split)]
    if sid=='play':
        split=round(cue(scene,'这个像素世界')*30)/30;third=round(cue(scene,'还有地牢')*30)/30
        return [(raw(2,8.5,18,'造山 / 按住鼠标画，Shift 挖低'),split),(raw(7,8.3,15.1,'我的世界 · ShaderToy 作品','contain'),third-split),(raw(5,4.2,11,'地牢 / 方向键逐步移动','contain'),length-third)]
    if sid=='share':return [graphic('share',length)]
    raise ValueError(sid)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--sources',type=Path,required=True);args=parser.parse_args()
    sources={i:args.sources/f'屏幕录制 2026-10-29 {stamp}.mp4' for i,stamp in enumerate(STORY['sourceStamps'],1)}
    for source in sources.values():assert source.is_file(),source
    old.cover(sources);shutil.copyfile(old.OUT/'B站封面.png',OUT/'B站封面.png')
    capture=json.loads((ROOT/'.tmp-validation/promo-v2/captures/captures.json').read_text(encoding='utf-8'))
    parts=[];voices=[];events=[];srt=[];timeline=[];offset=0
    for scene in STORY['scenes']:
        voice=WORK/f'narration/{scene["id"]}.mp3';length=math.ceil((duration(voice)+.45+scene.get('holdAfter',0))*30)/30
        entries=[];shots=plan(scene,length,sources,capture)
        for i,(shot,seconds) in enumerate(shots):
            seconds=round(seconds*30)/30
            if i==len(shots)-1:seconds=length-sum(e['duration'] for e in entries)
            parts.append(clip(shot,seconds,f'{scene["id"]}-{i}'))
            entries.append({'source':str(shot['file']),'in':shot.get('in',0),'out':shot.get('out'),'duration':seconds,'kind':shot['kind'],'music':shot.get('music',False)})
        captions(scene,offset,events,srt);voices.append((voice,offset+.16))
        timeline.append({'id':scene['id'],'heading':scene['heading'],'text':scene['text'],'start':offset,'duration':length,'voiceDuration':duration(voice),'shots':entries})
        offset+=length;print('scene ready',scene['id'],round(length,2),flush=True)
    # Same subtitle styling as v2; no old rendered film is required.
    header='''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Microsoft YaHei,42,&H00FFFFFF,&H00FFFFFF,&H00111A28,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,100,100,35,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
    ass=WORK/'subtitles.ass';ass.write_text(header+'\n'.join(events)+'\n',encoding='utf-8-sig')
    (OUT/'字幕.srt').write_text('\n'.join(srt),encoding='utf-8-sig')
    vtt=re.sub(r'(?m)^\d+\n','','\n'.join(srt));vtt=re.sub(r'(\d\d:\d\d:\d\d),(\d{3})',r'\1.\2',vtt)
    (ASSETS/'film.vtt').write_text('WEBVTT\n\n'+vtt,encoding='utf-8')
    (OUT/'剪辑时间线.json').write_text(json.dumps(timeline,ensure_ascii=False,indent=2),encoding='utf-8')
    concat=WORK/'concat.txt';concat.write_text('\n'.join(f"file '{p.as_posix()}'" for p in parts),encoding='utf-8')
    run(['-f','concat','-safe','0','-i',concat,'-c','copy','-y',WORK/'picture-with-music.mov'])
    inputs=['-i',WORK/'picture-with-music.mov'];filters=[];names=[]
    for i,(voice,start) in enumerate(voices,1):
        inputs+=['-i',voice];filters.append(f'[{i}:a]adelay={round(start*1000)}:all=1[a{i}]');names.append(f'[a{i}]')
    filters.append(''.join(names)+f'amix=inputs={len(names)}:duration=longest:normalize=0,apad,atrim=duration={offset},asplit=2[voice][control]')
    filters.append('[0:a][control]sidechaincompress=threshold=0.025:ratio=8:attack=15:release=280:makeup=1[ducked]')
    filters.append('[voice][ducked]amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-17:TP=-2:LRA=9[a]')
    ass_path=ass.as_posix().replace(':',r'\:');final=OUT/'DSH-ShaderToy-介绍片-v3-1080p.mp4'
    run([*inputs,'-filter_complex',';'.join(filters),'-map','0:v','-map','[a]','-vf',f"ass=filename='{ass_path}',setsar=1",'-t',offset,'-c:v','libx264','-preset','medium','-crf','19','-threads','4','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-movflags','+faststart','-metadata','title='+STORY['title'],'-y',final])
    run(['-i',final,'-vf','scale=1280:720','-c:v','libx264','-preset','medium','-crf','26','-threads','4','-c:a','aac','-b:a','128k','-movflags','+faststart','-y',ASSETS/'film.mp4'])
    summary={kind:round(sum(s['duration'] for scene in timeline for s in scene['shots'] if s['kind']==kind),2) for kind in ['cover','motion','card','ui','recording']}
    (OUT/'制作说明.json').write_text(json.dumps({'duration':offset,'secondsByKind':summary,'music':'Original recordings, synchronous cuts; no background music elsewhere; voice sidechain ducking'},ensure_ascii=False,indent=2),encoding='utf-8')
    (ASSETS/'film-info.json').write_text(json.dumps({'revision':3,'duration':round(offset,4),'width':1280,'height':720,'greeting':STORY['scenes'][0]['captions'][0],'chapters':[{'start':round(s['start'],3),'title':s['heading']} for s in timeline]},ensure_ascii=False,indent=2),encoding='utf-8')
    print('FINAL',final,round(offset,2),summary,flush=True)

if __name__=='__main__':main()
