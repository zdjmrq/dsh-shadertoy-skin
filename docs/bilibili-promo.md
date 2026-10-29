# B 站发布文案

## 标题

把 AI 桌面变成游乐场：代码会画画，也会作曲

## 简介（可直接复制）

各位人类和ai大家好呀。

给 DeepSeek Harness 做了一个 ShaderToy 背景插件：聊天窗口可以浮在海面上，也可以隔着雨窗看城市。点「预览并交互」，还能用鼠标造山、用方向键逛地牢。

有些画面，一两百行着色器代码就能做出来。雨窗、海面是实时计算的；音乐也可以由 Sound 代码实时合成。视频里留了一小段原作品音乐，听听看。

15 个内置作品；支持导入自己的多文件项目，切换 Image / Sound / Common / Buffer 标签修改代码。透明度、亮度、速度和画质可调，设置自动记忆。背景交互需要主动开启，Esc 退出，平时打字互不打扰。

开源仓库：https://github.com/zdjmrq/dsh-shadertoy-skin
宣传页与演示：https://zdjmrq.github.io/dsh-shadertoy-skin/
npm 包名：dsh-shadertoy-skin

已上架 dshmarket 插件市场，可以搜索 dsh-shadertoy-skin 安装：https://dshmarket.com/

桌面版安装：
dsh plugin --profile desktop add dsh-shadertoy-skin

安装后完全退出并重启 DSH，左栏打开「Shader 背景」。也可以在「插件 → 添加插件」里填包名安装。

内置作品只是起点。推荐去 https://www.shadertoy.com 找喜欢的作品，复制代码或导入多文件，再改颜色、调镜头、加一些自己喜欢的元素。不会写代码，也可以把源码和想法交给 AI 辅助修改。分享时请保留原作者署名与许可。

欢迎分享你们的脑洞、作品和截图，也欢迎 Issue / PR。

—— 视频说明与作品署名 ——

视频包含说明动画、本人 DSH 录屏与实际插件界面演示配置。海面加星光为实际代码改编示例。旁白为 AI 合成女声。Take On Me、Never Gonna Give You Up 片段保留原录屏中的代码合成音乐，旁白期间降低音乐音量；其余片段无额外背景配乐。

行数说明：雨窗 Image 145 行、海面 Image 176 行，去掉空行与注释，不包含音频、纹理和插件代码。不是所有复杂项目都只有这个体量。

插件自写代码 MIT。所示第三方 ShaderToy 作品及改编为 CC BY-NC-SA 3.0；造山的侵蚀算法组件另保留 MPL 2.0。感谢原作者：

海面 / Seascape — Alexander Alekseev (TDM)
https://www.shadertoy.com/view/Ms2SD1

下雨的窗户 — Martijn Steinrucken (BigWings)
https://www.shadertoy.com/user/BigWings

造山 / Mouse-Paint Eroded Mountains — Rune Skovbo Johansen (runevision)、Fewes、Clay John
https://www.shadertoy.com/view/sf23W1

Take On Me — Tonny Espeset
https://www.shadertoy.com/view/fXc3RB

地牢 / Pixel Shader Dungeon — Krzysztof Narkowicz (knarkowicz)，基于 Oleg Dolya (Watabou) 的 Pixel Dungeon
https://www.shadertoy.com/view/Xs2fWD

Mario — Inigo Quilez (iq)
https://www.shadertoy.com/user/iq

Never Gonna Give You Up — Tonny Espeset
https://www.shadertoy.com/view/fXdXR7

我的世界 / Voxel World — fb39ca4；噪声算法：Ashima Arts
https://www.shadertoy.com/user/fb39ca4

完整署名、改编说明与许可证：
https://github.com/zdjmrq/dsh-shadertoy-skin/blob/main/THIRD-PARTY-NOTICES.md

## 章节

- 00:00 各位人类和ai大家好呀
- 00:09 聊天界面后面，是实时生成的世界
- 00:18 小段代码，也能藏着一个世界
- 00:31 声音，也是代码实时合成的
- 00:45 已上架 dshmarket，也能填包名安装
- 00:58 自己调外观，交互按需开启
- 01:09 去 ShaderToy 找自己喜欢的作品
- 01:17 喜欢的作品，放进自己的背景库
- 01:27 在原作上，加一点自己的想法
- 01:37 有些作品，还能玩一会儿
- 01:55 把你找到和改过的作品，也分享出来

## 建议标签

DeepSeek、大肥鱼、DSH、ShaderToy、开源、桌面美化、AI、独立开发

