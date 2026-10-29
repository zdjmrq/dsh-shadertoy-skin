"""Package the approved v4 movie unchanged; optionally export a web derivative."""
import argparse,hashlib,json,shutil,zipfile
from pathlib import Path
from build_v2 import ROOT,run,duration

OUT=ROOT/'artifacts/promo-v4';KIT=OUT/'发布包';ASSETS=ROOT/'site/assets'
TAG='promo-2026-10-29'
RELEASE=f'https://github.com/zdjmrq/dsh-shadertoy-skin/releases/tag/{TAG}'
TITLE='把 AI 桌面变成游乐场：代码会画画，也会作曲'
DESCRIPTION='''各位人类和ai大家好呀。

给 DeepSeek Harness 做了个 ShaderToy 背景插件：聊天窗口后面可以下雨、翻起海浪，也能用鼠标造山、用方向键逛地牢。

有些画面，一两百行着色器代码就能做出来；音乐也可以由代码实时合成。视频里能听到 Take On Me、Never Gonna Give You Up 和马里奥三个作品的程序化音乐。

15 个内置作品，支持粘贴代码、多文件导入和标签页编辑。透明度、亮度、速度、画质可调，设置自动记忆。想玩时点「预览并交互」，按 Esc 返回；平时照常聊天。

已经上架 dshmarket 插件市场，搜索 dsh-shadertoy-skin 即可安装：https://dshmarket.com/
也可以执行：
dsh plugin --profile desktop add dsh-shadertoy-skin
安装后完全退出并重启 DSH，打开左栏「Shader 背景」。

项目：https://github.com/zdjmrq/dsh-shadertoy-skin
演示与安装：https://zdjmrq.github.io/dsh-shadertoy-skin/

推荐去 https://www.shadertoy.com 逛逛，找到喜欢的作品，导入后改颜色、调镜头、加一点自己的元素。不会写，也可以把源码和想法交给 AI 辅助修改。欢迎分享截图、参数、作品链接和代码改进。

视频含本人录屏、截图和说明动画，旁白为 AI 合成。三段音乐来自对应作品的录屏，其余片段无额外配乐。

感谢原作者：海面/TDM；雨窗/BigWings；造山/runevision、Fewes、Clay John；Take On Me 与 Never Gonna Give You Up/Tonny Espeset；Mario/iq；我的世界/fb39ca4（噪声 Ashima Arts）；风中的树/Maurrourgilk（SDF mercury，Hash David Hoskins）。
第三方 ShaderToy 作品按 CC BY-NC-SA 3.0 收录，部分组件另有 MPL 2.0、CC BY-SA 4.0 等许可；作品来源、改编说明与完整许可：https://github.com/zdjmrq/dsh-shadertoy-skin/blob/main/THIRD-PARTY-NOTICES.md
插件自写代码为 MIT。分享作品时请保留原作者署名与许可。
'''
TAGS=['DeepSeek','DSH','ShaderToy','开源','桌面美化','软件分享','创意编程','图形学','AI','独立开发']
PINNED='''插件已上架 dshmarket，搜索 dsh-shadertoy-skin 就能装。
安装与演示：https://zdjmrq.github.io/dsh-shadertoy-skin/
GitHub：https://github.com/zdjmrq/dsh-shadertoy-skin

装好记得完全退出并重启 DSH。推荐去 shadertoy.com 找喜欢的作品，导入后也可以自己改，或者让 AI 帮忙改。
你们最想把什么放进聊天背景？欢迎贴作品链接、截图和改进想法，分享时记得保留原作者署名。
'''

def digest(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--site',action='store_true');args=parser.parse_args()
    movie=OUT/'DSH-ShaderToy-介绍片-v4-1080p.mp4';original=digest(movie)
    timeline=json.loads((OUT/'剪辑时间线.json').read_text(encoding='utf-8'))
    total=sum(s['duration'] for s in timeline);assert abs(duration(movie)-total)<.1
    KIT.mkdir(parents=True,exist_ok=True)
    selected=[('intro','开场与插件用途'),('code','一两百行代码，实时生成画面'),('music','听代码生成的音乐：三个作品'),('install','dshmarket 安装与背景设置'),('discover','找作品、导入，再自己改一点'),('play','造山、像素世界和地牢'),('share','项目地址与分享')]
    chapters=[]
    for sid,label in selected:
        at=int(next(s['start'] for s in timeline if s['id']==sid));chapters.append(f'{at//60:02d}:{at%60:02d} {label}')
    chapter_text='\n'.join(chapters)+'\n'
    manifest=json.loads((ROOT/'native-dist/presets/index.json').read_text(encoding='utf-8'))
    ids=['seascape','rain-window','mountain-paint','take-on-me','never-gonna-give-you-up','mario','voxel-world','dungeon-game','tree-in-wind']
    credits='# 作品与许可\n\n本片为项目介绍和实际使用演示。第三方作品的原作者与来源如下。\n\n'
    for pid in ids:
        p=next(p for p in manifest if p['id']==pid)
        credits+=f'- **{p["name"]}** — {p["author"]}\n  来源：{p["sourceUrl"]}\n  项目许可：{p["license"]}\n\n'
    credits+='''CC BY-NC-SA 3.0：https://creativecommons.org/licenses/by-nc-sa/3.0/

组件另保留自己的许可与署名：造山侵蚀算法含 MPL 2.0；风中的树 SDF helpers 来自 mercury / hg_sdf，Hash without Sine 来自 David Hoskins（CC BY-SA 4.0）；我的世界噪声署名 Ashima Arts。音乐作品中的原始曲目等内容仍归各自权利人所有。插件不主张对第三方作品或音乐拥有所有权。

完整组件说明与原始声明：
https://github.com/zdjmrq/dsh-shadertoy-skin/blob/main/THIRD-PARTY-NOTICES.md

录屏与树景设置截图由项目作者提供；说明动画和剪辑由项目制作。旁白使用 AI 合成女声。海面加星光为基于 TDM 原作的代码改编示例。雨窗 Image 145 行、海面 Image 176 行仅统计去掉注释与空行后的画面代码，不包括音频、纹理与插件代码。
'''
    guide=f'''# B站发布指南

定稿：v4，约 2 分 3 秒；视频与用户确认的文件逐字节一致。

1. 打开 B站创作中心，选择视频投稿，上传「DSH-ShaderToy-介绍片-1080p.mp4」。
2. 标题用「标题.txt」第一行；简介完整复制「简介.txt」。
3. 封面手动选择「B站封面.png」，避免使用自动截帧替换已经确认的封面。
4. 分区优先选投稿页中的软件应用、软件工具相关栏目；若当前大类显示科技数码，选择其中最匹配的软件栏目。这个视频主要是软件与开源项目介绍。
5. 标签按「标签.txt」逐项添加。投稿类型选自制：片子是项目介绍与自有录屏剪辑，同时保留第三方作品的署名与许可。
6. 在「创作声明」里选择「该视频使用人工智能合成技术」，对应片中的合成旁白。[B站官方说明](https://www.bilibili.com/opus/1106496554576904197)
7. 如果投稿页提供章节设置，填「章节.txt」；也可以把章节附在简介末尾。
8. 发布前预览开头、三段音乐及最后项目地址。成片已含硬字幕，无需再烧录一层；SRT/VTT 留作辅助字幕、归档或后续编辑。
9. 发布成功后，把「置顶评论.txt」发到自己的评论区并置顶。作品署名与许可证在「作品与许可.md」及简介链接里。

## 文件说明

- 1080p MP4：1920×1080、30 fps、H.264、AAC 48 kHz 立体声，适合投稿。
- PNG 封面：1920×1080，16:9，沿用已确认的设计。
- 简介/标题/章节/标签/置顶评论：都可直接复制。
- SHA256SUMS.txt：本包各文件的校验值。
- {RELEASE}：GitHub 上的发布包入口。

本包不包含私人原始录屏、临时文件或原始设置截图。
'''
    fields={'标题.txt':TITLE+'\n\n备选：\n会下雨、会奏乐，还能造山：我给 DSH 做了个 ShaderToy 插件\n给 DeepSeek Harness 换个背景：代码画出来的雨窗与海面\n','简介.txt':DESCRIPTION,'章节.txt':chapter_text,'标签.txt':'\n'.join(TAGS)+'\n','置顶评论.txt':PINNED,'发布指南.md':guide,'作品与许可.md':credits}
    for name,content in fields.items():(KIT/name).write_text(content,encoding='utf-8-sig')
    for source,target in [(movie,'DSH-ShaderToy-介绍片-1080p.mp4'),(OUT/'B站封面.png','B站封面.png'),(OUT/'字幕.srt','字幕.srt'),(OUT/'字幕.vtt','字幕.vtt')]:shutil.copyfile(source,KIT/target)
    assert digest(KIT/'DSH-ShaderToy-介绍片-1080p.mp4')==original
    sums='\n'.join(f'{digest(p)}  {p.name}' for p in sorted(KIT.iterdir()) if p.is_file() and p.name!='SHA256SUMS.txt')+'\n'
    (KIT/'SHA256SUMS.txt').write_text(sums,encoding='utf-8')
    archive=OUT/'dsh-shadertoy-bilibili-kit-v4.zip'
    with zipfile.ZipFile(archive,'w') as z:
        for p in sorted(KIT.iterdir()):
            if p.is_file():z.write(p,p.name,compress_type=zipfile.ZIP_STORED if p.suffix=='.mp4' else zipfile.ZIP_DEFLATED)
    md=f'# B站发布资料（已确认定稿 v4）\n\n[完整发布包]({RELEASE}) · 视频约 2 分 3 秒。\n\n## 推荐标题\n\n{TITLE}\n\n## 简介（完整复制）\n\n{DESCRIPTION}\n## 章节\n\n'+ '\n'.join('- '+c for c in chapters)+ '\n\n## 标签\n\n'+ '、'.join(TAGS)+'\n\n## 置顶评论\n\n'+PINNED+'\n'+guide+'\n'+credits
    (ROOT/'docs/bilibili-promo.md').write_text(md,encoding='utf-8')
    (OUT/'B站发布文案.md').write_text(md,encoding='utf-8')
    if args.site:
        run(['-i',movie,'-vf','scale=1280:720','-c:v','libx264','-preset','medium','-crf','26','-threads','4','-c:a','aac','-b:a','128k','-movflags','+faststart','-y',ASSETS/'film.mp4'])
        shutil.copyfile(OUT/'字幕.vtt',ASSETS/'film.vtt')
        from PIL import Image
        Image.open(OUT/'B站封面.png').convert('RGB').resize((1200,675)).save(ASSETS/'social-cover.jpg',quality=91)
        info=json.loads((OUT/'film-info.json').read_text(encoding='utf-8'));info.update(width=1280,height=720)
        (ASSETS/'film-info.json').write_text(json.dumps(info,ensure_ascii=False,indent=2),encoding='utf-8')
        p=ROOT/'site/index.html';s=p.read_text(encoding='utf-8').replace('film.mp4?v=3','film.mp4?v=4').replace('film.vtt?v=3','film.vtt?v=4')
        s=s.replace('Take On Me 与 Never Gonna Give You Up 片段','Take On Me、Never Gonna Give You Up 与马里奥片段')
        if '风中的树 — Maurrourgilk' not in s:s=s.replace('</li><li>我的世界 / Voxel World','</li><li>风中的树 — Maurrourgilk；SDF helpers：mercury；Hash：David Hoskins · <a href="https://www.shadertoy.com">ShaderToy</a></li><li>我的世界 / Voxel World')
        needle='<p class="capture-note">旁白为 AI 合成女声。'
        if RELEASE not in s:s=s.replace(needle,f'<p><a class="text-link" href="{RELEASE}" target="_blank" rel="noopener noreferrer">下载 1080p 成片、封面与完整发布包 ↗</a></p>'+needle)
        p.write_text(s,encoding='utf-8')
    assert digest(movie)==original,'The approved movie must never be re-rendered during publishing'
    notes=f'''这是已确认的 2 分 3 秒宣传视频与B站发布资料，不是插件的新版本。插件版本仍为 0.4.6。

网页演示：https://zdjmrq.github.io/dsh-shadertoy-skin/?v=4#film

下载 ZIP 可一次取得：1080p 成片、PNG 封面、SRT/VTT 字幕、标题、简介、章节、标签、置顶评论、发布指南及作品署名。成片已有硬字幕。

原始录屏和个人设置原图没有上传。第三方作品保留原作者及许可；详见资料包及仓库 THIRD-PARTY-NOTICES.md。旁白为 AI 合成女声。
'''
    (OUT/'release-notes.md').write_text(notes,encoding='utf-8')
    (OUT/'approved-video.sha256').write_text(original+'\n',encoding='ascii')
    print('Approved video SHA256:',original);print('Description characters:',len(DESCRIPTION));print('Kit:',archive)

if __name__=='__main__':main()
