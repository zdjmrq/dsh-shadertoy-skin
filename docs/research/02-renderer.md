# 02 · 渲染端技术设计：零依赖 WebGL2 mini-player + WebAudio

> 范围：渲染 + 音频 + 背景层落地（不含插件壳/UI/持久化）。证据分级：**【标准】** 规范/官方；**【证据】** 有公开实现或演讲；**【经验】** 工程判断；**【待实测】** 必须上机跑数。
> 先修正一处：方案文档的「512×2 第一行 L 第二行 R」**不成立**，正确是 **row0 频谱（FFT）/ row1 波形**（§4.1）。

## 0. 结论速览

| 决策 | 结论 |
|---|---|
| 运行时 | 单文件 `player.html` + 同源 iframe，`postMessage` 传参（open-sea-skin 已验证此路线） |
| GLSL | 主路径 `#version 300 es` + 旧语法自动改写；失败退回 ES 1.00 原样编译（ShaderToy 2017 迁 WebGL2 时也是批量改写 `texture2D`→`texture`） |
| context | `alpha:false, antialias:false, depth/stencil:false, preserveDrawingBuffer:false, powerPreference:'low-power'` |
| 层级 | iframe = body 首子节点 `fixed;inset:0;z-index:0;pointer-events:none`；兜底注入 `#root{z-index:1}` |
| 音频 v1 | 4096 采样大块 → `readPixels` → `AudioBufferSourceNode` 前瞻调度 + 500ms 预缓冲；**不上 AudioWorklet** |
| 模糊 | 低分辨率承担「柔」+ CSS blur 承担「糊」，blur>0 才启用，默认 0 |
| 性能 | AC 60fps / 电池 30fps；DPR 上限 1.5（单 pass）/ 1.0（多 pass） |
| 兼容承诺 | v1 只承诺纯程序化单 pass（可选 sound）；多 pass 实验性；外部纹理/键盘/mainVR 不支持 |
| 零依赖 | 成立，无需破例；WebGPU 更差（只吃 WGSL 需转译，Electron/Windows 可用性更低） |

## 1. 运行时架构

**1.1 player 内部结构**（全部内联）：`player.html` = `<style>`(画布/错误面板/调试) + `<canvas>` + 单 IIFE `<script>`，模块按注释分块：`msg`（postMessage 协议/同源校验）、`gl`（context、编译缓存、全屏三角形 VBO、FBO）、`preprocess`（版本/legacy 改写、uniform 注入、行号还原）、`passes`（pass 表、通道绑定、ping-pong）、`uniforms`（iTime/iFrame/iMouse/iDate/iChannel*）、`audio`（sound program、分块渲染、16bit 打包、调度、Gain/限幅）、`quality`（DPR/自适应/帧率上限/visibility/contextlost/软渲染降级）、`main`（生命周期、参数、错误与 stats 上报）。
协议：`init{shader,channels,params,theme}`/`params`/`mouse`/`theme`/`pause`/`reset` → `ready`/`error{stage,log}`/`stats{fps,ms,scale}`/`audio{state}`/`contextlost`。

**1.2 WebGL2 上下文**

```js
const gl = canvas.getContext('webgl2', {
  alpha: false,                 // 透明交给 iframe 的 CSS opacity，画布保持不透明
  premultipliedAlpha: true,     // alpha:false 时无意义，保持默认
  antialias: false,             // 全屏三角形无几何边缘，MSAA 纯浪费
  depth: false, stencil: false,
  preserveDrawingBuffer: false, // 必须 false：不回读画布；true 每帧多一次全屏拷贝
  powerPreference: 'low-power', // 背景层优先核显省电；high-performance 需重建 context
  desynchronized: false, failIfMajorPerformanceCaveat: false,
});
```
- 抗锯齿：斜线来自片元内部，MSAA 无效；真要抗锯齿在 wrapper 做 FXAA（M3 可选）。截图导出应渲染进 FBO 再读。失败链：`webgl2` → `webgl`（ES1 路径）→ 全失败显示占位并提示。Chromium/Windows 走 ANGLE→D3D11，WebGL2 基本恒可用，但 Chrome 正在退役 SwiftShader 软渲染回退（[Chrome 企业版说明](https://support.google.com/chrome/a/answer/7679408)），**必须处理 `getContext` 返回 null**。

**1.3 GLSL 版本与改写**：主路径 `#version 300 es`。ShaderToy 2017 迁 WebGL2 时批量把 `texture2D{GradEXT,LodEXT}()` 改成 `texture{Grad,Lod}()`（[Khronos SIGGRAPH 2017 演讲](https://www.khronos.org/assets/uploads/developers/library/2017-siggraph/WebGL-BOF-ShaderToy-Aug17.pdf)）；现代作品普遍用 `textureLod`/`dFdx`/整数运算，只有 ES3.00 覆盖。WebGL2 上下文**同时接受 ES 1.00 与 3.00**（[WebGL 2.0 规范](https://registry.khronos.org/webgl/specs/latest/2.0/)），二次尝试几乎零成本。预处理（按序、词边界、跳过注释/字符串）：
- `texture2D(`/`textureCube(` → `texture(`；`texture2DProj(` → `textureProj(`；`texture2D{Lod,Grad}EXT` → `texture{Lod,Grad}`。
- `varying`/`attribute`/`gl_FragColor` → `in`/`in`/`st_out`（兼容粘贴来的非 ShaderToy 代码）。
- 删除行首 `#version`（自己写）、删除 `GL_OES_standard_derivatives`/`GL_EXT_shader_texture_lod`/`GL_EXT_frag_depth`；**其他 `#extension` 提升到 header**（须在 `#version` 后、任何声明前）；删除 `#line` 并记偏移。
- header：`precision highp float; precision highp int;`（重复声明不报错）+ 缺失 uniform + `out vec4 st_out;`。
- 流程：ES3 改写版 → 失败且日志含 `redefinition of 'iX'` 就逐个删重复 uniform 重编（≤12 轮）→ 仍失败用 ES1 原样编译 → 都失败上报（错误行号 = 日志行号 − header 行数）。切换作品开 `KHR_parallel_shader_compile` 轮询 `COMPLETION_STATUS_KHR`，避免一次编译卡主线程 200ms+【经验】。

**1.4 尺寸**：`canvas.width/height = CSS 尺寸 × min(devicePixelRatio, dprCap) × qualityScale`；`iResolution` 用绘制缓冲像素（低分辨率时 ShaderToy 眼里就是一块小屏，成本按面积降）。跨屏 DPR 变化用 `ResizeObserver` + 每次重读 `devicePixelRatio`，变了重建 FBO。

## 2. Uniform 注入

### 2.1 标准 uniform 清单（【证据】ShaderToy 页内 uniform 头、[Mesa cube-shadertoy.c](https://cgit.freedesktop.org/mesa/kmscube/tree/cube-shadertoy.c)、[threejs-shadertoy](https://github.com/rocksdanister/threejs-shadertoy)）

| uniform | 类型 | 计算 | 坑 |
|---|---|---|---|
| `iResolution` | vec3 | `(bufferW, bufferH, 1)`，每 pass 用自己尺寸 | 不是 CSS 尺寸 |
| `iTime` | float | 累加 `dt × speed`；换作品归零；隐藏冻结 | 别直接用 `performance.now()/1000` |
| `iTimeDelta` | float | 上一帧真实耗时 clamp(0,0.1) | ShaderToy 不乘 speed；乘了时间积分类效果变味【经验】 |
| `iFrame` | **int** | 每次真正渲染 +1；音频块渲染不增 | 类型是 int |
| `iMouse` | vec4 | 见 §2.2 | 本帧没收到消息也沿用旧值 |
| `iDate` | vec4 | 见 §2.3 | 本地时区，非 UTC |
| `iSampleRate` | float | 44100（AudioContext 实际值不同则用实际值并告警） | image pass 声明也无妨 |
| `iChannel0..3` | sampler2D | 按 pass 通道绑定表逐条 set | 只 set 拿到 location 的；未绑定给 1×1 黑纹理 |
| `iChannelTime[4]` | float[4] | v1 恒 0（仅视频/动画纹理非零） | location 用 `'iChannelTime[0]'` |
| `iChannelResolution[4]` | vec3[4] | 绑定纹理 `(w,h,1)`；cubemap `(size,size,1)`；音频 `(N,1,1)`；未绑定 `(0,0,0)` | 未被引用的整组可能 location 为 null |

### 2.2 `iMouse` 语义与状态机（【证据】[shader_fun iMouse](https://pub.dev/documentation/shader_fun/latest/shader_fun/CommonUniforms/mouse.html)）

- `xy` = 当前指针像素坐标，**原点左下、y 向上**（与 `gl_FragCoord` 同系），不按下也持续更新。
- `zw` = 点击锚点：按下 = 按下点；**拖动中不更新**（否则 `xy-zw` 恒 0，拖拽交互失效）；松开后变 `(-|x|,-|y|)` 保留最后位置；`iMouse.z>0` 即「按住」是社区通用写法；初始 `(0,0,0,0)`，切作品重置。

```js
const sx = () => canvas.width / innerWidth, sy = () => canvas.height / innerHeight;
const toPx = (cx, cy) => [cx * sx(), (innerHeight - cy) * sy()];
onpointermove: cur = toPx(e.clientX, e.clientY);
onpointerdown: down = true; anchor = cur;
onpointerup:   down = false;                                    // anchor 保留
set4('iMouse', cur[0], cur[1], down ? anchor[0] : -Math.abs(anchor[0]),
                                 down ? anchor[1] : -Math.abs(anchor[1]));
```
iframe `pointer-events:none`，事件在**父页面**收后 `postMessage`（§5.5）；触屏同映射；键盘不转发（C6）；父侧节流到每帧一条。

### 2.3 `iDate`
`(year, month, day, secondsOfDay)`：year 如 2026；**month 0–11**（社区复刻一致，季节类 shader 也按 0 起算，[shader_fun iDate](https://pub.dev/documentation/shader_fun/latest/shader_fun/CommonUniforms/date.html)）；day 1–31；w = 时×3600+分×60+秒+毫秒/1000，本地时区。month 下标属【证据】非官方文档，M3 用依赖 iDate 的作品实测。

### 2.4 自动补齐与去重（关键）
1. 去注释/字符串后按 `uniform[^;]*\b<name>\b` 判定已声明，只补缺失（含 `iChannelTime[4]`、`iChannelResolution[4]`、`iChannel0..3`）。
2. 检测 `#define iTime`/`#define iResolution`（离线渲染版常见）：**不注入**并上报「时间不可控」，否则宏污染声明。
3. 兜底自愈：编译日志出现 `redefinition`/`redefined` 就删该声明重编（≤12 轮），比纯正则可靠。
4. 顺带注入 `#define HW_PERFORMANCE 1`（桌面档，部分作品据此调循环次数）【经验】。

## 3. 多 pass（Buffer A/B/C/D）

**3.1 数据模型补丁**：`code:{image,buffers?,sound?}` 不够，**每个 pass 的 4 个通道各绑什么**必须一起存。官方 API 能拿 `passes[].inputs[].channel/type/id`；粘贴代码拿不到，只能启发式+手选：

```ts
channels?: Record<'image'|'A'|'B'|'C'|'D', Array<
  {kind:'none'} | {kind:'buffer', target:'A'|'B'|'C'|'D'} |
  {kind:'audio'} | {kind:'image', asset:string}>>   // v1 只支持前三种
```
默认启发式：把代码里引用到的 `iChannelN` 依次绑到第 N 个 buffer（Image 优先），UI 标「自动推断，请确认」——多 pass 体验最大不确定点。

**3.2 帧内顺序与 ping-pong**（【证据】每 buffer 每帧只执行一次；后序 pass 读本帧结果，自引用读上一帧）：每个 buffer 双纹理（`tex[i][0/1]`+`cur[i]`），全 ping-pong 最稳。

```js
for (const pass of ['A','B','C','D','image']) {
  if (pass !== 'image') bindFBO(tex[pass][1 - cur[pass]], size); else bindDefaultFBO();
  for (let ch = 0; ch < 4; ch++) {
    const b = binding(pass, ch);
    if (b.kind === 'buffer') {
      const j = b.target, readNew = order[j] < order[pass];   // 早于本 pass 已渲染 → 本帧
      bindTexture(ch, tex[j][readNew ? 1 - cur[j] : cur[j]]);
    } else if (b.kind === 'audio') bindTexture(ch, audioTex);  // v1 不做可视化，给黑纹理亦可
    else bindTexture(ch, black1x1);
  }
  draw();                             // 每 pass 重设全部 uniform（iResolution 随 pass）
  if (pass !== 'image') cur[pass] = 1 - cur[pass];
}
iFrame++;                             // 整帧结束 +1，所有 pass 共享同一 iTime/iFrame
```
要点：单帧内顺序执行、读写不同纹理无需 fence；**自引用必须双缓冲**；Image 不落显存；切作品清空所有 buffer；分辨率默认全部等于 image（ShaderToy 语义）；buffer 尺寸随质量档重建，不逐帧改。

**3.3 格式与显存**（【待实测】ShaderToy 内部 buffer 精度无权威文档）：默认 RGBA8/UNORM（社区复刻普遍如此，与「用 0..1 编码状态」的写法吻合）；`RGBA16F` 作实验开关（需 `EXT_color_buffer_float`，16F 可线性过滤；32F 还需 `OES_texture_float_linear`）。过滤/包裹默认 `LINEAR + CLAMP_TO_EDGE`，每通道可配（对齐 ShaderToy 输入面板）。显存：1080p 单张 8.3MB、ping-pong×4 buffer ~66MB；1440p ~118MB；2160p ~265MB → 多 pass 作品 `dprCap` 降 1.0，并按 120MB 预算反算 `scale = min(1.5, sqrt(120MB/(8·W·H·4B)))`。

## 4. `mainSound` 音频管线

**4.1 规范核实（修正方案文档）**：ShaderToy 图像 pass 里 `iChannel` 指向音频时拿到 **512×2** 纹理：**row0 = 频谱（FFT 512 bin，0..1）、row1 = 波形（单声道 512 采样）**。出处：[shader_fun 音频常量](https://pub.dev/documentation/shader_fun/latest/shader_fun/kAudioTextureWidth-constant.html)（row0 FFT / row1 waveform）、[Synthclipse](https://synthclipse.sourceforge.net/user_guide/music.html)（512×2，第一行频谱第二行波形）、[知乎搬运 ShaderToy 实现](https://www.zhihu.com/question/40400445)（`texture2D(iChannel0,vec2(uv.x,0.25)).r` 取频谱）、[openDAW 手册](https://opendaw.studio/manuals/shadertoy)（同布局）。**「第一行 L、第二行 R」查不到公开依据**，大概率是「播放用立体声渲染目标」与「可视化音频纹理」被混为一谈。v1 不做 iChannel 音频回馈（C9），内部播放编码自定义即可；M3 做可视化时按上述布局对齐。采样率 **44100** 是 ShaderToy 惯例（`iSampleRate // i.e., 44100`），`mainSound(float time)` 返回 `vec2` 立体声 −1..1。

**4.2 播放编码 + wrapper**：不用 512×2 两行 L/R，改用**宽 4096、高 1、RGBA8 装两路 16bit**（8bit 只有 ~48dB 信噪比，量化噪声可闻；16bit ~96dB）：

```glsl
// 追加在用户 sound 代码之后；iTime/iSampleRate 由 header 注入，勿重复声明
vec2 pack16(float v) {            // v∈[-1,1] → R=高8位, G=低8位
  float u = clamp(v * 0.5 + 0.5, 0.0, 1.0), n = floor(u * 65535.0);
  return vec2(floor(n / 256.0), n - 256.0 * floor(n / 256.0)) / 255.0;
}
void main() {
  float t = iTime + gl_FragCoord.x / iSampleRate;   // 每像素 = 一个采样
  vec2 s = mainSound(t);                            // L,R
  st_out = vec4(pack16(s.x), pack16(s.y));          // 4096×1 读回 = 16KB
}
```
JS 解码 `((R<<8)|G)/65535*2-1` 写进 `AudioBuffer(2, N, 44100)`。速度参数：整条音频与画面共用着色器时间轴，块内采样步长 = `speed/44100`（speed≠1 像黑胶变速，音画不分家）；v1 接受音高变化并在 UI 提示。

**4.3 调度与预缓冲**（【待实测】微调）

| 参数 | 建议值 | 理由 |
|---|---|---|
| 块大小 | **4096 采样（92.9ms）** | readPixels 从 86/s 降到 **10.8/s**；8192 更省但块更粗 |
| 调度/前瞻/预缓冲 | `setInterval(120ms)` 与 rAF 解耦；前瞻 400ms、预缓冲 **500ms（≥4 块）** | jank 由预缓冲吸收；背景音乐可容忍 ~0.5–0.7s 起播延迟，换抗卡顿 |
| 排程 | 起播锚 `ctx.currentTime+prebuffer`，之后块长首尾严格相接 | 否则爆音 |
| 增益 | `source→gain→限幅器→destination`；`gain.setTargetAtTime(v, now, 0.02)` | 防爆音；限幅器兜 shader 音乐过载 |
| context | `new AudioContext({sampleRate:44100, latencyHint:'playback'})` | 对齐 iSampleRate；实际 rate 不同则用 `ctx.sampleRate` 并告警 |

**4.4 `readPixels` 代价与异步回读**：同步 `readPixels` 强制 flush+等 GPU，**阻塞管线**；小回读典型 0.3–3ms，但会随驱动/负载尖峰（[WebKit bug 235002](https://www2.webkit.org/show_bug.cgi?id=235002) 结论即「readPixels 天然慢，建议 PBO+fence」）。v1 取舍：10.8 次/s × 1–3ms ≈ 1–3% 时间，且块渲染只有 4096 个片元，可接受（比 512 逐块 86 次/s 好一个数量级）。若实测每 90ms 掉一帧：WebGL2 用 **PBO + `fenceSync` + `clientWaitSync(0)` 轮询 + `getBufferSubData`** 异步回读（~40 行，延迟一帧，对 BGM 无感），M2 备选。共用 context 的时序风险：① 音频块放定时器里，且距上一帧 >4ms 才插入，避免和画面抢帧；② 切作品前先 `stop` 所有已排 source；③ `webglcontextlost` 立即停调度，恢复后从当前 `chunkIndex` 续（`mainSound(t)` 是纯函数，可无缝续）。v1 不拆第二个 context。

**4.5 `AudioBufferSourceNode` vs `AudioWorklet`（v1 结论：ABSN）**

| 维度 | ABSN 前瞻调度（v1） | AudioWorklet（v2 备选） |
|---|---|---|
| 实现量 | ~150 行 | ~300 行 + 跨线程缓冲协议 |
| 断音/接缝 | 定时器抖动+块接缝，500ms 预缓冲后基本无感；大卡顿会缺口 | 采样级连续，无接缝 |
| 传输 | 主线程渲染完直接建 AudioBuffer | Float32Array `postMessage` 转移（SAB 需 crossOriginIsolated，`dsh-app://` 不保证，不用） |
| 结论 | **v1 用这个** | 只有可闻爆音/接缝实测出现才做 |

**4.6 自动播放双轨**：Electron 文档默认 `autoplayPolicy:'no-user-gesture-required'`（[webPreferences](https://www.electronjs.org/docs/latest/api/structures/web-preferences)），但社区实测存在文档与行为不符（[cordova-electron #102](https://github.com/apache/cordova-electron/issues/102)）→ **不能只靠默认值**。同源 iframe 已在 `autoplay` 默认 allowlist（`self`）内，`allow="autoplay"` 非必需但写上无副作用；**不要加 `sandbox`**（会打断脚本/自动播放）。兜底：player 内 `ctx.resume().catch()`；仍 suspended → 上报宿主显示「开声音」按钮，父页一次性 `pointerdown/keydown` 转发 `userGesture` 再 resume；纯浏览器默认静音播放+按钮（C7）。

## 5. 背景层落地：iframe vs 直接 canvas

**5.1 对比与结论**

| 维度 | A. 同源 iframe（推荐，已被 open-sea-skin 验证） | B. 宿主页直接 `<canvas>` |
|---|---|---|
| JS 异常/编译失败/OOM 泄漏 | 止于子文档，`location.reload()` 即重启 | 污染宿主，只能整页刷新 |
| GL context lost | 子文档自行重建；母页无第二 WebGL 不受伤 | 母页其它 GPU 用途一起丢 |
| GPU 进程崩溃 | **隔离不了**（见 5.2） | 同样隔离不了 |
| 层叠/指针/调试 | 多一层文档，需 postMessage + 层叠验证 | 最直接，好调试 |
| 性能 | 多一次合成层，开销可忽略 | 略省 |
| 结论 | **A**：player 保持可独立打开，先 iframe | B 作 iframe 加载失败时降级 |

**5.2 iframe 实际能隔离什么**：编译/链接失败→完全能（本就只是 API 错误，面板报错即可）；player JS 异常、显存/内存泄漏→能（切作品或重载 iframe 释放）；WebGL context lost（驱动 TDR/GPU 繁忙）→能恢复本 context，失败则重载 iframe；**GPU 进程崩溃**（ANGLE 编译/驱动 bug 可触发，见 [Chromium issue 41211693](https://issues.chromium.org/issues/41211693)）→**不能**，同 GPU 进程所有 context 一起丢、Chromium 可能整页恢复/重载，所以还要崩溃计数持久化 + 连续 2 次进安全模式（关背景）+ 一键关闭；同源 iframe 通常同渲染进程，OOM 也不隔离，只能限制纹理/缓冲尺寸。

**5.3 层叠与透明 CSS（必须实测）**：CSS 绘制顺序【标准】（[CSS 2.1 附录 E](https://www.w3.org/TR/CSS21/zindex.html)）：根背景 → **负 z-index 子层** → 普通流块背景 → 浮动 → 行内内容 → **positioned + z-index:0/auto（树序）** → 正 z-index。推论：`z-index:0` + body 首子节点在普通流行内内容**之上**、在树序更晚的定位内容**之下**——只有当宿主可见内容都在定位/带 z-index 容器里时才保证「背景在下」；DSH 的 React 布局大量用定位容器，所以这条路线能跑通，**但这是依赖宿主 DOM 的假设，必须验证**。`z-index:-1` 天然在全部内容之下，但要求 `html/body` 背景透明（若 `html` 有不透明背景且 body 背景未传播，body 背景会盖住它），风险转嫁主题侧。推荐沿用 `z-index:0` + 兜底：

```css
#shader-skin-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none;
  border: 0; background: transparent; display: block; }
#root { position: relative; z-index: 1; background: transparent; } /* 兜底：整棵 UI 明确高于背景 */
```
`#root` 提到 z-index:1 后其内部弹层（z-index 1000 等）相对关系不变，风险低；仍要验证 portal 到 body 的弹层/右键菜单（定位+z-index>0 本就在背景之上，正常）。**验证方法（M0 验收）**：① player 加 `?debug=bg` 整屏洋红；② 父页临时把 iframe `pointerEvents='auto'`，视口按 100×60 网格跑 `document.elementsFromPoint`，统计最顶层是 iframe 的比例，应为 **0%**；③ 正常渲染截图取正文区域算背景可见性/亮度，检查 `getComputedStyle(body/html/#root).backgroundColor` 是否不透明；④ 主题 token 透明化后重跑 ②③，对比度按 p5 ≥ 4.5 口径复测。

**5.4 canvas 像素格式**：`alpha:false`；`premultipliedAlpha` 保持默认（alpha:false 时无意义）；iframe 透明度用 `#bg{opacity:0.3–1}`，**不要**用背景色/多个覆盖层凑透明度，一个 opacity 合成成本最低。

**5.5 iMouse 转发**：父页 `window` 收 `pointermove/down/up`，按 §2.2 换算后 postMessage；**不需要 `elementFromPoint`**：`pointer-events:none` 让事件天然落在宿主元素上、坐标就是视口坐标，而 iframe 是 `inset:0`、两个文档视口完全重合，无偏移。只在 `document.hasFocus()` 时转发；每帧最多一条；拖选文本时 `pointerup` 可能落在窗口外 → 监听 window；`pointercancel`/失焦视为松开。

**5.6 模糊、压暗与可读性**：低分辨率+双线性放大只省填充成本（scale 0.5 → 片元 25%），视觉是 1–2 CSS px 的「柔」，**不是「糊」**；CSS `filter:blur(r)` 才是「糊」——合成器两遍高斯，成本随面积×半径增长且强制该层单独渲染表面（多一次拷贝），1080p、r≤12 大致 1–3ms 量级，4K/大半径明显更贵（【待实测】；社区经验：大半径 `filter/backdrop-filter` 是主要卡顿源，见 [hyperframes](https://github.com/heygen-com/hyperframes/pull/2979/files)）。推荐：blur=0（默认）→ 不加 filter、不设 will-change、内部 scale 正常；1–6px → scale 0.75 + `blur(min(r,6)px)`；6–12px → scale 0.5 + `blur(min(r,12)px)`；>12px → 上限 12px + scale 0.5；`will-change:filter` 只在 blur>0 时设，切走清掉。**压暗/可读性（第一约束）**在 wrapper 里做，零额外合成成本：`c = mix(c * u_dim, u_tint, u_tintMix)`——暗色主题 `u_dim=0.5`（把背景平均亮度压到正文对比度安全区），亮色主题向 `#ececec` 混合（避免深色背景衬深色文字）；弹窗打开时宿主发消息 dim +0.15，输入/发送时短暂 +0.05（200ms 过渡）；默认 blur=0（画质优先），一键「可读性优先」= dim 0.65 + blur 8，最终以截图 p5 ≥ 4.5 为准（token 透明化属主题侧，渲染侧只暴露 dim/blur/opacity）。

## 6. 性能与功耗策略

| 策略 | 数值 | 触发/说明 |
|---|---|---|
| DPR 上限 | 单 pass **1.5**；多 pass **1.0** + 120MB 显存预算 | 【经验】同类插件取值 |
| 帧率 | AC 60fps；电池/低功耗 **30fps** | 30fps 用跳帧（每 2 个 rAF 渲染一次），成本约减半 |
| 自适应分辨率 | EMA>22ms 连续 90 帧 → `scale*=0.85`；<12ms 连续 180 帧 → `scale*=1.05`；上限 cap，下限 0.5 | 变化时重建 FBO，带滞回防抖 |
| 隐藏/失焦 | 隐藏→停 rAF 与音频调度，恢复 `last=now` 且 iTime 不跳变；失焦→可选降到 30fps（不停） | 最小化/切走触发；防看视频时背景狂跑 |
| reduced-motion | 默认**静态模式**：只渲染首帧+参数变化重绘 | 尊重系统设置，可强制开动画 |
| 电池/低功耗 | 宿主 `powerMonitor.isOnBatteryPower()`（Electron）→ DPR1.0 + 30fps + blur 上限 6px；浏览器退化为 `navigator.getBattery()` | 【待实测】 |
| 软件渲染检测 | RENDERER 含 `SwiftShader`/`Basic Render Driver`/`WARP` → 强制 0.5 scale + 30fps 或建议关闭 | 避免软渲染吃满 CPU【待实测】 |
| 切作品 | 编译完成前保留旧帧；编译失败回退旧作品并提示 | 避免白屏 |

优先级：**文字可读性 > 交互流畅（≥30fps）> 视觉华丽 > 分辨率**。降档先降分辨率，再降帧率，最后降 blur/关特效；不允许以掉到 15fps 换画质。

## 7. 兼容性风险与导入静态检查

**7.1 常见不兼容点**

| 类别 | 例子 | 处理 |
|---|---|---|
| 外部纹理 iChannel | 图片/视频/噪声纹理、cubemap（`samplerCube`） | v1 不支持；静态检查命中即提示「需要外部纹理」 |
| 键盘通道 | 256×N 键盘状态纹理（复刻 [shader_fun](https://pub.dev/documentation/shader_fun/latest/shader_fun/KeyboardChannel-class.html) 为 256×3，另说 256×2） | 不转发（C6），给零纹理+提示「交互被削弱」 |
| `mainVR`/`mainCubemap` | VR 专用入口（[ShaderToy howto](https://www.shadertoy.com/howto)） | 无 `mainImage` 即判不支持 |
| 自带 `main()` | 其他平台粘贴的代码 | 支持（改写 `gl_FragColor`→`st_out`），否则报错 |
| ES3 保留字 | 变量名 `sample`/`input`/`output` | 编译报错 → 提示手动改名 |
| uniform 被覆盖/非标准 | `#define iTime`（离线渲染版）、`iFrameRate`/`iCubemap` 等 | 覆盖则不注入并提示时间不可控；非标准不注入（自带声明照常编译但值不更新） |
| 巨大循环/重度 raymarch | 编译慢、GPU 卡 | 编译超时 5s 判失败；运行时看门狗 |
| 多 pass 绑定未知 | 粘贴丢绑定信息 | 启发式 + UI 确认 + 告警 |

**7.2 编译前静态检查清单（导入必须给结论）**：① 有 `mainImage`（或可改写 `main`）？有 `mainVR/mainCubemap` → 不支持。② 有 `mainSound` → 标「有声音」（M2 可播），签名异常/多个 → 标「无声音」。③ pass 数量（API 元数据或粘贴时勾选 A–D）→ 多 pass = 实验性。④ 代码里 `iChannelN` 引用 vs 绑定表，绑定 none 却被引用 → 黑纹理+告警。⑤ 外部纹理/视频/cubemap 绑定（API `inputs[].type`）→ 不支持。⑥ 键盘通道绑定 → 不支持（降级无交互）。⑦ `#define` 覆盖 uniform → 告警。⑧ ES3 保留字、`#include`、`layout(location` 多输出 → 不支持。⑨ 语法预检：不引 glslang，直接在离屏 1×1 WebGL2 上试编译并缓存结果（最可靠，别让用户点了才炸）。⑩ 复杂度启发：统计循环嵌套与步数常量（>256 步/像素）→ 标「高负载，将自动降档」。

**7.3 24 个作品抽样**

| id | 作品（已核验） | 结构 | 风险/成本 |
|---|---|---|---|
| `Ms2SD1` | **Seascape**（TDM，[Intel 支持文档确认](https://www.intel.co.kr/content/www/kr/ko/support/articles/000102855/graphics.html)） | 单 image、无通道、无声音；raymarch+FBM | 中高 GPU 成本，DPR 1.0 起测；兼容性最好，M0 默认作品 |
| `XslGRr` | **Clouds**（2D FBM，[FullByte 列表](https://raw.githubusercontent.com/FullByte/FullByte.github.io/main/docs/tech/art/random/shadertoys.md)） | 单 pass、纯程序化、无声音 | 低负载，首选调试 shader |
| `Xds3zN` | **Raymarching - Primitives**（iq，[reindernijhoff 注释](https://github.com/reindernijhoff/shadertoy/blob/master/sh17c-raymarching-tutorial/Buffer%20A.glsl)） | 单 pass、纯程序化；可能用 iMouse 转相机 | 低中负载；鼠标转发要测 |
| `fXc3RB` | 黑白摩托+音乐（备注） | 预计 image+sound，可能多 pass | **待核验**（需 API key），M2 音频验收首选 |
| `MtcGDH`/`Xs2fWD` | Minecraft 风格 / 类元气骑士 | 交互类（iMouse/键盘） | 键盘不支持→交互残缺；可能有游戏状态依赖 iFrame 连续帧 |

结论：附录 A 大多可按「单 pass 程序化」跑，真正工作量在**逐条静态检查 + 音频作品 sound pass + 少量多 pass 作品**，逐条核验放 M1（API 拉取后自动生成报告），别拖到 M3。

**7.4 必须实测才能定**：buffer 精度对具体作品观感的影响、多 pass 同帧读写顺序是否符合 ShaderToy、`iDate` 月份下标、音频可视化纹理数值编码（0..1 偏置 vs 有符号）、`filter:blur()` 真实毫秒数、`readPixels` 本机驱动尖峰、Electron 自动播放策略实际行为。

## 8. 工作量与依赖

| 文件 | 职责 | LOC | 性质 |
|---|---|---|---|
| `player.html` | 外壳/CSS/调试层 | ~120 | 照写 |
| `gl.js` | context、编译、全屏三角形、FBO | ~220 | 照教程能写 |
| `preprocess.js` | 版本/legacy 改写、uniform 注入、去重自愈、行号 | ~220 | **中风险**（需逐作品回归） |
| `passes.js` | 多 pass 顺序、通道绑定、ping-pong | ~180 | **中高风险**（语义对齐需实测） |
| `uniforms.js` | 时钟、iMouse、iDate、通道分辨率 | ~130 | 照写 |
| `audio.js` | sound 编译、分块渲染、16bit 打包/解码、调度、Gain/限幅 | ~280 | **高风险**（readPixels 卡顿、爆音、音画同步） |
| `quality.js` | DPR/自适应/帧率上限/visibility/contextlost/软渲染 | ~150 | 照写+实测 |
| `main.js`+协议 | 生命周期、参数、错误/统计上报 | ~150 | 照写 |
| 合计 | | **~1450（M0 最小集 ~450）** | M0=单 pass+uniform+iframe+参数+错误面板 |

零依赖评估：**成立，无需破例**。渲染只是几十个 WebGL 调用；WebAudio 调度是纯数学；API 拉取在 Node 侧用 fetch；纹理导入（M3）用 `createImageBitmap`。不引 three.js：ShaderToy 代码是 GLSL 文本，three 帮不上多少，反带 300KB+ 和它自己的材质体系；不引 WebGPU：只吃 WGSL，GLSL→WGSL 转译会引入不稳定工具链，且 Electron/Windows 上 WebGPU 可用性不如 WebGL2（老 GPU/远程桌面/VM 可能直接不可用），而 ShaderToy 作品 100% 是 GLSL。唯一「破例」建议：GLSL 语法预检做成开发期工具（如 glslangValidator），不打包进运行时。里程碑：**M0** = player.html + gl.js + 最小 preprocess + uniforms + iframe/层叠/参数；**M2** = audio.js（大块回读+ABSN+Gain）；多 pass 与自适应放 M3（若 24 个里多 pass 占比超预期则提前）。

## 9. M0 最小可跑骨架（伪代码，**未实测**）

```html
<!-- /shader-skin/player.html：单文件，无依赖 -->
<canvas id="c"></canvas><div id="err"></div>
<script>(() => {
const post = m => parent.postMessage(m, location.origin);
const gl = document.getElementById('c').getContext('webgl2', {
  alpha:false, antialias:false, depth:false, stencil:false,
  preserveDrawingBuffer:false, powerPreference:'low-power' });
if (!gl) return post({type:'error', stage:'context', log:'WebGL2 不可用'});

// preprocess(src)：按 §1.3 规则做版本/legacy 改写、抽升 #extension、去重后注入 header（§2.1 全清单），
// 再拼接 wrapper `void main(){ vec4 c=vec4(0.); mainImage(c, gl_FragCoord.xy); st_out=c; }`
// makeProgram：编译+链接；失败解析 redefinition 删声明重试；返回 {prog, loc(name)}
// 全屏三角形：VBO(3 顶点, attrib 0) + drawArrays(TRIANGLES,0,3)；passes/audio/quality 在 M0 只留空钩子

const S = { t:0, frame:0, mouse:[0,0,0,0], prog:null, last:performance.now(), paused:false, p:{speed:1,scale:1} };
function nowDate(){ const d=new Date(); return [d.getFullYear(), d.getMonth(), d.getDate(),
  d.getHours()*3600+d.getMinutes()*60+d.getSeconds()+d.getMilliseconds()/1000]; }function frame(now) {
  if (S.paused) return;
  const dt = Math.min((now - S.last)/1000, 0.1); S.last = now; S.t += dt * S.p.speed;
  gl.viewport(0,0,c.width,c.height); gl.useProgram(S.prog);
  set3('iResolution', c.width, c.height, 1); set1('iTime', S.t); set1('iTimeDelta', dt);
  set1i('iFrame', S.frame); set4('iMouse', ...S.mouse); set4('iDate', ...nowDate());
  set1('iSampleRate', 44100);
  set3v('iChannelResolution', [0,0,0,0,0,0,0,0,0,0,0,0]); set1v('iChannelTime', [0,0,0,0]);
  draw(); S.frame++; requestAnimationFrame(frame);
}
addEventListener('message', e => {
  if (e.origin !== location.origin) return;
  const m = e.data;
  if (m.type === 'init') { S.prog = makeProgram(preprocess(m.shader.code.image));
    S.t = 0; S.frame = 0; S.paused = false; }
  if (m.type === 'params') S.p = m.params;
  if (m.type === 'mouse') S.mouse = m.mouse;
});
function resize(){ const dpr = Math.min(devicePixelRatio, 1.5), s = S.p.scale || 1;
  c.width = Math.max(1, Math.round(c.clientWidth*dpr*s));
  c.height = Math.max(1, Math.round(c.clientHeight*dpr*s)); }
addEventListener('resize', resize); resize(); requestAnimationFrame(frame);
})();</script>
```

## 10. 五个最大技术风险 + 缓解

| # | 风险 | 概率 | 缓解 |
|---|---|---|---|
| 1 | **GLSL 改写/多 pass 语义与 ShaderToy 不一致**：能跑但画面不同或编译失败 | 中高 | ES3+ES1 双尝试、重定义自愈；24 作品回归清单（截图人工比对，M1 前完成）；多 pass 标实验性且默认 RGBA8 |
| 2 | **`readPixels` 同步回读周期性卡顿/爆音**（每 ~90ms 一次 GPU 同步） | 中 | 4096 大块（10.8 次/s）+500ms 预缓冲吸收；实测掉帧则上 PBO+fence 异步；仍不行再 AudioWorklet（v2） |
| 3 | **层叠/透明依赖宿主 DOM 假设**：被内容盖住或主题 token 被上游改回不透明 | 中 | 兜底 `#root{z-index:1;background:transparent}`；洋红 debug + `elementsFromPoint` 网格 + 截图像素复测进 M0 验收；失败就禁用背景，绝不破坏 UI |
| 4 | **GPU 进程崩溃/TDR 连累整个 DSH**（iframe 不隔离 GPU 进程；ANGLE 编译崩溃有先例） | 低中 | 看门狗（单帧>2s 视为 hang）、崩溃计数持久化、连续 2 次进安全模式、一键关闭、复杂度预算、低功耗默认 |
| 5 | **24 作品实际结构未知**（多 pass/外部纹理/键盘/mainVR/音频签名）导致失败率高、体验落差 | 高 | 导入即静态检查+离屏试编译给明确结论；v1 只承诺纯程序化单 pass；多 pass/外部纹理列 M3；预设白名单 M1 用 API key 逐条核验 |

## 参考

- [ShaderToy · Khronos SIGGRAPH 2017 WebGL BOF 演讲（WebGL2 迁移、texture2D→texture 改写）](https://www.khronos.org/assets/uploads/developers/library/2017-siggraph/WebGL-BOF-ShaderToy-Aug17.pdf) ｜ [WebGL 2.0 规范（接受 ES 1.00/3.00）](https://registry.khronos.org/webgl/specs/latest/2.0/) ｜ [Multi-pass buffer 参考](https://github.com/MiniMax-AI/skills/blob/main/skills/shader-dev/reference/multipass-buffer.md) ｜ [CSS 2.1 附录 E 绘制顺序](https://www.w3.org/TR/CSS21/zindex.html)
- shader_fun：[iMouse](https://pub.dev/documentation/shader_fun/latest/shader_fun/CommonUniforms/mouse.html) ｜ [iDate](https://pub.dev/documentation/shader_fun/latest/shader_fun/CommonUniforms/date.html) ｜ [音频纹理 512×2 row0 FFT/row1 波形](https://pub.dev/documentation/shader_fun/latest/shader_fun/kAudioTextureWidth-constant.html) ｜ [键盘通道](https://pub.dev/documentation/shader_fun/latest/shader_fun/KeyboardChannel-class.html) ｜ [Mesa cube-shadertoy.c（uniform 头）](https://cgit.freedesktop.org/mesa/kmscube/tree/cube-shadertoy.c) ｜ [threejs-shadertoy（uniform 全清单）](https://github.com/rocksdanister/threejs-shadertoy) ｜ [ShaderToy howto（mainVR）](https://www.shadertoy.com/howto)
- [Synthclipse：512×2 音乐纹理，第一行频谱、第二行波形](https://synthclipse.sourceforge.net/user_guide/music.html) ｜ [知乎：ShaderToy 音频写进 512×2 纹理的实现讨论](https://www.zhihu.com/question/40400445) ｜ [openDAW Shadertoy 手册](https://opendaw.studio/manuals/shadertoy) ｜ [Electron webPreferences `autoplayPolicy`](https://www.electronjs.org/docs/latest/api/structures/web-preferences) ｜ [cordova-electron #102：默认值与实际不符](https://github.com/apache/cordova-electron/issues/102) ｜ [Chrome：SwiftShader WebGL 回退退役](https://support.google.com/chrome/a/answer/7679408)
- [Chromium issue 41211693：着色器编译触发 GPU 进程崩溃/context lost](https://issues.chromium.org/issues/41211693) ｜ [WebKit bug 235002：readPixels 慢，建议 PBO+fence](https://www2.webkit.org/show_bug.cgi?id=235002) ｜ [hyperframes：大半径 blur 是主要卡顿源](https://github.com/heygen-com/hyperframes/pull/2979/files)
