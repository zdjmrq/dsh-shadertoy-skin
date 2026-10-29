"""Code-native motion graphics for the third film; diagrams are labelled as such."""
import math,re,subprocess,hashlib,json
from pathlib import Path
from functools import lru_cache
from PIL import Image,ImageDraw,ImageOps
from build_v2 import ROOT,FFMPEG,font,text

WORK=ROOT/'.tmp-validation/promo-v3'
WORK.mkdir(parents=True,exist_ok=True)
NAVY='#101a2e';WHITE='#f3f6ff';BLUE='#87a9ff';MINT='#7ce4ce';GRAY='#a5b3cd'

@lru_cache(maxsize=8)
def photo(name,size):
    return ImageOps.fit(Image.open(ROOT/f'site/assets/{name}.webp').convert('RGB'),size)

def rain_lines():
    source=(ROOT/'native-dist/presets/rain-window/image.glsl').read_text(encoding='utf-8')
    source=re.sub(r'/\*.*?\*/|//[^\n]*','',source,flags=re.S)
    return sum(bool(s.strip()) for s in source.splitlines())

def background(light=False):
    im=Image.new('RGB',(1920,1080),'#f3f5f9' if light else NAVY)
    d=ImageDraw.Draw(im)
    for x in range(96,1840,72):
        for y in range(64,1020,72):d.ellipse((x,y,x+2,y+2),fill='#e1e6ee' if light else '#23324d')
    return im

def heading(d,eyebrow,title,light=False):
    text(d,(96,55),eyebrow,25,'#315fe9' if light else BLUE)
    text(d,(94,150),title,63,'#17253a' if light else WHITE,bold=True)

def pill(d,box,label,color=MINT,light=False):
    d.rounded_rectangle(box,radius=22,fill='#ffffff' if light else '#1e304b',outline='#cbd5e7' if light else '#35506f',width=2)
    text(d,(box[0]+28,box[1]+18),label,32,color)

@lru_cache(maxsize=16)
def static(name):
    light=name in ['purpose','market','install','discover','files','share']
    im=background(light);d=ImageDraw.Draw(im)
    if name=='intro':
        heading(d,'DSH × SHADERTOY','代码会画画，')
        text(d,(94,250),'也会作曲。',102,WHITE,bold=True)
        text(d,(98,430),'给 AI 桌面，换一个有意思的世界。',39,GRAY)
        for i,label in enumerate(['实时画面','代码音乐','鼠标与键盘交互']):
            x=98+i*565;pill(d,(x,775,x+520,874),label,BLUE if i==1 else MINT)
    elif name=='purpose':
        heading(d,'HOW IT WORKS / 工作原理示意','聊天照常，背景换一个世界。',True)
        image=photo('rain',(1640,555)).copy();image=Image.blend(image,Image.new('RGB',image.size,'#17253a'),.24)
        im.paste(image,(140,305));d=ImageDraw.Draw(im)
        text(d,(205,365),'DeepSeek Harness',40,WHITE,bold=True)
        d.rounded_rectangle((205,510,1040,594),radius=18,fill='#37455e')
        text(d,(235,531),'聊天、输入、选中内容，照常。',31,WHITE)
        d.rounded_rectangle((205,641,1638,766),radius=26,fill='#26364c',outline='#73839b',width=2)
        text(d,(239,680),'你想一起做点什么？',32,'#b4c3d5')
        text(d,(300,899),'ShaderToy 代码   →   实时渲染   →   DSH 背景',35,'#315fe9',mono=False)
    elif name=='code':
        heading(d,'SMALL CODE / BIG IDEAS','一两百行，画出一个背景。')
        text(d,(112,485),'行画面代码，也能很有趣。',38,GRAY)
        for i,(label,count) in enumerate([('雨窗',rain_lines()),('海面',176)]):
            y=346+i*128;pill(d,(1110,y,1800,y+104),f'{label} · {count} 行')
        d.rounded_rectangle((96,640,1824,905),radius=22,fill='#18273e',outline='#2b4264',width=2)
        lines=['vec2 c = Drops(uv, t, staticDrops, layer1, layer2);','float focus = mix(maxBlur-c.y, minBlur, S(.1, .2, c.x));','vec3 col = textureLod(iChannel0, UV+n, focus).rgb;','fragColor = vec4(col, 1.);']
        for i,line in enumerate(lines):text(d,(130,674+i*48),line,29,WHITE if i==3 else '#a2bce9',mono=True)
        text(d,(100,930),'雨窗源码片段 · BigWings · CC BY-NC-SA 3.0；行数仅统计 Image，去掉注释与空行。',23,GRAY)
    elif name=='music':
        heading(d,'SOUND IS CODE, TOO / 声音合成示意','声音，也是算出来的。')
        text(d,(100,272),'mainSound(time)  →  左右声道采样  →  你听到的音乐',39,MINT,mono=False)
        d.rounded_rectangle((96,680,1824,904),radius=24,fill='#192a42',outline='#35506f',width=2)
        text(d,(136,716),'vec2 mainSound(float time) {',36,WHITE,mono=True)
        text(d,(136,773),'  return vec2(sin(6.28318 * 440.0 * time));',36,BLUE,mono=True)
        text(d,(136,830),'}',36,WHITE,mono=True)
        text(d,(100,940),'上方代码是最简单的单音示意；接下来听原作品里的程序化音乐。',24,GRAY)
    elif name=='market':
        heading(d,'INSTALL / 已上架 dshmarket','在插件市场里，搜这个名字。',True)
        text(d,(104,285),'dshmarket 插件市场',42,'#315fe9',bold=True)
        d.rounded_rectangle((100,397,1810,539),radius=22,fill='white',outline='#b9cbed',width=3)
        d.ellipse((145,438,183,476),outline='#315fe9',width=5)
        d.line((178,472,197,491),fill='#315fe9',width=5)
        d.rounded_rectangle((100,600,1810,824),radius=24,fill='white',outline='#d5ddea',width=2)
        icon=Image.open(ROOT/'assets/icon-180.png').convert('RGBA').resize((124,124));im.paste(icon,(142,648),icon)
        text(d,(308,639),'dsh-shadertoy-skin',45,'#17253a',mono=True)
        text(d,(311,720),'实时 ShaderToy 背景 · 画面 / 声音 / 交互',30,'#68778d')
        pill(d,(1550,658,1750,751),'安装','#315fe9',True)
        text(d,(105,910),'市场搜索安装方式示意 · 也可直接在插件页填包名。',25,'#68778d')
    elif name=='install':
        heading(d,'INSTALL / 装好后，完全退出并重启 DSH','重启，再选一个喜欢的作品。',True)
        text(d,(100,310),'dsh-shadertoy-skin',70,'#315fe9',mono=True)
        for i,(a,b) in enumerate([('01','安装插件'),('02','完全重启'),('03','打开 Shader 背景')]):
            x=100+575*i;pill(d,(x,520,x+535,705),a,'#315fe9',True);text(d,(x+30,615),b,35,'#17253a',bold=True)
        text(d,(100,837),'dsh plugin --profile desktop add dsh-shadertoy-skin',36,'#17253a',mono=True)
        text(d,(100,916),'喜欢命令行的话，也可以复制这一条。',25,'#68778d')
    elif name=='discover':
        heading(d,'GO EXPLORE / 从内置作品出发','去找你自己喜欢的世界。',True)
        text(d,(96,278),'www.shadertoy.com',75,'#315fe9',mono=True)
        for i,(label,slug) in enumerate([('雨窗 / rain','rain'),('像素 / pixel','mario'),('游戏 / game','dungeon')]):
            x=98+i*594;im.paste(photo(slug,(535,330)),(x,463));text(d,(x,822),label,32,'#17253a')
        text(d,(100,926),'15 个内置作品只是起点。看看、导入，也可以改成自己的风格。',26,'#68778d')
    elif name=='files':
        heading(d,'IMPORT / 一个项目，多个文件','画面、声音，放在一起。',True)
        for i,(name2,role) in enumerate([('Image','画面'),('Sound','声音'),('Buffer A','中间画面'),('Common','共用代码')]):
            x=100+445*i;pill(d,(x,360,x+410,500),name2,'#315fe9',True);text(d,(x+28,454),role,26,'#68778d')
        d.rounded_rectangle((100,615,1820,864),radius=22,fill='white',outline='#cbd5e7',width=2)
        text(d,(135,656),'我的背景项目',45,'#17253a',bold=True)
        text(d,(138,750),'简单的粘代码，多文件一起导入，再按标签切换编辑。',34,'#68778d')
    elif name=='share':
        heading(d,'MAKE IT YOURS / 欢迎分享','小段代码，也可以有很多可能。',True)
        text(d,(100,322),'找到好看的，改出有意思的。',48,'#17253a',bold=True)
        text(d,(100,439),'github.com/zdjmrq/dsh-shadertoy-skin',45,'#315fe9',mono=True)
        for i,label in enumerate(['截图','参数','代码 / Issues / PR']):
            x=100+i*565;pill(d,(x,634,x+525,745),label,'#315fe9',True)
        text(d,(100,858),'安装方法和项目地址在简介里。',32,'#68778d')
        text(d,(100,920),'分享第三方作品时，保留原作者署名与许可。',27,'#68778d')
    else:raise ValueError(name)
    return im

def frame(name,t,length):
    im=static(name).copy();d=ImageDraw.Draw(im)
    if name=='intro':
        # A small orbit of bright pixels; a motif, not another recording.
        for i in range(32):
            a=i*2.39996+t*.23;r=80+12*i
            x=1430+math.cos(a)*r*.75;y=445+math.sin(a)*r*.65
            s=6+4*math.sin(t*1.7+i)**2;d.rounded_rectangle((x,y,x+s,y+s),radius=2,fill=MINT if i%3 else BLUE)
        text(d,(1242,342),'{ }',151,BLUE,mono=True)
    elif name=='purpose':
        for i in range(28):
            x=180+(i*163)%1550;y=310+(i*37+int(t*80))%520
            d.line((x,y,x-5,y+24),fill='#b9c9e0',width=2)
        x=300+(t*.17%1)*1250;d.ellipse((x,970,x+13,983),fill='#315fe9')
    elif name=='code':
        n=round(100+100*min(1,t/1.7));text(d,(99,306),str(n),143,MINT,mono=True,bold=True)
        y=674+(int(t*.7)%4)*48;d.rectangle((107,y+7,113,y+43),fill=MINT)
    elif name=='music':
        points=[]
        for x in range(105,1817,5):
            v=math.sin(x*.025-t*4)*(.45+.25*math.sin(x*.006+t))+.16*math.sin(x*.067-t*7)
            points.append((x,489+v*115))
        d.line(points,fill=MINT,width=5)
        for i in range(62):
            x=108+i*28;h=12+30*abs(math.sin(t*2+i*.8));d.line((x,615-h,x,615),fill='#4b6b9b',width=8)
    elif name=='market':
        label='dsh-shadertoy-skin';visible=label[:min(len(label),int(t*8))]
        text(d,(237,435),visible+('|' if int(t*2)%2==0 else ''),47,'#17253a',mono=True)
    elif name in ['install','files','share','discover']:
        if name=='files':
            for i in range(4):
                x=305+i*445;d.line((x,515,x,595),fill='#c4d3ef',width=3)
                y=520+(t*.5+i*.23)%1*70;d.ellipse((x-6,y-6,x+6,y+6),fill='#315fe9')
        elif name=='install':
            i=min(2,int(t/max(1,length)*3));x=100+575*i
            d.rounded_rectangle((x,520,x+535,705),radius=22,outline='#315fe9',width=4)
    # A short fade-in and an eased rise give headings room to arrive.
    if t<.22:
        blank=background(name in ['purpose','market','install','discover','files','share']);im=Image.blend(blank,im,min(1,t/.22))
    return im

def render(name,length):
    length=round(length*30)/30
    key=hashlib.sha256((Path(__file__).read_text(encoding='utf-8')+name+str(length)).encode()).hexdigest()[:12]
    dest=WORK/f'{name}-{key}.mp4'
    if dest.exists():return dest
    proc=subprocess.Popen([FFMPEG,'-v','error','-f','rawvideo','-pixel_format','rgb24','-video_size','1920x1080','-framerate','30','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-threads','4','-y',str(dest)],stdin=subprocess.PIPE,stderr=subprocess.PIPE)
    try:
        for i in range(round(length*30)):proc.stdin.write(frame(name,i/30,length).tobytes())
        proc.stdin.close();err=proc.stderr.read();code=proc.wait()
        if code:raise RuntimeError(err.decode('utf-8','replace'))
    except BaseException:
        proc.kill();proc.wait();dest.unlink(missing_ok=True);raise
    print('motion ready',name,length,flush=True);return dest

if __name__=='__main__':
    for name in ['intro','purpose','code','music','market','install','discover','files','share']:
        frame(name,2,8).save(WORK/f'design-{name}.png')
