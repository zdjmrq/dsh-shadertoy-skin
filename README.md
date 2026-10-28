# dsh-shadertoy-skin

[![CI](https://github.com/zdjmrq/dsh-shadertoy-skin/actions/workflows/ci.yml/badge.svg)](https://github.com/zdjmrq/dsh-shadertoy-skin/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-shadertoy-skin)](https://www.npmjs.com/package/dsh-shadertoy-skin)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**给 DeepSeek Harness 套一层实时 ShaderToy 背景皮肤。** 一个零运行时依赖的 WebGL2 小播放器 + 背景库 + 玻璃界面，把聊天界面变成「浮在着色器上」的皮肤。

Realtime [ShaderToy](https://www.shadertoy.com/) background skin for DeepSeek Harness (desktop & web): a zero-runtime-dependency WebGL2 player, a background library, and a translucent glass shell.

> **推荐去 [www.shadertoy.com](https://www.shadertoy.com/) 逛逛** —— 插件自带的 11 个预设只是开胃菜。ShaderToy 上有几万个社区作品（搜 `background`、`seascape`、`raymarching` 这类关键词，或在 Browse 里按分类翻），挑喜欢的装进「背景库」、按自己的口味调亮度 / 速度 / 代码，就是一张专属桌面。
> **改好了欢迎分享**：截图、参数、改进思路都可以提到 [Issues](https://github.com/zdjmrq/dsh-shadertoy-skin/issues)，或者直接 PR（作品代码要看原作者的许可证，默认 CC BY-NC-SA 3.0：署名、非商业、同样方式共享；本仓库自写代码是 MIT，八个第三方预设按各自许可证收录）。
> **欢迎 issue 和 PR**：装不上、画面不对、想要新功能 → 开 [Issue](https://github.com/zdjmrq/dsh-shadertoy-skin/issues)（附截图和 `$DSH_HOME/shader-skin.json` 里对应条目更好排查）；bug 修复、文档修正、自写预设 → 直接提 [PR](https://github.com/zdjmrq/dsh-shadertoy-skin/pulls)。
> **欢迎分享你发现的 / 自己改过的 ShaderToy 作品**：作品链接、截图、调好的参数都行，开 [Issue](https://github.com/zdjmrq/dsh-shadertoy-skin/issues) 贴出来大家就能直接用；想让它进内置预设就提 PR（先确认原作者的许可证允许再分发）。
>
> **Recommended: browse [shadertoy.com](https://www.shadertoy.com/)** — import any piece into the background library, tune it to your taste, and feel free to share screenshots, settings or improvements via Issues / PRs.

https://github.com/user-attachments/assets/9697da1f-9dae-4b4e-9ceb-5c7fca90a605

*演示 1 · 像素马里奥（带音乐）：设置页 → 卡片透明档 → 代码页 → 聊天；音乐「只播一次」，放完画面常驻*

https://github.com/user-attachments/assets/a3f43db3-5804-4a7a-aa0a-f3044abf8374

*演示 2 · [Seascape](https://www.shadertoy.com/view/Ms2SD1)（© TDM，CC BY-NC-SA 3.0）的个人修改版：摄像机抬到近地轨道，只留海面 —— 已作为内置预设「海面（Seascape）」随插件提供*

> 视频里的 ShaderToy 作品版权归原作者：像素马里奥「Mario」（© Inigo Quilez）、Seascape（© Alexander Alekseev aka TDM），两者均以 **CC BY-NC-SA 3.0** 收录为内置预设（非 MIT，见文末许可证）。**视频仅作效果展示**，插件自写代码仍是 MIT。

## 名字 / 包名（认准这两个）

| 是什么 | 值 |
|---|---|
| **npm 包名**（`dsh plugin add` / 插件市场里填的就是它） | `dsh-shadertoy-skin` |
| **GitHub 仓库** | `zdjmrq/dsh-shadertoy-skin` → https://github.com/zdjmrq/dsh-shadertoy-skin |

npm 包名**没有 scope、也不带作者用户名**：不是 `@zdjmrq/dsh-shadertoy-skin`，装的时候写 `dsh-shadertoy-skin` 就对。`zdjmrq` 只出现在 GitHub 地址里。

```sh
npm view dsh-shadertoy-skin version   # 确认 npm 上真实存在的版本
```

## 从 ShaderToy 装一个作品

插件自带 12 个预设（3 个自写 MIT + 8 个第三方作品及 1 个无闪电变体，第三方部分为 CC BY-NC-SA 3.0，见文末许可证），但真正好玩的是把你喜欢的 ShaderToy 作品装进来。**三种做法，任选一种：**

> **推荐一试**：[`shadertoy.com/view/4dfXWj`](https://www.shadertoy.com/view/4dfXWj) —— 装进来效果挺带感，导入方式见下面任意一种。
> 这只是个起点：**大家完全可以根据自己的喜好随便挑别的作品，也可以自己写着色器**（写好了走同样的导入流程）。ShaderToy 作品的许可证由原作者决定（默认 CC BY-NC-SA 3.0）：装在本机自己玩没问题；想提交进仓库或随包分发，先确认许可证允许，并带上署名与相同许可证（本仓库的八个第三方预设就是这么收录的）。

### 1. 粘贴代码（最稳，不用抓网页）

1. 打开作品页 `https://www.shadertoy.com/view/xxxxxxxx`，右上角 **Shader** 页签；
2. 全选 `Image` 页签里的代码（如果作品用了 `Common`，把 Common 里的函数一起复制到开头；多文件作品请使用下述多文件导入）；
3. 回到插件设置页 → **背景库** → 「粘贴 ShaderToy 代码」→ 填名字 → 粘进 `Image 代码` → **加入背景库**；
4. 列表里点 **使用** 即可，参数会即时生效。

带声音的作品（代码里有 `mainSound`）把声音代码粘进 `Sound 代码`，切到它时会出声。声音签名支持这四种：

```glsl
vec2  mainSound(float time)            // 立体声
float mainSound(float time)            // 单声道（自动复制到左右）
vec2  mainSound(int samp, float time)  // 带采样序号
float mainSound(int samp, float time)  // 单声道 + 采样序号
```

如果出声被浏览器拦住，点一下界面任意位置即可解锁（面板音量那一行也会提示）。

### 2. 让 AI 帮你装（一条指令，把网址填进去就行）

复制下面这段，把第一行的网址换成你要的作品链接，发给 DeepSeek Harness（或任何能操作文件的 AI）：

```text
帮我给 DeepSeek Harness 装一个 ShaderToy 背景皮肤。

插件：dsh-shadertoy-skin（npm 包名就是 dsh-shadertoy-skin，GitHub: https://github.com/zdjmrq/dsh-shadertoy-skin）
如果还没装：桌面版走「插件 → 添加插件 → 填 dsh-shadertoy-skin → 装完完全退出并重启客户端」；命令行用 dsh plugin --profile desktop add dsh-shadertoy-skin。

要装的作品链接：<把你复制的 https://www.shadertoy.com/view/xxxxxxxx 粘在这里>

做法：
1. 打开上面的链接，拿到 Image pass 的 GLSL（若用了 Common，把 Common 的函数一起带上），以及可选的 mainSound。
2. 打开插件设置页（左栏「Shader 背景」）→ 背景库 → 「粘贴 ShaderToy 代码」：名字用作品名，Image 粘主代码，Sound 可空。
3. 导入后把它设为当前背景，确认背景真的渲染出来（不是黑屏、不是编译报错）；若报编译错误，按错误行号修好再试。
4. 如果页面抓不到代码（反爬/需要登录/只给 WebGL 不给源码），直接让我手动复制粘贴，不要猜代码。
5. 该作品的许可由原作者决定（ShaderToy 默认 CC BY-NC-SA 3.0）：只装在本机，不要提交进 git、不要随包发布。

装好后告诉我：装的是哪个作品、是否带声音、需不需要我调亮度/玻璃。
```

> AI 抓不到 ShaderToy 页面时（它经常挡爬虫），就走上面第 1 种的「手动粘贴」——一样能装好，而且不会有许可证问题。

### 多文件项目：文件夹或多个文件一起导入

背景库 → **导入多文件项目** → 选择文件夹或多个代码/图片文件 → 检查每个文件的 Image / Sound / Common / Buffer A–D / Include / 图片角色及四个输入通道 → **作为一个项目导入并运行**。通道依赖无法仅凭 GLSL 完全推断，自动建议后仍可手动调整。ShaderToy 导出的 JSON 也会保留 Common、各 Buffer 及已声明的 Buffer 连接；未附带的外部纹理会明确报错。

粘贴导入和代码页都使用一个编辑区，默认标签为 **Image / Sound / +**。点击标签切换文件，点击 **+** 新建 Common、Buffer A–D 或自定义 include 文件；多文件项目会显示已有文件的标签，保存时一次写入整个项目。代码页的 **通道输入** 可展开配置 iChannel0–3。使用 `#include "helper.glsl"` 引用 include 文件；循环引用、路径越界和过大的展开会拒绝。新增图片随项目内嵌保存，导出 JSON 可以再次导入，作者和许可证也一并保留。

切换标签保留内容、光标与滚动位置；未提交的粘贴项目和代码草稿在当前会话内可恢复。普通保存不使用浏览器 `keepalive` 请求额度，连接中断或 Host 暂时不可用时最多自动重试一次，每次超时为 12 秒；相同保存请求由 Host 去重，避免响应丢失后的误报冲突。离线、超时、权限不足、磁盘空间不足、容量超限、Host 路由缺失和多窗口配置冲突会分别提示。在线但未收到响应时，会提示检查网络与 Host，不会直接认定是网络故障。失败后修改继续保留，可手动重试；不同页面的新配置不会被自动覆盖。

多 pass 按 A → B → C → D → Image 执行：读取已经完成的前序 Buffer 得到当前帧；读取自身或后序 Buffer 得到上一帧。Buffer 不套用界面亮度/遮罩，也不截断浮点状态值；这些只作用于最终 Image。大窗口下会缩小离屏缓冲，以将缓冲数据限制在约 96 MiB；项目图片合计限制 1600 万像素。键盘通道只在独立预览中接收按键，嵌入 DSH 时保持释放，避免输入冲突。Cubemap、远程视频/音频输入暂不支持。

### 3. 从本地目录导入（批量最方便）

把 `ShaderToy 导出的 JSON`、或直接是 `.glsl` / `.txt` 的代码文件放进：

```
$DSH_HOME/shader-skin/presets/        （Windows 默认 C:\Users\<你>\.dsh\shader-skin\presets\）
```

设置页 → 背景库 → 「从本地目录导入」→ 点 **导入**。这个目录不进包、不进 git。

## 参数与默认值

设置页按「背景与外观 / 渲染与性能 / 画面播放 / 声音」分组，宽窗口双栏、窄窗口单栏，深浅色主题均提供独立的可读表面。点页头「预览背景」可临时收起设置查看实际背景，按 Esc 返回；不增加第二个渲染器。没有 Sound 代码的作品会禁用声音控件。页签、下拉选择均支持键盘操作，保存与导入状态在三个页签共用的位置显示。

默认值集中在 [`native-dist/defaults.json`](native-dist/defaults.json)，面板读它来渲染选项与「恢复默认」，Host 用它做兜底——**改一个文件就能改默认值**。

| 参数 | 默认 | 可选 | 说明 |
|---|---|---|---|
| `enabled` | `true` | 开/关 | 关掉只移除背景层，设置页仍在 |
| `glass` | `60` (%) | 20–95 | 界面不透明度：控制背景滤镜；半透明档下也直接决定卡片、输入框、代码块、菜单等表面的不透明度 |
| `brightness` | `100` (%) | 30–180 | 背景亮度（着色器输出乘数）。黄昏、夜景类作品看着太暗就调高 |
| `panels` | `half` | opaque / half / clear | 不透明保留原生底色；半透明使用 `glass / 100`；透明移除表面底色（alpha 为 0）。新会话按钮、代码块顶部栏、输入框和插件设置页遵循同一规则 |
| `blur` | `0` px | 0–12 | 只在 > 0 时启用 CSS `filter` |
| `scale` | `1`× | 0.25 / 0.35 / 0.4 / 0.5 / 0.6 / 0.75 / 1 / 1.25 / 1.5 / 1.75 / 2 | 渲染分辨率倍率（DPR 上限 1.5，总像素上限 800 万）。下拉里**直接写实际分辨率**，例如 `1280 × 810（1×）`、`320 × 203（0.25×）`，窗口变大后这些数字会跟着刷新；显卡弱/想省电选 0.25–0.5×，追求锐利选 1.5–2× |
| `fps` | `30` | 15 / 20 / 30 / 60 | 渲染帧率上限；聊天时 30 足够 |
| `speed` | `1`× | 0–2 | 时间轴倍速 |
| `loop` / `loopMode` | `true` / `auto` | 开/关 · auto / manual | **自动画面循环**：优先识别代码中的结束淡出；否则低频检测动画停止变化，确认后重播。持续动画与初始静态画面保持播放。重播同时重置 `iTime` 和 `iFrame`，音乐独立运行 |
| `loopSeconds` | `20` s | 5–120 s | 仅在「指定循环周期」模式使用，自动模式无需填写 |
| `audioMode` / `audioDurationMode` | `loop` / `auto` | loop / once · auto / manual | 自动识别结束淡出，或在有声之后持续静音 3 秒时确定结束。循环重放或只播一次，不受画面倍速、循环和静音开关影响 |
| `audioSeconds` | `60` s | 10–600 s | 仅在「指定音乐时长」模式使用 |
| `volume` / `muted` | `60` / `false` | 0–100 / 开/关 | 带 `mainSound` 的作品默认出声；浏览器可能拦截自动播放，点一下界面任意位置即可解锁 |

> **界面不透明度**控制背景滤镜和半透明表面的底色浓度，**背景亮度**控制画面本身的亮度。透明档始终移除表面底色；滑块仍可调整其下方背景的滤镜。

界面启用、透明档、不透明度、模糊、分辨率、帧率、音量和静音是**全局偏好**，切换背景不会改变；亮度、倍速与播放策略按作品记忆。「本背景恢复默认」只重置作品参数。旧配置会沿用当前作品的已保存外观，包括主动选择的不透明档。修改即时预览、排队原子保存；中断的保存可在重开面板时从本地记录恢复，其他窗口的新版本不会被覆盖。

Shader 没有通用的“播完”事件，因此自动模式是一种保守判断：支持字面量 `1.0 - smoothstep(start, end, iTime)`（声音为 `time` / `t`）或代码首部的 `// @duration 60` 秒数声明；其他画面只在观测到动画后持续静止 5 个着色器秒、且运行至少 8 秒时重播。包含长暂停、很小区域变化或极慢变化的作品可能误判，音乐中间长静音也可能被当成结束；这类作品可关闭画面循环或切换指定周期 / 时长。自动画面检测只在 GPU 缩小后每秒读取两次 1 KB 像素。

## 卡死与崩溃保护

着色器编译、Buffer 渲染、自动结束检测和声音 GPU 采样全部在独立 Worker 中执行。渲染线程正常运行时每 500 毫秒报告心跳；编译最长允许 30 秒，运行中无响应 12 秒便终止线程和音频队列，并报告错误，可切换背景重试。后台冻结不计为超时。快速切换会取消旧编译，重复初始化合并；GPU 上下文恢复可重建一次，一分钟内再次崩溃则停止背景，避免无限重载。

主画面上限为 800 万像素，离屏 Buffer 合计约 96 MiB；高分屏和高倍率超预算时按比例缩小。需支持 Worker、OffscreenCanvas 和 WebGL2 的浏览器。驱动/GPU 进程本身的故障仍受浏览器与系统约束，插件无法承诺任何 GLSL 都不会触发驱动异常。

## 状态

渲染器、插件骨架、设置页、背景库、音频都已完成，剩下的是增强项：

- [x] WebGL2 ShaderToy 兼容运行时：`mainImage` / 旧式 `void main` / GLSL ES 3.00 + ES 1.00 回落 / uniform 自动补齐 / 行号可读的编译错误
- [x] 零运行时依赖的 Worker 播放器，`/shader-skin/player.html` 由 Host 半从磁盘实读（改代码刷新即可，无需重启）
- [x] Host 半：静态路由 + `$DSH_HOME/shader-skin.json` 原子状态存取 + `$DSH_HOME/shader-skin/presets/` 本地预设目录
- [x] Client 半：把播放器挂成 body 首子节点、转发 iMouse / 主题 / 可见性，全部资源走 `ctx.effect` 清理
- [x] 玻璃壳：外壳表面（AppFrame / 侧栏 / 页面容器）全透明，**暗色滤镜只由播放器画一层**（`tintMix`），不再靠多层半透明 token 叠出来（叠 N 层会把背景压到几乎全黑，旧版就栽在这）
- [x] 设置页：**左栏一行「Shader 背景」→ 主区域整页**（不是弹窗），带页头、参数 / 背景库 / 代码三个页签
- [x] **参数**：启用、作品切换、玻璃不透明度、背景亮度、卡片透明度、模糊、分辨率、帧率、速度、**画面循环**、**音乐只播一次**、音量/静音、本背景恢复默认
- [x] **自动音乐时长**：识别结束淡出 / 有声后的持续静音；循环或只播一次均支持。手动时长保留为可选项
- [x] **自动画面循环**：识别结束淡出或动画停止，重置 `iTime` / `iFrame` 重播，另有手动周期可选（只重置画面）
- [x] 设置页采用 **DSH 原生中性色**：浅色白底、深色黑灰底，移除长说明与重复数值，自动跟随主题
- [x] **背景库**：内置 + 我的背景列表、切换、改名、删除；粘贴代码导入、文件导入（ShaderToy JSON / GLSL）、从 `$DSH_HOME/shader-skin/presets/` 导入
- [x] **新增六个多文件/纹理项目**：Take On Me、Never Gonna Give You Up、下雨的窗户、赛车、我的世界、风中的树（CC BY-NC-SA 3.0）。
- [x] **随包 12 个预设**：含「下雨的窗户（无闪电）」独立变体，只去掉闪电，雨滴、雾气、爱心动画、调色和周期与原版一致；原版仍可选。第三方预设为 CC BY-NC-SA 3.0，背景库和下拉带许可标识。
- [x] **代码页**：查看当前运行作品的 Image / Sound 源码，直接改 → **保存并运行**（内置作品会自动另存为「我的副本」，原件不动；编辑器里 Ctrl/⌘+S 同样保存）
- [x] **iMouse 只在「按住左键 + 从空白处开始拖动」时驱动**：点按钮、拖滚动条、选中/复制回复文字都不会再带动背景；松手发一次释放（`iMouse.z < 0`）
- [x] **卡片透明度三档**（不透明 / 半透明 / 透明）：控制卡片、代码块、弹层、输入框、聊天输入栏的底色，让背景能透进这些「框」里
- [x] **AI 回复里的「白块」也跟着透**：改动文件头、交付物卡片、markdown 代码块、行内代码、消息气泡原本直接读静态中性色（亮色下是不透明白），现在跟 `panels` 同档 alpha —— 亮色主题下不会再出现「别的卡片都透、就这几块死白」
- [x] **全局界面偏好 + 每背景播放参数**：外观、性能与音量跨背景记忆；亮度、画面和音乐播放设置随作品保存（`settings` + `overrides`）
- [x] **`mainSound` 音频**：4096 采样块 → `readPixels` → WebAudio 前瞻调度 + Gain/限幅，音量与静音实时生效
- [x] **音频签名全兼容**：ShaderToy 音频 pass 的四种写法都接受 —— `vec2`/`float` 返回值 × `(float time)`/`(int samp, float time)` 参数（单声道自动复制到左右；`samp` 传绝对采样序号）
- [x] **参数真正落盘**：`brightness` / `panels` 之前被 Host 的状态白名单漏掉（PUT 成功但字段被丢，重启就回默认），已修好并加了回归测试
- [x] **自动解锁音频**：被浏览器 autoplay 策略拦下时，点一下界面任意位置就恢复出声（面板里也有「开声音」按钮）
- [x] 深浅色主题适配（设置页与玻璃都跟随 DSH；亮色主题滤镜走向白色）
- [x] **启动自愈**：桌面端 client 插件行与服务是并发激活的，首次启动时 `theme`/`slots` 可能还没就绪（旧版因此「重启后要手动关开一次插件」）。现在服务现取 + 启动后 10 秒内多次自检（背景层缺失就重建、token 被重置就重设、播放器没 `ready` 就重发 init、侧栏没注册上就补注册），**装好重启即生效**
- [x] 多文件项目：Common / Image / Sound / Buffer A–D、双缓冲反馈、include 文件、2D/3D 噪声、字体和本地图片通道
- [ ] Cubemap、外部视频 / 音频可视化输入与完整 ShaderToy 资源兼容

## 要求

- DeepSeek Harness **0.2.x**（桌面版或 `dsh web`）
- 支持 **WebGL2** 的显卡/驱动（Electron 走 ANGLE，绝大多数机器可用）

## 安装

**桌面版（推荐）**：侧栏「插件」→「添加插件」→ 填 `dsh-shadertoy-skin` → 安装 → **完全退出并重启客户端**（首次安装需要，页面刷新不够）。

**命令行**

```sh
dsh plugin --profile desktop add dsh-shadertoy-skin
# 或直接从 GitHub 装：
dsh plugin --profile desktop add github:zdjmrq/dsh-shadertoy-skin#main
```

**Web 版（`dsh web`）**：把 `--profile desktop` 换成 `--profile web`，装完重启 `dsh web` 再刷新页面：

```sh
dsh plugin --profile web add dsh-shadertoy-skin
```

安装后左侧栏会多一行 **「Shader 背景」**，点开在主区域就是整页设置（参数 / 背景库）；默认背景是「极光」。升级到新版看下面「[更新](#更新)」。

**开发期的安全阀**：如果界面出现卡死等异常，新建一个空文件 `$DSH_HOME/shader-skin.safe` 再刷新页面——客户端会跳过背景渲染、玻璃样式和设置入口，不修改已保存偏好；删掉该文件再重启即恢复。

## 更新

先确认 npm 上的最新版本（也可以在 DSH 侧栏「插件」里看已安装版本）：

```sh
npm view dsh-shadertoy-skin version
```

### 桌面版（DeepSeek Harness 客户端）

1. **完全退出客户端**（关窗口不算，要退出进程；插件命令会锁 profile）；
2. 任意终端执行（`@latest` 才会跨小版本升级）：

```sh
dsh plugin --profile desktop add dsh-shadertoy-skin@latest
```

3. 重新打开客户端 —— 左栏「Shader 背景」和整页设置就是新版。

> 不习惯命令行：侧栏「插件」→「已安装」→ 卸载 `dsh-shadertoy-skin` → 再「添加插件」填一次包名 → **完全退出并重启**。DSH 插件管理器对第三方插件只提供卸载 / 安装，没有「更新」按钮。
>
> 本地背景库、参数、代码页改过的作品都在 `$DSH_HOME/shader-skin.json`，重装/升级**不会丢**。

### Web 版（`dsh web`）

`dsh web` 用的是 **`web` profile**（等价于 `dsh --profile web`），和桌面版的 `desktop` profile 是**两套独立依赖**，更新命令也不同：

```sh
dsh plugin --profile web add dsh-shadertoy-skin@latest
```

然后在跑 `dsh web` 的终端里 `Ctrl+C` 停掉、重新 `dsh web`，再刷新浏览器页面（Web 版的 client 插件在页面加载时注入，**重启服务 + 刷新页面**才完整生效）。

| 你用的 | profile | 更新命令 |
|---|---|---|
| 桌面客户端 | `desktop` | `dsh plugin --profile desktop add dsh-shadertoy-skin@latest` |
| `dsh web` | `web` | `dsh plugin --profile web add dsh-shadertoy-skin@latest` |

两个 profile 别弄混：桌面客户端只读 `~/.dsh/profiles/desktop`，`dsh web` 只读 `~/.dsh/profiles/web`；给桌面装的插件 Web 版不会自动有，反之亦然。

### 只改了前端资源？

`player.html` / `panel.html` / `defaults.json` 由 Host 半**按请求读盘（no-cache）**，手动改这些文件后刷新页面即可；但 `index.js` / `client.js`（Host 半 / Client 半）的改动必须重启对应进程：桌面 = 退出重开客户端，Web = 重启 `dsh web` 并刷新页面。

## 改代码 / 微调作品

设置页第三个页签 **「代码」** 显示的就是**当前正在跑**的那份源码：

| 你想做的事 | 怎么做 |
|---|---|
| 看看它怎么写的 | 切到「代码」，通过顶部文件横条选择 Image / Sound / Common / Buffer / Include，源码直接可读，顶部显示作品名与行数/字符数 |
| 改几行立刻看效果 | 改完点 **「保存并运行」**（或 Ctrl/⌘+S）：保存状态 → 播放器重新编译 → 画面即时更新；编译错误会显示在按钮下方（带行号） |
| 改坏了想还原 | 点 **「放弃修改」**，重新读取当前已保存的版本（想彻底恢复默认就去「参数 → 本背景恢复默认」，或从「背景库」重新导入） |
| 内置作品能改吗 | 能改，但内置文件是只读的：保存时会自动另存为 **「<原名>（我的副本）」** 并切过去运行，内置原件不动 |
| 代码框太小/太大 | 代码文件的编辑框下方都有**整行拖动条**，可自由拉高（上限 4000 px）；拖到页面边缘会自动滚动。双击拖动条还原高度；方向键微调、Shift + 方向键加大步长、Home / End 快速缩小或拉高。高度会记住 |
| 只想看 Image 或 Sound | 点对应代码框的**专注编辑**，铺满设置区域，保留原来的阅读位置；Esc 返回。可以单独收起暂时不用的代码框 |
| 长行难读、字太小 | 顶部可切换自动换行与 12–20 px 字号，自动记住阅读偏好。不换行时提供与代码同步滚动的行号 |

> 注意：ShaderToy 的 WebGL2 着色器语言是 ESSL 3.00，**不支持 `precise` 限定符**（那是 GLSL 4.0 / ESSL 3.20 的东西，ShaderToy 的 Vulkan 后端才有）。需要「共享晶格点必须同哈希」这类修复时，用**整数哈希**（`uint` + 位混合）代替 `precise`——效果是确定的，也不会被驱动 FMA 收缩影响。

## 预设与许可证（重要）

随包预设分两类（完整清单见 [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)）：

| 预设 | 来源 | 许可证 |
|---|---|---|
| `极光` / `流体色带` / `脉冲（带音乐）` | 本项目自写 | **MIT**（可商用、随便改） |
| `海面（Seascape）` | [Seascape](https://www.shadertoy.com/view/Ms2SD1)，© Alexander Alekseev aka TDM | **CC BY-NC-SA 3.0**（非 MIT） |
| `马里奥（带音乐）` | [Mario](https://www.shadertoy.com/user/iq)，© Inigo Quilez | **CC BY-NC-SA 3.0**（非 MIT） |
| `Take On Me` / `Never Gonna Give You Up` | Tonny Espeset，原文件署名与链接保留 | **CC BY-NC-SA 3.0** |
| `下雨的窗户` / `下雨的窗户（无闪电）` | Heartfelt，Martijn Steinrucken aka BigWings；附离线程序化城市纹理，无闪电版仅移除闪电 | **CC BY-NC-SA 3.0** |
| `赛车` | dathor / diatribes 等，原文件贡献者声明保留 | **CC BY-NC-SA 3.0** |
| `我的世界` | Voxel Game，fb39ca4；内含噪声函数原许可声明保留 | **CC BY-NC-SA 3.0** |
| `风中的树` | 原作者署名与组件许可声明见第三方清单 | **CC BY-NC-SA 3.0** |

第三方作品是**按上游许可证收录的**（上游允许再分发），所以：

- **署名**：保留作者与许可证声明（文件头、`presets/index.json`、背景库里的红色 `CC BY-NC-SA` 标记）；
- **非商业**：这些第三方项目 不能用于商业用途。要把这个插件用于商业产品，请先删掉 `native-dist/presets/seascape.glsl`、`mario.glsl`、`mario-sound.glsl`及第三方项目和变体目录（或只保留自写预设）；
- **相同方式共享**：改过的版本再分发时仍要留在 CC BY-NC-SA 3.0 下。设置页「代码」里另存的「我的副本」同样受这个约束。

其余从 ShaderToy 导入的作品（默认 CC BY-NC-SA 3.0，作者可另行声明）**只存在本机** `$DSH_HOME/shader-skin.json`，不会上传，也不会进包；想把自己的修改提交进仓库/随包分发，先确认许可证允许，并带上署名与相同的许可证。

## 开发

```sh
npm run dev              # http://127.0.0.1:8730/player.html?preset=aurora
npm run check            # 包结构 / 许可卫生 / npm pack 内容检查（无依赖）
npm run test:host        # Host 半路由 + 状态 v2 + 本地预设列表
npm run test:renderer    # 真浏览器 WebGL2 渲染 + 设置页冒烟（需 playwright）
npm run test:audio       # mainSound → readPixels → WebAudio 真实出声验证（需 playwright）
npm run test:core        # 自动结束/重播、设置恢复、字号与鼠标隔离回归
npm run test:project     # 项目整体审查、音频暂停、导出与文件边界
npm run test:worker       # 线程卡死、超时恢复、GPU 熔断与安全模式
npm run test:multi       # 多文件导入/编辑与六个新增内置项目的真实 WebGL 验证
```

Windows 上已装 Edge 可以跳过浏览器下载：`PLAYWRIGHT_CHANNEL=msedge npm run test:renderer`。

开发服务器同时挂了本地预设目录（只读），可以直接预览你导出的作品、不用先导入：

```
http://127.0.0.1:8730/player.html?preset=local/<file>.glsl
```

改 `native-dist/player.html`、`native-dist/panel.html`、`native-dist/defaults.json` 或 `native-dist/presets/*.glsl` → 刷新页面即生效（Host 半读盘、no-cache）；**插件壳（`index.js` / `client.js`）改动要重启客户端**。开发时优先改 `native-dist/*`，`client.js` 的改动请集中在一次做完再重启验证。

调试玻璃/亮度：`player.html` 支持 `?dim=`（0–2）、`?tint=`（十六进制）`&tintMix=`（0–1）直接看滤镜效果，例如 `?preset=seascape&dim=1.2&tint=090c10&tintMix=0.4`。

架构与决策记录在 [`docs/00-决策与方案复核.md`](docs/00-决策与方案复核.md)，渲染器说明在 [`docs/renderer-notes.md`](docs/renderer-notes.md)，发布流程在 [`docs/PUBLISHING.md`](docs/PUBLISHING.md)。

## 目录

```
index.js              Host 半：/shader-skin 路由 + 状态文件 + 本地预设目录 + safe-mode
client.js             Client 半：背景 iframe + 玻璃 token + 设置页注册 + 事件转发
cordis.patch.yml      bundle patch（插入 shadertoy-skin 行）
native-dist/
  player.html         播放器页面与界面桥接
  player-controller.js  Worker 生命周期、超时保护与 WebAudio 设备
  render-worker.js      OffscreenCanvas 与声音桥接
  player-runtime.js     WebGL2 渲染、滤镜、mainSound 合成与播放时钟
  panel.html          设置页（参数 / 背景库 / 代码，深浅色自适应）
  defaults.json       全部默认参数（改这里就改默认值）
  presets/*.glsl      随包预设：3 个自写 MIT + 8 个第三方 CC BY-NC-SA 3.0（`seascape` / `mario`）
  presets/dev/        测试夹具（不进 npm 包）
locale/ icon.svg      插件管理器展示资源
tools/                开发服务器 / 包检查 / 渲染冒烟 / 音频冒烟 / 实机检查
THIRD-PARTY-NOTICES.md  第三方作品的作者 / 来源 / 许可证清单
.github/workflows/    CI + npm 发布（OIDC trusted publishing）
```

## 参与（issue / PR 都欢迎）

- **报问题**：直接[开 Issue](https://github.com/zdjmrq/dsh-shadertoy-skin/issues)。附上 DSH 版本、系统/显卡、截图，以及 `$DSH_HOME/shader-skin.json` 里对应预设的条目（贴之前先删掉不想公开的内容）；播放器自己的诊断行也能帮大忙。
- **提改进**：bug 修复、文档修正、新的自写预设都欢迎 [PR](https://github.com/zdjmrq/dsh-shadertoy-skin/pulls)。自写预设请标 MIT；第三方作品要带作者与许可证（参考 [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)）。
- **分享 ShaderToy 作品**：发现了特别适合当聊天背景的作品，或者自己把它改得更好看、更省电（比如调机位、修 NaN、降负载），都欢迎[开 Issue](https://github.com/zdjmrq/dsh-shadertoy-skin/issues) 贴作品链接 + 截图 + 参数。想让它变成内置预设就提 PR：自写的标 MIT，第三方作品带作者与许可证（参考 [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)）。
- **分享你的背景**：装了什么作品、参数怎么调的，开 Issue 贴截图就行。

## License

[MIT](LICENSE) 适用于插件代码与三个自写预设。**随包的第三方作品（`seascape` / `mario`）不是 MIT**，它们按上游的 [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/) 收录，署名见文件头与 [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)。
