# shader-skin · 渲染器（M0）

零依赖单文件 WebGL2 运行时，兼容 ShaderToy 的 `mainImage(out vec4, in vec2)` 写法。
成品里由 Host 插件在 `/shader-skin/player.html` 提供；开发期用 `tools/dev-server.mjs` 本地跑。

## 本地跑

```powershell
# 仓库根目录
node tools/dev-server.mjs 8730
```

然后浏览器打开：

| URL | 作用 |
|---|---|
| `http://127.0.0.1:8730/player.html?preset=aurora` | 极光（自写，默认背景候选） |
| `http://127.0.0.1:8730/player.html?preset=flow` | 流体色带（自写） |
| `http://127.0.0.1:8730/player.html?debug=bg` | 整屏洋红，用来验证背景层是否被遮住 / 是否拦截指针 |
| `http://127.0.0.1:8730/player.html?preset=aurora&dim=1` | 关掉压暗看原始画面 |
| `http://127.0.0.1:8730/player.html?preset=aurora&fps=60&scale=0.75` | 改帧率上限 / 渲染分辨率 |

**开发循环：改 `player.html` / `presets/*.glsl` → 刷新浏览器，不用重启任何东西。**

## URL 参数

| 参数 | 范围 | 说明 |
|---|---|---|
| `preset` | `aurora` \| `flow` \| 任意 `<name>.glsl` | 加载 `presets/index.json` 里的条目；没有的 id 会直接找 `presets/<id>.glsl`（调试夹具用） |
| `debug` | `bg` | 洋红整屏，跳过 shader |
| `fps` | 数字，默认 30 | 帧率上限（30 省电 / 60 顺滑） |
| `dim` | 0–2，默认 1 | 亮度乘数（设置页「背景亮度」滑块） |
| `tint` | 十六进制颜色，默认 `#ececec` | 滤镜渗入的颜色（暗色主题用近黑，亮色主题用白） |
| `tintMix` | 0–1，默认 0 | 向 `tint` 混合的比例 = 设置页的「玻璃不透明度」 |
| `scale` | 0.5–2，默认 1 | 渲染分辨率乘数；低分辨率 = 便宜且"柔" |
| `blur` | 0–12，默认 0 | CSS `filter: blur()`，**只在 > 0 时启用** |
| `noes1` | `1` | 只试 GLSL ES 3.00，不回落 ES 1.00（看真实编译错误用） |

> 滤镜只有一层：`c.rgb = mix(clamp(c.rgb,0,1) * uDim, uTint, uTintMix)`。父页面（client 半）把 `glass`/`brightness` 换算成 `dim`/`tint`/`tintMix` 发过来；主题消息只在外壳没发过显式 look 时才改默认值（`lookExplicit`），所以切主题不会重置滑块。

## postMessage 协议（父页面 = 插件的 client 半）

只接受与页面同源的父窗口消息。

```js
// 父 -> player
{ type: 'init',   preset: { id, name, image }, params: {...} }   // image = GLSL 源码
{ type: 'params', params: { speed, scale, blur, dim, tintMix, tint, paused } }
{ type: 'mouse',  mouse: [x, y, clickX, clickY] }                 // 像素坐标，左下原点
{ type: 'theme',  dark: true }                                   // 只调默认 dim/tintMix
{ type: 'pause',  paused: true }
{ type: 'reset' }                                                // iTime/iFrame 归零

// player -> 父
{ type: 'ready',  preset, es3 }                                  // 首帧渲染后
{ type: 'error',  stage: 'context'|'compile'|'preset'|'init', log }
{ type: 'stats',  fps, ms, w, h }                                // 每 0.5s
{ type: 'diag',   text }
```

独立打开（`window.parent === window`）时自己接收指针事件驱动 `iMouse`，并直接加载 `preset`。

## 已实现 / 已验证

- [x] WebGL2 上下文；`webgl2` 失败时报可读错误（不白屏）
- [x] GLSL ES 3.00 主路径：`texture2D*`→`texture*`、`gl_FragColor`→`st_out`、`#extension` 提升、`#version`/`#line` 剥离
- [x] ES 1.00 回落：ES3 编译失败时用原样代码再编一次（`dev/es1.glsl` 夹具验证）
- [x] uniform 自动补齐 + 重复声明自愈（`redefinition` → 删掉注入行重编）
- [x] 标准 uniform 全量：`iResolution/iTime/iTimeDelta/iFrame/iMouse/iDate/iSampleRate/iChannel0-3/iChannelTime/iChannelResolution`
- [x] 错误面板：把 GLSL 行号还原到用户代码行号（减去 header 行数）
- [x] `postMessage` 协议 + `ready/error/stats` 上报 + 父页面 `params/mouse/theme/pause/reset`
- [x] 分辨率：`DPR ≤ 1.5 × scale`，`ResizeObserver` 跟随窗口
- [x] 帧率上限、`document.hidden` 暂停、`prefers-reduced-motion`（后者待接）
- [x] 可读性：`dim`/`tint`/`tintMix` 在 `main()` 里混合（零额外合成，一层就是整个玻璃滤镜），`blur` 走 CSS 且默认 0
- [x] 单层滤镜接管「玻璃」：外壳 token 全透明，暗色/亮色滤镜都由播放器画（详见 `docs/00-决策与方案复核.md` §9.4）
- [x] **`mainSound` 音频（M2）**：四种签名全兼容 —— `vec2`/`float` 返回值 × `(float time)`/`(int samp, float time)` 参数；单声道复制到左右，`samp` = 绝对采样序号；4096 采样 → `readPixels` → WebAudio 前瞻调度
- [x] 无头 Edge 回归脚本跑通：aurora/flow/legacy/es1/broken/missing 六个场景 + pulse/mono-sound 音频场景

## 还没做（后续里程碑）

- [ ] 多 pass（Buffer A–D + ping-pong）—— 数据模型与通道绑定要先定
- [ ] 自适应分辨率 / 电池降档 / 软渲染检测（M3）
- [ ] 兼容性静态体检（外部纹理、cubemap、键盘通道、`mainVR`）
- [ ] `iMouse` 的父页面转发（client 半已接上，做「只在空白处拖拽」的过滤）
- [ ] `dim`/`tint` 对 legacy `void main()` 作品不生效（这些作品没有 wrapper 注入点）

## 眼下的已知取舍

- `alpha:false` + iframe `opacity` 做透明度；画布本身不透明（省合成开销）。
- 时间轴：`iTime` 累加 `dt × speed`，切作品归零；`iTimeDelta` 用真实帧间隔（不乘 speed）。
- GLSL ES 3.00 保留字（`patch`、`sample`、`input`、`output` 等）会让 ES3 编译失败、静默掉到 ES1 —— 这是已知坑，写 shader 时避免。
- **`precise` 限定符在 WebGL2 里不存在**（GLSL 4.0 / ESSL 3.20 才有）：`precise float x = …` 会直接 `undeclared identifier`，ES3/ES1 都编译不过。ShaderToy 上防「驱动 FMA 收缩导致共享晶格点哈希不一致」的写法要换成**整数哈希**（`uint` 位混合），见 `docs/00-决策与方案复核.md` §9.6。
