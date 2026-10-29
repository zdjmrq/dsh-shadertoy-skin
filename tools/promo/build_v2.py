"""Revised editorial cut: full-screen footage, real UI and short teaching cards.

Run capture-ui.mjs and narration_v2.py first. Original recordings stay read-only.
The old film is retained separately; all revised deliverables go to promo-v2.
"""
import argparse,hashlib,json,math,re,subprocess
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps
import imageio_ffmpeg

ROOT=Path(__file__).resolve().parents[2]
STORY=json.loads(Path(__file__).with_name('storyboard-v2.json').read_text(encoding='utf-8'))
WORK=ROOT/'.tmp-validation/promo-v2'
OUT=ROOT/'artifacts/promo-v2'
ASSETS=ROOT/'site/assets'
FFMPEG=imageio_ffmpeg.get_ffmpeg_exe()
BG='#f3f5f9';INK='#17253a';BLUE='#315fe9';MUTED='#68778d'
for folder in [WORK/'renders',OUT]:folder.mkdir(parents=True,exist_ok=True)

def run(args):
    result=subprocess.run([FFMPEG,'-hide_banner','-loglevel','error',*map(str,args)],capture_output=True)
    if result.returncode:raise RuntimeError(result.stderr.decode('utf-8','replace')[-4000:])

def duration(file):
    r=subprocess.run([FFMPEG,'-hide_banner','-i',str(file)],capture_output=True)
    m=re.search(rb'Duration: (\d+):(\d+):([\d.]+)',r.stderr)
    if not m:raise RuntimeError(f'No media duration: {file}')
    return int(m[1])*3600+int(m[2])*60+float(m[3])

def font(size,mono=False,bold=False):
    return ImageFont.truetype('C:/Windows/Fonts/consola.ttf' if mono else f'C:/Windows/Fonts/msyh{"bd" if bold else ""}.ttc',size)

def text(d,xy,value,size=34,fill=INK,mono=False,bold=False):
    d.text(xy,value,font=font(size,mono,bold),fill=fill)

def normalize(value):return ''.join(c.lower() for c in value if c.isalnum())

def word_times(scene):
    events=[json.loads(line) for line in (WORK/f'narration/{scene["id"]}.jsonl').read_text(encoding='utf-8').splitlines()]
    chars=[]
    for e in events:
        if e['type']!='WordBoundary':continue
        value=normalize(e['text']);start=e['offset']/1e7;length=e['duration']/1e7
        chars.extend((c,start+i*length/len(value),start+(i+1)*length/len(value)) for i,c in enumerate(value))
    actual=''.join(c[0] for c in chars)
    assert actual==normalize(scene['text']),(scene['id'],actual)
    assert normalize(''.join(scene['captions']))==actual,scene['id']
    return actual,chars

def cue(scene,phrase):
    value,chars=word_times(scene)
    return .16+chars[value.index(normalize(phrase))][1]

def card(name):
    dest=WORK/f'{name}.png';im=Image.new('RGB',(1920,1080),BG);d=ImageDraw.Draw(im)
    text(d,(92,52),'DSH / SHADERTOY',23,BLUE,mono=True)
    if name=='install':
        text(d,(92,152),'安装很简单，先记住这个包名。',58,bold=True)
        d.rounded_rectangle((92,282,1828,434),radius=20,fill='white',outline='#d6deeb',width=2)
        text(d,(148,324),'dsh-shadertoy-skin',64,BLUE,mono=True)
        for i,(head,body) in enumerate([('添加插件','在 DSH 的插件页填入上面的包名'),('完全重启','完全退出客户端，再重新打开'),('选择背景','左栏打开「Shader 背景」')]):
            x=96+i*600
            text(d,(x,532),f'{i+1:02}',27,BLUE,mono=True)
            text(d,(x,595),head,40,bold=True)
            text(d,(x,665),body,25,MUTED)
        d.rounded_rectangle((92,795,1828,900),radius=12,fill='#e6ecf7')
        text(d,(125,822),'dsh plugin --profile desktop add dsh-shadertoy-skin',34,INK,mono=True)
    elif name=='discover':
        text(d,(92,145),'README 里，我更想推荐的是：',35,MUTED)
        text(d,(92,220),'去 ShaderToy 找自己喜欢的作品。',61,bold=True)
        text(d,(92,339),'www.shadertoy.com',76,BLUE,mono=True)
        text(d,(98,456),'15 个内置作品只是起点。可以按风格逛，也可以试试这些关键词：',29,MUTED)
        for i,(label,slug) in enumerate([('海面 / seascape','ocean'),('背景 / background','rain'),('像素 / pixel','mario')]):
            x=96+i*600
            source=Image.open(ASSETS/f'{slug}.webp').convert('RGB')
            im.paste(ImageOps.fit(source,(540,310)),(x,540))
            text(d,(x,874),label,28,INK)
    elif name=='compare':
        text(d,(92,150),'比如，给现成的海面加一点星光。',59,bold=True)
        for i,(label,file) in enumerate([('原背景','sea-before.png'),('加上星光以后','sea-after.png')]):
            x=80+i*930
            text(d,(x,284),label,30,BLUE if i else MUTED)
            im.paste(Image.open(WORK/f'captures/{file}').convert('RGB').resize((850,478)),(x,345))
        text(d,(86,863),'实际着色器改编示例 / Seascape：TDM · CC BY-NC-SA 3.0',23,MUTED)
        text(d,(86,920),'c.rgb += vec3(.55, .8, 1.) * (core + glow + rays);',27,BLUE,mono=True)
    elif name=='ai':
        text(d,(92,158),'不会写？把代码和想法一起交给 AI。',56,bold=True)
        d.rounded_rectangle((92,320,1828,644),radius=25,fill='white',outline='#d6deeb',width=2)
        text(d,(145,390),'“帮我在这个海面背景里，',57,INK)
        text(d,(145,487),'  加一点发光的星星。”',57,INK)
        text(d,(100,734),'给它实际代码 → 说明想改哪里 → 检查画面后再保存',32,BLUE)
        text(d,(100,824),'网页抓不到源码时，自己复制代码或导入文件就可以。',27,MUTED)
    elif name=='share':
        logo=Image.open(ROOT/'assets/icon-180.png').convert('RGBA').resize((100,100));im.paste(logo,(96,132),logo)
        text(d,(226,145),'dsh-shadertoy-skin',50,INK,mono=True)
        text(d,(96,316),'安装方法、项目地址，都放在简介里。',53,bold=True)
        text(d,(98,441),'github.com/zdjmrq/dsh-shadertoy-skin',43,BLUE,mono=True)
        d.line((96,548,1824,548),fill='#d6deeb',width=2)
        text(d,(98,620),'找到好看的、改出有意思的，欢迎分享。',39,INK)
        text(d,(98,706),'截图 · 参数 · 代码改进 → Issues / PR',32,MUTED)
        text(d,(98,824),'分享第三方作品时，保留原作者的署名与许可。',27,MUTED)
    else:raise ValueError(name)
    # Keep identical cards' mtimes stable so repeated builds reuse rendered clips.
    import io
    data=io.BytesIO();im.save(data,format='PNG');payload=data.getvalue()
    if not dest.exists() or dest.read_bytes()!=payload:dest.write_bytes(payload)
    return dest

def stamp(second,srt=False):
    n=round(second*(1000 if srt else 100));unit=1000 if srt else 100
    return f'{n//(3600*unit):02d}:{n//(60*unit)%60:02d}:{n//unit%60:02d}{"," if srt else "."}{n%unit:0{3 if srt else 2}d}'

def caption_wrap(value):
    result=[];line='';count=0
    for ch in value:
        width=.55 if ord(ch)<128 else 1
        if count+width>26:result.append(line);line='';count=0
        line+=ch;count+=width
    result.append(line);return '\\N'.join(result)

def captions(scene,offset,events,srt):
    _,chars=word_times(scene);position=0
    for line in scene['captions']:
        size=len(normalize(line));start=offset+.16+chars[position][1]
        end=offset+.16+chars[position+size-1][2]+.08
        position+=size
        if position<len(chars):end=min(end,offset+.16+chars[position][1]-.025)
        value=caption_wrap(line)
        events.append(f'Dialogue: 0,{stamp(start)},{stamp(end)},Default,,0,0,0,,{value}')
        srt.append(f'{len(srt)+1}\n{stamp(start,True)} --> {stamp(end,True)}\n{value.replace(chr(92)+"N",chr(10))}\n')

def tag(label,index):
    dest=WORK/f'renders/tag-{index}.png'
    im=Image.new('RGBA',(1920,1080));d=ImageDraw.Draw(im)
    if label:
        w=math.ceil(d.textlength(label,font=font(24)))+54
        d.rounded_rectangle((62,28,62+w,79),radius=10,fill=(14,25,43,215))
        text(d,(87,37),label,24,'white')
    im.save(dest);return dest

def render_clip(spec,length,index):
    source=spec['file'];label=spec.get('label','');layout=spec.get('layout','cover')
    info={'spec':{**spec,'file':str(source)},'length':length,'producer':Path(__file__).read_text(encoding='utf-8'),'size':source.stat().st_size,'mtime':source.stat().st_mtime}
    key=hashlib.sha256(json.dumps(info,ensure_ascii=False).encode()).hexdigest()[:12]
    dest=WORK/f'renders/{index}-{key}.mp4'
    if dest.exists():return dest
    still=source.suffix.lower() in ['.png','.jpg','.webp']
    args=['-loop','1','-framerate','30','-i',source] if still else ['-ss',spec.get('in',0),'-i',source]
    if not still:
        maximum=spec.get('out',duration(source))-spec.get('in',0)
        assert length<=maximum*1.17+.3,(index,length,maximum)
        speed=max(1.,length/max(.1,maximum))
        timing=f'setpts={speed:.8f}*(PTS-STARTPTS),tpad=stop_mode=clone:stop_duration=0.3,'
    else:timing=''
    overlay=tag(label,index)
    if layout=='contain':
        resize='scale=1920:900:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:60:color=0x0d1524'
    else:
        resize='scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080:0:(ih-1080)*0.35'
    graph=f'[0:v]{timing}{resize},setsar=1,fps=30[v0];[v0][1:v]overlay=0:0[v]'
    temporary=dest.with_suffix('.partial.mp4')
    run([*args,'-loop','1','-i',overlay,'-filter_complex',graph,'-map','[v]','-t',length,'-an','-c:v','libx264','-preset','medium','-crf','19','-pix_fmt','yuv420p','-threads','4','-y',temporary])
    temporary.replace(dest);print('clip',index,round(length,2),flush=True)
    return dest

def plan(scene,length,sources,capture):
    def raw(n,start,end,label='',layout='cover'):return {'file':sources[n],'in':start,'out':end,'label':label,'layout':layout}
    def ui(name):
        c=capture[name];return {'file':Path(c['file']),'in':c['marks']['start'],'out':c['marks']['end'],'label':'实际插件界面 · 演示配置','layout':'contain'}
    def image(name,label=''):return {'file':card(name),'label':label}
    sid=scene['id']
    if sid=='intro':return [(raw(3,.35,8.95,'DSH ShaderToy / 给 DeepSeek Harness 换个背景'),8.5),(raw(4,1.3,6.2,'Take On Me · ShaderToy 作品'),length-8.5)]
    if sid=='purpose':
        a=cue(scene,'比如这个海面');b=cue(scene,'还有这扇雨窗');c=cue(scene,'平时照常聊天')
        return [(raw(4,6,13.8,'实时画面，运行在 DSH 背后'),a),(raw(3,3,5.5,'海面 / Seascape'),b-a),(raw(1,2.05,3.95,'下雨的窗户'),c-b),(raw(3,5,9.22,'保留正常的聊天界面'),length-c)]
    if sid=='install':
        split=cue(scene,'然后打开')
        return [(image('install'),split),(ui('select'),length-split)]
    if sid=='settings':
        split=cue(scene,'平时打字')
        return [(ui('settings'),split),(raw(6,6.2,10.58,'Esc 退出交互，回到正常界面'),length-split)]
    if sid=='discover':return [(image('discover'),7.2),(raw(4,8.0,13.3,'shadertoy.com / 挑自己喜欢的作品'),min(5.1,length-7.2)),(raw(6,2.2,5.8,'马里奥 · ShaderToy 作品'),max(0,length-12.3))]
    if sid=='import':
        split=cue(scene,'文件比较多的');third=cue(scene,'画面声音')
        return [(ui('import'),split),(ui('multi-import'),third-split),(ui('editor'),length-third)]
    if sid=='modify':
        split=cue(scene,'或者在现成的背景里');third=cue(scene,'不会写的话')
        return [(ui('editor'),split),(image('compare'),third-split),(image('ai'),length-third)]
    if sid=='play':
        split=cue(scene,'这个像素世界');third=cue(scene,'还有地牢')
        return [(raw(2,8.5,18.0,'造山 / 按住鼠标画，Shift 挖低'),split),(raw(7,8.3,15.1,'我的世界 · ShaderToy 作品','contain'),third-split),(raw(5,4.2,11.0,'地牢 / 方向键逐步移动','contain'),length-third)]
    if sid=='share':
        split=cue(scene,'记得保留')
        return [(raw(7,11.5,19.0,'欢迎分享你找到和修改的作品','contain'),split),(image('share'),length-split)]
    raise ValueError(sid)

def cover(sources):
    # Regenerate the existing code-native design the user selected; omit the
    # old greeting line, keeping the ocean, typography and mountain inset.
    for name,index,at in [('ocean',3,3),('mountain',2,15)]:
        run(['-ss',at,'-i',sources[index],'-frames:v','1','-y',WORK/f'cover-{name}.png'])
    im=Image.open(WORK/'cover-ocean.png').convert('RGB').resize((1920,1230)).crop((0,70,1920,1150))
    im=Image.blend(im,Image.new('RGB',im.size,'#0c1220'),.5);d=ImageDraw.Draw(im)
    d.rounded_rectangle((94,100,550,161),radius=20,fill='#628cff')
    text(d,(118,113),'DSH × SHADERTOY',28,'white',mono=True)
    text(d,(88,267),'把 AI 桌面',116,'white',bold=True)
    text(d,(88,412),'变成游乐场',116,'white',bold=True)
    text(d,(96,631),'会下雨 · 能造山 · 还能玩地牢',46,'#ccdbff',bold=True)
    mountain=Image.open(WORK/'cover-mountain.png').convert('RGB').resize((650,416));im.paste(mountain,(1160,590))
    d=ImageDraw.Draw(im);d.rectangle((1160,590,1810,1006),outline='#628cff',width=5)
    im.save(OUT/'B站封面.png');im.resize((1200,675)).save(ASSETS/'social-cover.jpg',quality=91)

def main():
    p=argparse.ArgumentParser();p.add_argument('--sources',type=Path,required=True);a=p.parse_args()
    sources={i:a.sources/f'屏幕录制 2026-10-29 {stamp}.mp4' for i,stamp in enumerate(STORY['sourceStamps'],1)}
    capture=json.loads((WORK/'captures/captures.json').read_text(encoding='utf-8'))
    parts=[];audio=[];events=[];srt=[];timeline=[];offset=0.
    for scene in STORY['scenes']:
        voice=WORK/f'narration/{scene["id"]}.mp3';length=math.ceil((duration(voice)+.45)*30)/30
        entries=[]
        shots=plan(scene,length,sources,capture)
        for i,(spec,seconds) in enumerate(shots):
            if seconds<.15:continue
            # Round edit points to real output frames; correct the last shot.
            seconds=round(seconds*30)/30
            if i==len(shots)-1:seconds=length-sum(e['duration'] for e in entries)
            parts.append(render_clip(spec,seconds,f'{scene["id"]}-{i}'))
            entries.append({'source':str(spec['file']),'in':spec.get('in',0),'out':spec.get('out'),'duration':seconds,'layout':spec.get('layout','cover')})
        captions(scene,offset,events,srt)
        audio.append((voice,offset+.16));timeline.append({'id':scene['id'],'heading':scene['heading'],'text':scene['text'],'start':offset,'duration':length,'shots':entries})
        offset+=length
        print('scene ready',scene['id'],round(length,2),flush=True)
    ass='''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Microsoft YaHei,42,&H00FFFFFF,&H00FFFFFF,&H00111A28,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,100,100,35,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''+ '\n'.join(events)+'\n'
    (WORK/'subtitles-v2.ass').write_text(ass,encoding='utf-8-sig')
    (OUT/'字幕.srt').write_text('\n'.join(srt),encoding='utf-8-sig')
    vtt=re.sub(r'(?m)^\d+\n','','\n'.join(srt));vtt=re.sub(r'(\d\d:\d\d:\d\d),(\d{3})',r'\1.\2',vtt)
    (ASSETS/'film.vtt').write_text('WEBVTT\n\n'+vtt,encoding='utf-8')
    (OUT/'剪辑时间线.json').write_text(json.dumps(timeline,ensure_ascii=False,indent=2),encoding='utf-8')
    (WORK/'concat-v2.txt').write_text('\n'.join(f"file '{f.as_posix()}'" for f in parts),encoding='utf-8')
    run(['-f','concat','-safe','0','-i',WORK/'concat-v2.txt','-c','copy','-y',WORK/'picture-v2.mp4'])
    inputs=['-i',WORK/'picture-v2.mp4'];filters=[];names=[]
    for i,(file,start) in enumerate(audio,1):
        inputs+=['-i',file];filters.append(f'[{i}:a]adelay={round(start*1000)}:all=1[a{i}]');names.append(f'[a{i}]')
    filters.append(''.join(names)+f'amix=inputs={len(names)}:duration=longest:normalize=0,loudnorm=I=-17:TP=-2:LRA=9[a]')
    ass_path=(WORK/'subtitles-v2.ass').as_posix().replace(':',r'\:')
    final=OUT/'DSH-ShaderToy-介绍片-v2-1080p.mp4'
    run([*inputs,'-filter_complex',';'.join(filters),'-map','0:v','-map','[a]','-vf',f"ass=filename='{ass_path}',setsar=1",'-t',offset,'-c:v','libx264','-preset','medium','-crf','19','-threads','4','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-movflags','+faststart','-metadata','title='+STORY['title'],'-y',final])
    run(['-i',final,'-vf','scale=1280:720','-c:v','libx264','-preset','medium','-crf','26','-threads','4','-c:a','aac','-b:a','96k','-movflags','+faststart','-y',ASSETS/'film.mp4'])
    cover(sources)
    print('FINAL',final,round(offset,2),flush=True)

if __name__=='__main__':main()
