"""Build the promo from user recordings; no private footage is uploaded by this tool.

Requires Python 3.11+, Pillow, numpy, edge-tts and imageio-ffmpeg. Only the written
narration is sent to Microsoft's Edge speech service. Original files are read-only.
"""
import argparse, asyncio, json, math, re, shutil, subprocess, wave
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import edge_tts, imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[2]
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
STORY = json.loads(Path(__file__).with_name('storyboard.json').read_text(encoding='utf-8'))
OUT = ROOT / 'artifacts/promo'
WORK = ROOT / '.tmp-validation/promo/build'
ASSETS = ROOT / 'site/assets'
INK = '#0c1220'; WHITE = '#f7f8fa'; BLUE = '#628cff'; MUTED = '#a8b4cb'

def run(args):
    p = subprocess.run([FFMPEG,'-hide_banner','-loglevel','error',*map(str,args)],capture_output=True)
    if p.returncode: raise RuntimeError(p.stderr.decode('utf-8','replace')[-5000:])

def fresh(file, *inputs):
    return file.exists() and file.stat().st_mtime >= max(p.stat().st_mtime for p in inputs)

def duration(file):
    p = subprocess.run([FFMPEG,'-hide_banner','-i',str(file)],capture_output=True)
    m = re.search(rb'Duration: (\d+):(\d+):([\d.]+)',p.stderr)
    if not m: raise RuntimeError(f'Cannot read duration: {file}')
    return int(m[1])*3600+int(m[2])*60+float(m[3])

def font(size, mono=False):
    return ImageFont.truetype('C:/Windows/Fonts/consola.ttf' if mono else 'C:/Windows/Fonts/msyhbd.ttc',size)

def text(draw, xy, value, size=32, fill=WHITE, mono=False):
    draw.text(xy,value,font=font(size,mono and all(ord(c)<128 for c in value)),fill=fill)

def overlay(scene, number):
    im = Image.new('RGBA',(1920,1080),(0,0,0,0)); d=ImageDraw.Draw(im)
    text(d,(80,55),'DSH / SHADERTOY',24,BLUE,True)
    text(d,(80,168),scene['label'],22,MUTED)
    for i,line in enumerate(scene['title']): text(d,(76,234+i*79),line,52)
    d.rectangle((80,435,140,440),fill=BLUE)
    for i,line in enumerate(scene['points']):
        # Latin package name is wider; use a compact mono size.
        text(d,(80,483+i*45),line,19 if len(line)>19 else 25,MUTED,False)
    text(d,(80,906),f'{number:02d} / 08',24,BLUE,True)
    text(d,(520,974),'编辑器结构示意 / 自写示例代码' if scene.get('graphic')=='editor' else '真实 DSH 录屏  /  dsh-shadertoy-skin',19,MUTED)
    im.save(WORK/f'{scene["id"]}-overlay.png')

def graphic(scene):
    im=Image.new('RGB',(1920,1080),INK);d=ImageDraw.Draw(im)
    # A drawn explanatory graphic, visibly labelled as a diagram.
    if scene['graphic']=='editor':
        d.rounded_rectangle((510,116,1850,926),radius=20,fill='#151e30',outline='#33425e',width=2)
        text(d,(548,148),'多文件编辑结构示意',24,MUTED)
        x=548
        for label in ['Image','Sound','Common','Buffer A','+']:
            width=150 if label!='+' else 64
            d.rounded_rectangle((x,210,x+width,266),radius=10,fill=BLUE if label=='Image' else '#202c43')
            text(d,(x+18,220),label,25,WHITE,True);x+=width+12
        lines=[('// 自己的画面，自己的规则。',MUTED),('void mainImage(out vec4 color,',BLUE),('               in vec2 pixel) {',BLUE),('    vec2 uv = pixel / iResolution.xy;',WHITE),('    float t = iTime;',WHITE),('    color = vec4(',WHITE),('        0.5 + 0.5 * cos(t + uv.xyx',WHITE),('        + vec3(0.0, 2.0, 4.0)), 1.0);',WHITE),('}',BLUE)]
        for i,(line,color) in enumerate(lines): text(d,(552,312+i*48),line,30,color,True)
        d.rounded_rectangle((550,812,1808,875),radius=12,fill=BLUE)
        text(d,(1030,826),'保存并运行',27,WHITE)
        text(d,(550,943),'Image · Sound · Common · Buffer A–D · Include',21,MUTED,True)
        overlay(scene,6)
        im=Image.alpha_composite(im.convert('RGBA'),Image.open(WORK/f'{scene["id"]}-overlay.png')).convert('RGB')
    else:
        logo=Image.open(ROOT/'assets/icon-180.png').convert('RGBA').resize((108,108))
        im.paste(logo,(906,80),logo)
        text(d,(630,226),'下一张桌面，由你定义。',58)
        text(d,(647,322),'人类和大肥鱼，带上脑洞来玩。',36,MUTED)
        d.rounded_rectangle((145,462,1775,594),radius=18,fill='#17243b',outline='#41659e',width=2)
        text(d,(194,502),'dsh plugin --profile desktop add dsh-shadertoy-skin',38,WHITE,True)
        text(d,(415,651),'装好后完全退出并重启 DSH → Shader 背景',32,MUTED)
        text(d,(440,746),'github.com/zdjmrq/dsh-shadertoy-skin',35,BLUE,True)
        text(d,(715,871),'开源 · 欢迎 Issue / PR',30)
        text(d,(490,995),'AI 合成旁白 / 真实 DSH 录屏 / 程序生成配乐',24,MUTED)
    im.save(WORK/f'{scene["id"]}-graphic.png')

async def voices():
    sem=asyncio.Semaphore(2)
    async def one(scene):
        file=WORK/f'{scene["id"]}.mp3';meta=WORK/f'{scene["id"]}.jsonl'
        if fresh(file, Path(__file__).with_name('storyboard.json')) and meta.exists(): return
        async with sem:
            await edge_tts.Communicate(scene['text'],voice=STORY['voice'],rate=STORY['rate']).save(str(file),str(meta))
            print(f'voice: {scene["id"]}',flush=True)
    await asyncio.gather(*(one(s) for s in STORY['scenes']))

def website_media(sources):
    # Compact, silent excerpts; none of the complete source recordings enter Git.
    specs=[('rain',1,7.5,6.5,13),('mountain',2,7,8,16),('ocean',3,.4,8,3),
           ('take-on-me',4,3.5,9,8),('dungeon',5,4,8,8),('mario',6,2,7.6,4)]
    for slug,index,start,length,poster in specs:
        dest=ASSETS/f'{slug}.mp4'
        if not dest.exists():
            run(['-ss',start,'-i',sources[index],'-t',length,'-an','-vf','scale=1280:820,fps=24','-c:v','libx264','-preset','medium','-crf','27','-pix_fmt','yuv420p','-threads','4','-movflags','+faststart','-y',dest])
        run(['-ss',poster,'-i',sources[index],'-frames:v','1','-vf','scale=1280:820','-y',WORK/f'{slug}.png'])
        Image.open(WORK/f'{slug}.png').save(ASSETS/f'{slug}.webp',quality=86,method=6)
        print(f'website: {slug}',flush=True)
    shutil.copy2(ROOT/'icon.svg',ASSETS/'icon.svg')

def wrap_subtitle(value,limit=27):
    # Count English at half width, prefer punctuation when breaking a sentence.
    lines=[];line='';weight=0
    for char in value:
        w=.55 if ord(char)<128 else 1
        if weight+w>limit: lines.append(line);line='';weight=0
        line+=char;weight+=w
    if line: lines.append(line)
    return '\\N'.join(lines)

def ass_time(second):
    n=round(second*100);return f'{n//360000}:{n//6000%60:02d}:{n//100%60:02d}.{n%100:02d}'

def srt_time(second):
    n=round(second*1000);return f'{n//3600000:02d}:{n//60000%60:02d}:{n//1000%60:02d},{n%1000:03d}'

def render(sources):
    timeline=[];offset=0.;subtitle=[];srt=[];narration=[];parts=[]
    for i,scene in enumerate(STORY['scenes'],1):
        voice=WORK/f'{scene["id"]}.mp3';voice_duration=duration(voice)
        length=math.ceil((voice_duration+.9)*30)/30
        timeline.append({**scene,'start':round(offset,3),'duration':length,'voiceDuration':voice_duration})
        narration.append((voice,offset+.2))
        events=[json.loads(line) for line in (WORK/f'{scene["id"]}.jsonl').read_text(encoding='utf-8').splitlines()]
        events=[e for e in events if e['type']=='SentenceBoundary']
        for event_index,event in enumerate(events):
            start=offset+.2+event['offset']/1e7
            end=min(offset+length-.1,start+event['duration']/1e7+.15)
            if event_index+1<len(events):end=min(end,offset+.2+events[event_index+1]['offset']/1e7-.03)
            wrapped=wrap_subtitle(event['text'])
            subtitle.append(f'Dialogue: 0,{ass_time(start)},{ass_time(end)},Default,,0,0,0,,{wrapped}')
            srt.append(f'{len(srt)+1}\n{srt_time(start)} --> {srt_time(end)}\n{wrapped.replace(chr(92)+"N",chr(10))}\n')
        if scene.get('graphic'):
            graphic(scene)
            dest=WORK/f'{i:02d}-graphic.mp4'
            if not fresh(dest, Path(__file__), Path(__file__).with_name('storyboard.json'), voice):
                run(['-loop','1','-framerate','30','-i',WORK/f'{scene["id"]}-graphic.png','-t',length,'-vf',f'fade=t=in:st=0:d=0.18,fade=t=out:st={length-.18}:d=0.18','-an','-c:v','libx264','-preset','medium','-crf','19','-pix_fmt','yuv420p','-threads','4','-y',dest])
            parts.append(dest)
        else:
            overlay(scene,i)
            remaining=length
            for j,shot in enumerate(scene['shots']):
                shot_length=round(length*shot['weight']*30)/30 if j<len(scene['shots'])-1 else remaining
                remaining-=shot_length
                dest=WORK/f'{i:02d}-{j:02d}.mp4'
                if not fresh(dest, Path(__file__), Path(__file__).with_name('storyboard.json'), voice, sources[shot['source']]):
                    if shot.get('freeze'):
                        still=WORK/f'{scene["id"]}-freeze.png'
                        run(['-ss',shot['start'],'-i',sources[shot['source']],'-frames:v','1','-y',still])
                        input_args=['-loop','1','-framerate','30','-i',still]
                    else:
                        input_args=['-ss',shot['start'],'-stream_loop','-1','-i',sources[shot['source']]]
                    filters=f'[0:v]scale=1328:850,setsar=1,fps=30,split[fg][b];[b]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,gblur=sigma=50,eq=brightness=-0.35:saturation=0.45[bg];[bg]drawbox=x=0:y=0:w=500:h=1080:color=0x0c1220@0.93:t=fill[base];[base][fg]overlay=x=520:y=110[screen];[screen][1:v]overlay=0:0,fade=t=in:st=0:d=0.15,fade=t=out:st={shot_length-.15}:d=0.15[v]'
                    run([*input_args,'-loop','1','-i',WORK/f'{scene["id"]}-overlay.png','-filter_complex',filters,'-map','[v]','-t',shot_length,'-an','-c:v','libx264','-preset','medium','-crf','19','-pix_fmt','yuv420p','-threads','4','-y',dest])
                parts.append(dest)
        offset+=length
        print(f'render: {i}/8 {scene["id"]} ({length:.1f}s)',flush=True)
    ass='''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Microsoft YaHei,38,&H00FFFFFF,&H00FFFFFF,&H00101925,&HA0101925,0,0,0,0,100,100,0,0,3,1,0,2,80,80,24,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''+ '\n'.join(subtitle)+'\n'
    (WORK/'subtitles.ass').write_text(ass,encoding='utf-8-sig')
    (OUT/'字幕.srt').write_text('\n'.join(srt),encoding='utf-8-sig')
    vtt=re.sub(r'(?m)^\d+\n','','\n'.join(srt))
    vtt=re.sub(r'(\d\d:\d\d:\d\d),(\d{3})',r'\1.\2',vtt)
    (ASSETS/'film.vtt').write_text('WEBVTT\n\n'+vtt,encoding='utf-8')
    (OUT/'剪辑时间线.json').write_text(json.dumps(timeline,ensure_ascii=False,indent=2),encoding='utf-8')
    (WORK/'concat.txt').write_text('\n'.join(f"file '{p.as_posix()}'" for p in parts),encoding='utf-8')
    run(['-f','concat','-safe','0','-i',WORK/'concat.txt','-c','copy','-y',WORK/'picture.mp4'])
    music(offset)
    inputs=['-i',WORK/'picture.mp4','-i',WORK/'music.wav']
    filters=['[1:a]volume=0.17[music]'];names=['[music]']
    for i,(file,start) in enumerate(narration,2):
        inputs+=['-i',file]
        filters.append(f'[{i}:a]adelay={round(start*1000)}:all=1[v{i}]');names.append(f'[v{i}]')
    filters.append(''.join(names)+f'amix=inputs={len(names)}:duration=longest:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=out:st={offset-1.8}:d=1.8[a]')
    ass_path=(WORK/'subtitles.ass').as_posix().replace(':',r'\:')
    final=OUT/'DSH-ShaderToy-宣传片-1080p.mp4'
    run([*inputs,'-filter_complex',';'.join(filters),'-map','0:v','-map','[a]','-vf',f"ass=filename='{ass_path}',setsar=1",'-t',offset,'-c:v','libx264','-preset','medium','-crf','19','-pix_fmt','yuv420p','-threads','4','-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-movflags','+faststart','-metadata','title='+STORY['title'],'-y',final])
    run(['-i',final,'-vf','scale=1280:720','-c:v','libx264','-preset','medium','-crf','27','-threads','4','-c:a','aac','-b:a','96k','-movflags','+faststart','-y',ASSETS/'film.mp4'])
    cover(sources)
    print(f'FINAL: {final} / {offset:.1f}s',flush=True)

def music(length):
    sr=48000;audio=np.zeros(round(length*sr),dtype=np.float32)
    # Original quiet procedural ambient bed: no samples or borrowed melody.
    chords=[[48,55,59,64],[45,52,55,60],[41,48,52,57],[43,50,55,57]]
    for start in np.arange(0,length,4):
        size=min(4*sr,len(audio)-round(start*sr));t=np.arange(size,dtype=np.float32)/sr
        env=np.minimum(t/.35,1)*np.minimum((size/sr-t)/.8,1)
        chord=np.zeros(size,dtype=np.float32)
        for midi in chords[int(start/4)%4]:
            f=440*2**((midi-69)/12)
            chord+=(np.sin(2*np.pi*f*t)+.18*np.sin(2*np.pi*2*f*t))*.12
        audio[round(start*sr):round(start*sr)+size]+=chord*env
    audio*=np.minimum(np.arange(len(audio))/sr/2,1)
    pcm=(np.clip(audio,-1,1)*32767).astype('<i2')
    with wave.open(str(WORK/'music.wav'),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(sr);f.writeframes(pcm.tobytes())

def cover(sources):
    im=Image.open(WORK/'ocean.png').convert('RGB').resize((1920,1230)).crop((0,70,1920,1150))
    im=Image.blend(im,Image.new('RGB',im.size,INK),.5)
    d=ImageDraw.Draw(im);d.rounded_rectangle((94,100,550,161),radius=20,fill=BLUE)
    text(d,(118,113),'DSH × SHADERTOY',28,WHITE,True)
    text(d,(88,267),'把 AI 桌面',116)
    text(d,(88,412),'变成游乐场',116)
    text(d,(96,631),'会下雨 · 能造山 · 还能玩地牢',46,'#ccdbff')
    text(d,(98,923),'各位人类和 AI 大家好，大肥鱼也欢迎。',32)
    thumb=Image.open(WORK/'mountain.png').convert('RGB').resize((650,416))
    im.paste(thumb,(1160,590))
    d=ImageDraw.Draw(im);d.rectangle((1160,590,1810,1006),outline=BLUE,width=5)
    im.save(OUT/'B站封面.png')
    im.resize((1200,675)).save(ASSETS/'social-cover.jpg',quality=90)

def main():
    p=argparse.ArgumentParser();p.add_argument('--sources',type=Path,required=True);p.add_argument('--stage',choices=['prepare','render','all'],default='all');a=p.parse_args()
    for d in [OUT,WORK,ASSETS]:d.mkdir(parents=True,exist_ok=True)
    sources={i:a.sources/f'屏幕录制 2026-10-29 {stamp}.mp4' for i,stamp in enumerate(STORY['sourceStamps'],1)}
    for file in sources.values():
        if not file.is_file():raise FileNotFoundError(file)
    if a.stage in ['prepare','all']:asyncio.run(voices());website_media(sources)
    if a.stage in ['render','all']:render(sources)

if __name__=='__main__':main()
