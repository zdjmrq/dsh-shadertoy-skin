# dsh-shadertoy-skin

[![CI](https://github.com/zdjmrq/dsh-shadertoy-skin/actions/workflows/ci.yml/badge.svg)](https://github.com/zdjmrq/dsh-shadertoy-skin/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-shadertoy-skin)](https://www.npmjs.com/package/dsh-shadertoy-skin)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**给 DeepSeek Harness 套一层实时 ShaderToy 背景皮肤。** 一个零运行时依赖的 WebGL2 小播放器 + 背景库 + 玻璃界面，把聊天界面变成「浮在着色器上」的皮肤。

Realtime [ShaderToy](https://www.shadertoy.com/) background skin for DeepSeek Harness (desktop & web): a zero-runtime-dependency WebGL2 player, a background library, and a translucent glass shell.

![马里奥像素画背景](https://raw.githubusercontent.com/zdjmrq/dsh-shadertoy-skin/main/docs/verify/readme-mario.jpg)
![Seascape 海面背景](https://raw.githubusercontent.com/zdjmrq/dsh-shadertoy-skin/main/docs/verify/readme-seascape.jpg)
![代码页：查看 / 修改 / 保存并运行当前作品的着色器](https://raw.githubusercontent.com/zdjmrq/dsh-shadertoy-skin/main/docs/verify/readme-code.jpg)

[![▶ 点击播放演示视频（1280×810，约 2.6 MB）](https://raw.githubusercontent.com/zdjmrq/dsh-shadertoy-skin/main/docs/verify/readme-demo-poster.jpg)](https://github.com/zdjmrq/dsh-shadertoy-skin/blob/main/docs/verify/readme-demo.mp4)

<video src="https://raw.githubusercontent.com/zdjmrq/dsh-shadertoy-skin/main/docs/verify/readme-demo.mp4" controls muted width="100%"></video>

> 截图里的 ShaderToy 作品版权归原作者：像素马里奥（作者见对应作品页）、Seascape（© TDM，CC BY-NC-SA 3.0）。**截图仅作效果展示**，本仓库代码仍是 MIT，且不收录这些作品代码。

## 名字 / 包名（认准这两个）

| 是什么 | 值 |
|---|---|
| **npm 包名**（`dsh plugin add` / 插件市场里填的就是它） | `dsh-shadertoy-skin` |
| **GitHub 仓库** | `zdjmrq/dsh-shadertoy-skin` → https://github.com/zdjmrq/dsh-shadertoy-skin |

npm 包名**没有 scope、也不带作者用户名**：不是 `@zdjmrq/dsh-shadertoy-skin`，装的时候写 `dsh-shadertoy-skin` 就对。`zdjmrq` 只出现在 GitHub 地址里。

```sh
npm view dsh-shadertoy-skin version   # 确认 npm 上真实存在的版本
```

## 参数与默认值

默认值集中在 [`native-dist/defaults.json`](native-dist/defaults.json)，面板读它来渲染选项与「恢复默认」，Host 用它做兜底——**改一个文件就能改默认值**。

| 参数 | 默认 | 可选 | 说明 |
|---|---|---|---|
| `enabled` | `true` | 开/关 | 关掉只移除背景层，设置页仍在 |
| `glass` | `60` (%) | 20–95 | 玻璃不透明度：界面压住背景的程度。越高文字越清晰、背景越淡；越低背景越透亮 |
| `brightness` | `100` (%) | 30–180 | 背景亮度（着色器输出乘数）。黄昏、夜景类作品看着太暗就调高 |
| `panels` | `opaque` | opaque / half / clear | 卡片、代码块、弹层、**聊天输入框**、编辑器表面的底色：不透明 / 半透明 / 透明。想让背景从框里透出来就调它 |
| `blur` | `0` px | 0–12 | 只在 > 0 时启用 CSS `filter` |
| `scale` | `1`× | 0.5 / 0.75 / 1 / 1.25 / 1.5 | 渲染分辨率倍率（DPR 上限 1.5） |
| `fps` | `30` | 15 / 20 / 30 / 60 | 渲染帧率上限；聊天时 30 足够 |
| `speed` | `1`× | 0–2 | 时间轴倍速 |
| `loop` / `loopSeconds` | `false` / `20` s | 开/关 · 5–120 s | **画面循环**：有的作品播一次就不动了，打开后每个周期把 `iTime` 归零重播（只重置画面，不影响声音） |
| `audioMode` / `audioSeconds` | `loop` / `60` s | loop / once · 10–600 s | **音乐播放方式**：`loop` 一直放；`once` = 放完「音乐时长」就停、**画面继续常驻**（马里奥这种静态图 + 一首歌正合适） |
| `volume` / `muted` | `60` / `false` | 0–100 / 开/关 | 带 `mainSound` 的作品默认出声；浏览器可能拦截自动播放，点一下界面任意位置即可解锁 |

> 两个滑块的分工：**玻璃不透明度**控制「界面压暗多少」，**背景亮度**控制「画面本身多亮」。前者影响可读性，后者只影响画面。背景看着黑，先加亮度；文字看着花，再加玻璃。

## 状态

渲染器、插件骨架、设置页、背景库、音频都已完成，剩下的是增强项：

- [x] WebGL2 ShaderToy 兼容运行时：`mainImage` / 旧式 `void main` / GLSL ES 3.00 + ES 1.00 回落 / uniform 自动补齐 / 行号可读的编译错误
- [x] 零依赖单文件播放器，`/shader-skin/player.html` 由 Host 半从磁盘实读（改代码刷新即可，无需重启）
- [x] Host 半：静态路由 + `$DSH_HOME/shader-skin.json` 原子状态存取 + `$DSH_HOME/shader-skin/presets/` 本地预设目录
- [x] Client 半：把播放器挂成 body 首子节点、转发 iMouse / 主题 / 可见性，全部资源走 `ctx.effect` 清理
- [x] 玻璃壳：外壳表面（AppFrame / 侧栏 / 页面容器）全透明，**暗色滤镜只由播放器画一层**（`tintMix`），不再靠多层半透明 token 叠出来（叠 N 层会把背景压到几乎全黑，旧版就栽在这）
- [x] 设置页：**左栏一行「Shader 背景」→ 主区域整页**（不是弹窗），带页头、参数 / 背景库 / 代码三个页签
- [x] **参数**：启用、作品切换、玻璃不透明度、背景亮度、卡片透明度、模糊、分辨率、帧率、速度、**画面循环**、**音乐只播一次**、音量/静音、本背景恢复默认
- [x] **音乐只播一次**：放完设定时长就停，画面继续常驻（适合马里奥这种静态图 + 一首歌）；`loop` 则是一直放
- [x] **画面循环**：有些作品播一次就停住，可设周期把 `iTime` 归零重播（只重置画面）
- [x] 设置页配色改用 **DSH 品牌蓝**（亮色 `#3568dc` / 暗色 `#7aaaff`），小字号数值也清楚
- [x] **背景库**：内置 + 我的背景列表、切换、改名、删除；粘贴代码导入、文件导入（ShaderToy JSON / GLSL）、从 `$DSH_HOME/shader-skin/presets/` 导入
- [x] **代码页**：查看当前运行作品的 Image / Sound 源码，直接改 → **保存并运行**（内置作品会自动另存为「我的副本」，原件不动；编辑器里 Ctrl/⌘+S 同样保存）
- [x] **iMouse 只在「按住左键 + 从空白处开始拖动」时驱动**：点按钮、拖滚动条、选中/复制回复文字都不会再带动背景；松手发一次释放（`iMouse.z < 0`）
- [x] **卡片透明度三档**（不透明 / 半透明 / 透明）：控制卡片、代码块、弹层、输入框、聊天输入栏的底色，让背景能透进这些「框」里
- [x] **每背景独立参数**（`overrides`）
- [x] **`mainSound` 音频**：4096 采样块 → `readPixels` → WebAudio 前瞻调度 + Gain/限幅，音量与静音实时生效
- [x] **音频签名全兼容**：ShaderToy 音频 pass 的四种写法都接受 —— `vec2`/`float` 返回值 × `(float time)`/`(int samp, float time)` 参数（单声道自动复制到左右；`samp` 传绝对采样序号）
- [x] **参数真正落盘**：`brightness` / `panels` 之前被 Host 的状态白名单漏掉（PUT 成功但字段被丢，重启就回默认），已修好并加了回归测试
- [x] **自动解锁音频**：被浏览器 autoplay 策略拦下时，点一下界面任意位置就恢复出声（面板里也有「开声音」按钮）
- [x] 深浅色主题适配（设置页与玻璃都跟随 DSH；亮色主题滤镜走向白色）
- [x] **启动自愈**：桌面端 client 插件行与服务是并发激活的，首次启动时 `theme`/`slots` 可能还没就绪（旧版因此「重启后要手动关开一次插件」）。现在服务现取 + 启动后 10 秒内多次自检（背景层缺失就重建、token 被重置就重设、播放器没 `ready` 就重发 init、侧栏没注册上就补注册），**装好重启即生效**
- [ ] 多 pass（Buffer A–D）、音频可视化回馈、兼容性静态体检

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

**开发期的安全阀**：如果界面出现卡死等异常，新建一个空文件 `$DSH_HOME/shader-skin.safe` 再刷新页面——客户端会跳过侧边栏入口与整页设置（只保留背景层），界面立刻可用；删掉该文件再重启即恢复。

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

## 从 ShaderToy 装一个作品

插件自带三个 MIT 自写着色器，但真正好玩的是把你喜欢的 ShaderToy 作品装进来。**三种做法，任选一种：**

> **推荐一试**：[`shadertoy.com/view/4dfXWj`](https://www.shadertoy.com/view/4dfXWj) —— 装进来效果挺带感，导入方式见下面任意一种。
> 这只是个起点：**大家完全可以根据自己的喜好随便挑别的作品，也可以自己写着色器**（写好了走同样的导入流程）。ShaderToy 作品的许可证由原作者决定（默认 CC BY-NC-SA 3.0），装在本机自己玩没问题，但别把作品代码提交进仓库或随包再分发。

### 1. 粘贴代码（最稳，不用抓网页）

1. 打开作品页 `https://www.shadertoy.com/view/xxxxxxxx`，右上角 **Shader** 页签；
2. 全选 `Image` 页签里的代码（如果作品用了 `Common`，把 Common 里的函数一起复制到开头；用了 Buffer 的作品暂不支持）；
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

### 3. 从本地目录导入（批量最方便）

把 `ShaderToy 导出的 JSON`、或直接是 `.glsl` / `.txt` 的代码文件放进：

```
$DSH_HOME/shader-skin/presets/        （Windows 默认 C:\Users\<你>\.dsh\shader-skin\presets\）
```

设置页 → 背景库 → 「从本地目录导入」→ 点 **导入**。这个目录不进包、不进 git。

## 改代码 / 微调作品

设置页第三个页签 **「代码」** 显示的就是**当前正在跑**的那份源码：

| 你想做的事 | 怎么做 |
|---|---|
| 看看它怎么写的 | 切到「代码」，Image（和可选 Sound）源码直接可读，顶部显示作品名与行数/字符数 |
| 改几行立刻看效果 | 改完点 **「保存并运行」**（或 Ctrl/⌘+S）：保存状态 → 播放器重新编译 → 画面即时更新；编译错误会显示在按钮下方（带行号） |
| 改坏了想还原 | 点 **「放弃修改」**，重新读取当前已保存的版本（想彻底恢复默认就去「参数 → 本背景恢复默认」，或从「背景库」重新导入） |
| 内置作品能改吗 | 能改，但内置文件是只读的：保存时会自动另存为 **「<原名>（我的副本）」** 并切过去运行，内置原件不动 |
| 代码框太小/太大 | 两个代码框（Image / Sound）都能**拖右下角调整高度**，调整后的高度会记住（下次打开还是这个高度） |

> 注意：ShaderToy 的 WebGL2 着色器语言是 ESSL 3.00，**不支持 `precise` 限定符**（那是 GLSL 4.0 / ESSL 3.20 的东西，ShaderToy 的 Vulkan 后端才有）。需要「共享晶格点必须同哈希」这类修复时，用**整数哈希**（`uint` + 位混合）代替 `precise`——效果是确定的，也不会被驱动 FMA 收缩影响。

![代码页](https://raw.githubusercontent.com/zdjmrq/dsh-shadertoy-skin/main/docs/verify/page-code.png)

## 预设与许可证（重要）

- 随包只有**自写**的 MIT 着色器，**不包含任何 ShaderToy 作品代码**。
- ShaderToy 作品默认受 **CC BY-NC-SA 3.0**（作者未另行声明时）保护，**不能**随 MIT 包再分发。自己收藏/自用没问题，但别把作品代码提交到 git、别打进要发布的包。
- 「我的背景」只存在本机 `$DSH_HOME/shader-skin.json`，不会上传。

## 开发

```sh
npm run dev              # http://127.0.0.1:8730/player.html?preset=aurora
npm run check            # 包结构 / 许可卫生 / npm pack 内容检查（无依赖）
npm run test:host        # Host 半路由 + 状态 v2 + 本地预设列表
npm run test:renderer    # 真浏览器 WebGL2 渲染 + 设置页冒烟（需 playwright）
npm run test:audio       # mainSound → readPixels → WebAudio 真实出声验证（需 playwright）
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
  player.html         零依赖 WebGL2 播放器（渲染 + 滤镜 + mainSound 音频）
  panel.html          设置页（参数 / 背景库 / 代码，深浅色自适应）
  defaults.json       全部默认参数（改这里就改默认值）
  presets/*.glsl      随包 MIT 着色器 + `pulse-sound.glsl`
  presets/dev/        测试夹具（不进 npm 包）
locale/ icon.svg      插件管理器展示资源
tools/                开发服务器 / 包检查 / 渲染冒烟 / 音频冒烟 / 实机检查
.github/workflows/    CI + npm 发布（OIDC trusted publishing）
```

## License

[MIT](LICENSE)。第三方着色器代码的许可证由其作者决定，本仓库不收录。
