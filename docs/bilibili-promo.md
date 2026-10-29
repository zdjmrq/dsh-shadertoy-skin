# B站发布资料（已确认定稿 v4）

[完整发布包](https://github.com/zdjmrq/dsh-shadertoy-skin/releases/tag/promo-2026-10-29) · 视频约 2 分 3 秒。

## 推荐标题

把 AI 桌面变成游乐场：代码会画画，也会作曲

## 简介（完整复制）

各位人类和ai大家好呀。

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

## 章节

- 00:00 开场与插件用途
- 00:18 一两百行代码，实时生成画面
- 00:31 听代码生成的音乐：三个作品
- 00:48 dshmarket 安装与背景设置
- 01:06 找作品、导入，再自己改一点
- 01:34 造山、像素世界和地牢
- 01:52 项目地址与分享

## 标签

DeepSeek、DSH、ShaderToy、开源、桌面美化、软件分享、创意编程、图形学、AI、独立开发

## 置顶评论

插件已上架 dshmarket，搜索 dsh-shadertoy-skin 就能装。
安装与演示：https://zdjmrq.github.io/dsh-shadertoy-skin/
GitHub：https://github.com/zdjmrq/dsh-shadertoy-skin

装好记得完全退出并重启 DSH。推荐去 shadertoy.com 找喜欢的作品，导入后也可以自己改，或者让 AI 帮忙改。
你们最想把什么放进聊天背景？欢迎贴作品链接、截图和改进想法，分享时记得保留原作者署名。

# B站发布指南

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
- https://github.com/zdjmrq/dsh-shadertoy-skin/releases/tag/promo-2026-10-29：GitHub 上的发布包入口。

本包不包含私人原始录屏、临时文件或原始设置截图。

# 作品与许可

本片为项目介绍和实际使用演示。第三方作品的原作者与来源如下。

- **海面（Seascape）** — Alexander Alekseev aka TDM
  来源：https://www.shadertoy.com/view/Ms2SD1
  项目许可：CC BY-NC-SA 3.0

- **下雨的窗户** — Martijn Steinrucken aka BigWings
  来源：https://www.shadertoy.com/user/BigWings
  项目许可：CC BY-NC-SA 3.0

- **造山** — Rune Skovbo Johansen (runevision); Fewes; Clay John
  来源：https://www.shadertoy.com/view/sf23W1
  项目许可：CC BY-NC-SA 3.0

- **Take On Me** — Tonny Espeset
  来源：https://www.shadertoy.com/view/fXc3RB
  项目许可：CC BY-NC-SA 3.0

- **Never Gonna Give You Up** — Tonny Espeset
  来源：https://www.shadertoy.com/view/fXdXR7
  项目许可：CC BY-NC-SA 3.0

- **马里奥（带音乐）** — Inigo Quilez
  来源：https://www.shadertoy.com/user/iq
  项目许可：CC BY-NC-SA 3.0

- **我的世界** — fb39ca4; Ashima Arts (noise)
  来源：https://www.shadertoy.com/user/fb39ca4
  项目许可：CC BY-NC-SA 3.0

- **地牢游戏** — Krzysztof Narkowicz (knarkowicz); Pixel Dungeon by Oleg Dolya (Watabou)
  来源：https://www.shadertoy.com/view/Xs2fWD
  项目许可：CC BY-NC-SA 3.0

- **风中的树** — Maurrourgilk; mercury (SDF helpers)
  来源：https://www.shadertoy.com
  项目许可：CC BY-NC-SA 3.0

CC BY-NC-SA 3.0：https://creativecommons.org/licenses/by-nc-sa/3.0/

组件另保留自己的许可与署名：造山侵蚀算法含 MPL 2.0；风中的树 SDF helpers 来自 mercury / hg_sdf，Hash without Sine 来自 David Hoskins（CC BY-SA 4.0）；我的世界噪声署名 Ashima Arts。音乐作品中的原始曲目等内容仍归各自权利人所有。插件不主张对第三方作品或音乐拥有所有权。

完整组件说明与原始声明：
https://github.com/zdjmrq/dsh-shadertoy-skin/blob/main/THIRD-PARTY-NOTICES.md

录屏与树景设置截图由项目作者提供；说明动画和剪辑由项目制作。旁白使用 AI 合成女声。海面加星光为基于 TDM 原作的代码改编示例。雨窗 Image 145 行、海面 Image 176 行仅统计去掉注释与空行后的画面代码，不包括音频、纹理与插件代码。
