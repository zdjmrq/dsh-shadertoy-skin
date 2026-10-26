# dsh 桌面版 ShaderToy 实时背景皮肤插件实现方案

> ⚠️ 这是最初由 AI 生成、**未经核验**的方案草稿，其中多条外部断言已被证伪（路线分类、`script-src` 红线、音频纹理布局、许可证措辞等）。
> 保留它只为记录决策起点，**不要按它施工**——以 [00-决策与方案复核.md](00-决策与方案复核.md) 与当前 README 为准。

# 结论摘要

结论先行：完全可行。dsh（DeepSeek Harness）桌面版基于 Cordis「一切皆插件」架构，背景皮肤本质是一个 cordis 插件 \+ 一个轻量 WebGL 渲染器；你的 24 个初选 ShaderToy 作品不需要重型引擎，只需一个几百行的 WebGL2 迷你运行时即可实时渲染，声音同样支持（ShaderToy 的声音本来就是 GLSL，走 WebAudio 播放、音量用 GainNode 滑块）。社区已有 900\+ 主题/皮肤插件跑通同类能力（open\-sea\-skin 的实时 WebGPU 海洋、dsh\-video\-skin 的有声片头\+背景，都是可直接参照的先例）。

|你的问题|结论|关键依据|
|---|---|---|
|能否在 dsh 桌面版做实时渲染背景皮肤？|能，且是成熟做法。|dsh 插件生态有 274\+ 主题/外观插件，其中 open\-sea\-skin（实时 WebGPU 海洋背景）、dsh\-wallpaper\-engine（实时 WebGL 壁纸）已在运行。|
|是不是只需要一个轻量运行框架？|渲染端是；插件壳不是。|渲染只需 WebGL2 迷你运行时（约 300–500 行或 ShaderToyLite 等小库）；主要工作量在 cordis 插件壳、设置 UI 与持久化。|
|声音支持吗？|支持，可加音量滑块。|ShaderToy 声音=GLSL（vec2 mainSound\(float time\)），离屏渲染成采样流经 WebAudio 播放，GainNode 控制音量。|
|粘贴 Shadertoy 网址能自动拉取吗？|走官方 API，需 API key。|GET /api/v1/shaders/\{id\}?key=…；无 key 实测返回 403；最稳路径是直接粘贴代码。|

推荐实现范式：参照 [dsh\-video\-skin](https://raw.githubusercontent.com/Something11235/dsh-video-skin/HEAD/README.md)——零依赖、可用「设置→插件→添加插件」独立安装、桌面与网页通用，通过 webserver/index\-inject 注入一个 position:fixed、z\-index:\-1 的背景层；渲染器放进同源 iframe 里隔离崩溃。

# 既定决策与实现口径

以下为按你的确认固化下来的设计决策；文档其余章节与此冲突时以此为准。

|决策项|你的确认|落地方案|
|---|---|---|
|目标桌面|A1：官方 DeepSeek Harness 桌面版|按官方 Electron 桌面版实现与验证；注入机制用 index\-inject 覆盖层|
|插件许可|A2：MIT|插件本体 MIT 开源；CC BY\-NC\-SA 作品不进公开包，公开版预设改为「作品清单＋用户自备 API key 一键导入」|
|预设代码来源|B3：暂定 API key|提供 fetch\-presets\.mjs，用你的 key 构建期批量拉取 24 个作品内嵌（自用）；未提供 key 时内置少量自写示例 shader 占位|
|预设删除|B4：允许删除（需确认）|用户库可物理删除＋删除前二次确认；内置预设删除后可从「内置预设」重新添加，随时恢复|
|默认参数|B5：统一默认＋覆盖|全局默认参数＋每背景 params 覆盖|
|交互类作品|C6：保留交互但不影响 dsh|背景层 pointer\-events:none，永远位于 dsh 操作层之下、不拦截任何输入；父页面 mousemove 转发给 iframe 驱动 iMouse；键盘不转发|
|声音默认|C7：默认开＋记忆|桌面自动有声；每背景记忆音量与静音状态；浏览器端静音兜底＋「开声音」按钮|
|参数清单|C8：5 个参数＋适应全屏|透明度、模糊、缩放（含「适应全屏」按钮）、播放速度、压暗|
|音频可视化|C9：v1 不做|iChannel0 音频回馈后置；声音照常播放|
|交付目标|D10：做到 M2 并备份云盘|本轮交付 M0–M2（单背景→背景库→音频音量）；源码压缩包同步放豆包云盘|

# 背景：dsh 桌面版与 cordis 插件机制

## dsh 与桌面版

dsh（DeepSeek Harness）是 DeepSeek AI 的开源 agent harness，底层是 Cordis「一切皆插件」架构：模型适配器、工具、技能、会话、沙箱、存储、agent loop 乃至 UI 都是挂到共享上下文的插件，可从配置逐层替换。官方桌面版是 Electron 桌面应用，携带精确匹配的 dsh 生产运行时，窗口加载打包的 Web 资源，启动注入后在同一个文档中激活客户端插件；社区也有 Tauri 壳的桌面打包（dsharness\.app 等），跑的是同一套 Harness Web UI。因此「cordis 插件」是三种桌面形态共通的扩展方式。

插件安装：\`dsh plugin \-\-profile web add \<包名\>\`、\`github:用户/仓库\#分支\` 或 \`add \.\`，也可在「设置 → 插件 → 添加插件」粘贴安装源。注意：桌面版（Electron）的页面索引注入表是宿主启动时收集一次的快照，安装 UI 类插件后必须完全退出并重启 dsh 才会生效（刷新页面不够）。

## cordis 插件（bundle）结构

一个可安装插件是 npm 包：package\.json 里用 \`dsh\.bundle\` 指向 cordis\.patch\.yml（把插件插入配置树），模块导出 apply\(ctx, config\)，可选 name、inject（服务依赖）与 Config（Schemastery schema）。与背景皮肤相关的挂载点：

- **ctx\.on\('webserver/index\-inject', table =\> table\.push\(…\)\)**：往页面注入内联样式/脚本行的唯一推荐入口，这是背景层能进页面的机制。

- **ctx\.inject\(\['webServer'\]\)**：注册静态资源路由，同源提供 /shader\-skin/player\.html 等渲染资源。

- **ctx\.settings / ctx\.theme\.overrideTokens\(\)**：设置服务与可逆主题令牌（玻璃效果）。

- **持久化**：桌面页面走 dsh\-app:// scheme，localStorage 可用性不保证，用 $DSH\_HOME/\<插件\>\.json 文件更稳。

三条红线（来自 dsh\-video\-skin 实战踩坑，必须遵守）：

1. 注入行不能用 kind:'script\-src'——桌面解释器会 await 外部脚本行，一次拒绝就会杀掉 \_\_DSH\_BOOT\_READY\_\_ 使整个应用无法启动；内联 kind:'script' 行不会失败。

2. 注入监听器必须在 apply\(\) 中同步注册——对象级 inject 会延迟 apply 超过宿主一次性收集时机，行永远落不进去。

3. 背景层必须挂在 document\.body（body 首个子节点）——放进 \#root 会破坏内核的启动 DOM 水合。

## 背景皮肤的三种实现路线

|路线|代表插件|原理|能否独立安装|评价|
|---|---|---|---|---|
|A\. 原生 shell\.background slot|open\-sea\-skin|客户端插件通过 shell\.background 服务挂背景 iframe \+ 设置行 \+ 快捷入口|否，需改源码|最原生，但依赖上游补 slot，用安装脚本改源码|
|B\. index\-inject 覆盖层|dsh\-video\-skin、dsh\-bg\-new 等大量壁纸插件|注入内联脚本创建 body 首个子节点 fixed、z\-index:\-1 的背景层|是，零依赖|**推荐**：桌面\+网页通用，可发布、可回退|
|C\. Web 扩展 / 静态注入|open\-sea\-skin 扩展版|浏览器扩展 content\.js 注入|否（桌面不适用）|作为网页端兜底可保留，非主路径|

# ShaderToy 技术拆解

## 作品结构：图像、缓冲与声音都是 GLSL

ShaderToy 作品由若干片段着色器组成：图像着色器入口为 mainImage\(out vec4 fragColor, in vec2 fragCoord\)；多 pass 作品还有 buffer A/B/C/D（用 FBO 逐缓冲承接）；声音着色器入口为 vec2 mainSound\(float time\)，返回立体声采样。ShaderToy 运行时提供一组标准 uniform，本地复刻时必须在编译前由预处理器补齐声明：iResolution\(vec3\)、iTime、iTimeDelta、iFrame\(int\)、iMouse\(vec4\)、iDate\(vec4\)、iSampleRate、iChannel0–3\(sampler2D\)、iChannelResolution\[4\]、iChannelTime\[4\]。你的 24 个初选作品基本都是纯程序化单 pass 作品，兼容风险低。

## 音频规格：声音支持与音量控制的实现方式

声音与画面同一套机制：把 mainSound 渲染进离屏 FBO（社区复刻标准为 512×2 音频纹理、44\.1kHz，第一行左声道、第二行右声道），用 readPixels 回读采样块，交给 WebAudio 按前瞻调度播放；图像着色器可通过 iChannel0 采样这块音频纹理做可视化（如 texture\(iChannel0, vec2\(iTime, 0\)\)）。音量控制天然成立：在 AudioContext 输出前接一个 GainNode，滑块 0–100% 与静音都走它。自动播放策略：桌面 Electron 未设 autoplay 限制，可自动有声；纯浏览器默认拦截无手势的有声播放，需先静音播放兜底并给「开声音」按钮（dsh\-video\-skin 已验证此双轨）。现成参考实现：audio\-shader（npm，WebGL 音频流）、ShaderToyLite、CodePen 的 Sound Shader on three\.js。

## 获取作品代码的三种方式

|方式|说明|适用场景|
|---|---|---|
|官方 API|GET https://www\.shadertoy\.com/api/v1/shaders/\{id\}?key=\{API\_KEY\}；需 Shadertoy 账号，在 shadertoy\.com/myapps 创建 key；仅返回 public\+api 权限作品。无 key 实测直接 403。|「粘贴网址」导入；用户在设置里填 key 后自动拉代码|
|直接粘贴代码|从 Shadertoy 页面 Code 页复制图像/缓冲/声音代码，本地解析 GLSL 入库|**最稳**，无网络依赖，无需 key；你已计划支持，建议作为主路径|
|embed iframe 兜底|https://www\.shadertoy\.com/embed/\{id\} 官方播放器 iframe|临时预览；跨域无法控制音量与参数、背景不透明，不建议主路径|

# 轻量运行框架选型

回答你的核心问题：是，渲染端只需要一个轻量运行框架，不需要 three\.js 之类的重型引擎。推荐「自研 mini wrapper」——单文件 player\.html，内联全部 JS/CSS：

|方案|体量|能力|建议|
|---|---|---|---|
|自研 mini wrapper|约 300–500 行|uniform 注入、多 pass FBO、mainSound 回读、iChannel0 音频纹理|**推荐**：完全可控、零依赖、可打包进插件|
|ShaderToyLite|小库|社区通用 ShaderToy 兼容层（被 MCP server\-shadertoy 采用）|可作基础再扩展音频|
|glslCanvas|小库|通用 GLSL 画布，iChannel 支持一般|缺音频/多 pass 细节|
|three\.js \+ ShaderToy 教程|重型|全功能但体积大、开销高|不必要|

部署形态：player\.html 由插件 webServer 路由同源提供；背景层 iframe 隔离着色器崩溃；父页面 postMessage 传参数。性能策略照抄成熟插件：DPR 上限 1\.5、自适应渲染缩放、标签页隐藏时暂停、帧率上限、低功耗模式（open\-sea\-skin 已验证）。

# 插件整体设计

## 分层架构

四层结构：桌面壳 → Host 插件（Node 进程）→ 页面注入（Client 端）→ 背景 iframe 渲染器。参数与设置走「UI → Host 设置 API → postMessage → iframe」回路。

## 数据模型

```ts
interface BackgroundEntry {
  id: string
  name: string          // 备忘式自定义名
  source: 'preset' | 'url' | 'code'
  shaderId?: string     // ShaderToy 作品 id（preset/url 时）
  code: { image: string; buffers?: string[]; sound?: string }
  params: {             // 可每背景记忆，也可全局覆盖
    opacity: number     // 背景透明度 0-1
    blur: number        // 背景模糊 0-24px
    scale: number       // 缩放 0.5-2
    speed: number       // iTime 倍速 0-2
    volume: number      // 音量 0-1，仅 sound 存在时生效
    muted: boolean
  }
}

interface Settings {
  activeId: string
  entries: BackgroundEntry[]
  apiKey?: string       // 存本地，用于 URL 导入
}
```

## 功能清单映射

|你的需求|实现方式|
|---|---|
|预设背景库（你初选的 24 个）|构建期把代码内嵌进插件包（官方 API 抓一次或手工收集），作为 preset entries 随包发布；同一时刻仅渲染当前激活的一个背景，其余只是代码清单、不占 GPU|
|挑选 / 切换|设置面板列表 \+ 快捷入口；点选后 postMessage 通知 iframe 切换当前 shader 并重置 iTime|
|删除|允许删除：用户库可物理删除，删除前二次确认；内置预设删除后仍可在「内置预设」中重新添加（代码随包，随时恢复）|
|粘贴 Shadertoy 网址新建|填了 API key 走官方 API 拉代码；未填 key 时给出提示并引导走粘贴代码|
|直接复制代码新建|文本域输入 → 本地解析出 image/buffer/sound 三块 → 编译校验 → 入库（失败给具体 GLSL 报错）|
|自定义备忘式名字|列表内直接改名，写入 entry\.name 并持久化|
|基础参数（透明度等）|透明度、模糊、缩放、播放速度、压暗五个滑块；缩放额外提供「适应全屏」一键按钮；存 entry 级参数，刷新后保留|
|声音与音量控制|有 sound 代码的 entry 显示「有声音」标记；默认开启声音；GainNode 音量滑块＋静音；每个背景单独记忆音量与静音状态；浏览器端先静音兜底＋「开声音」按钮|

## UI 形态与持久化

- **入口**：右下角半透明小圆钮面板（dsh\-video\-skin 风格）＋ 设置 → 通用设置一行（open\-sea\-skin 风格）；面板 z\-index 放在内核 Modal（1000）之下。

- **玻璃效果**：经 ctx\.theme\.overrideTokens\(\) 叠加语义 token（\-\-dsw\-alias\-\* 系列）；弹层、对话框保持内核原生不透明，保证文字可读。

- **持久化**：$DSH\_HOME/shader\-skin\.json 文件（Host 提供 POST/DELETE /shader\-skin/override 读写），刷新即生效；不用 localStorage（dsh\-app:// scheme 不保证可用）。

## 渲染与音频流水线

画面与声音是两条并行链路，共用一个 WebGL 上下文；512×2 音频纹理同时作为 iChannel0 供画面着色器采样。

# 实现路线图

|里程碑|内容|验证方式|
|---|---|---|
|M0 单背景跑通|bundle 骨架（cordis\.patch\.yml \+ apply）＋ index\-inject 注入 ＋ player\.html 渲染一个预设 shader|安装后完全重启，背景正常渲染、聊天 UI 可操作、无启动报错|
|M1 背景库管理|entries 数据模型、列表选择/隐藏、改名、粘贴代码入库、文件持久化|刷新后设置保留；改名/隐藏/新增生效|
|M2 音频与音量|mainSound 离屏渲染＋readPixels＋WebAudio 前瞻调度＋GainNode 音量滑块与静音；每背景记忆音量；静音兜底与声音按钮；v1 不做 iChannel0 音频可视化回馈|带音乐作品有声；音量滑块/静音即时生效；纯浏览器静音后点按钮恢复|
|M3 打磨与发布|设置 UI 完善、URL 导入（API key）、性能策略、可读性校验、README 与打包发布|在 24 个初选作品逐项过一遍；发布 npm/github 后全新环境安装验证|

# 风险与注意事项

- **GPU 负载**：预设库只是代码清单，同一时刻最多渲染当前激活的一个背景，GPU 负载等于单个激活 shader 的渲染开销。仍需 DPR 上限、帧率上限、隐藏暂停、低功耗模式，并允许一键关闭背景。

- **可读性**：背景要配合玻璃 token 保证文字对比度（dsh\-video\-skin 实测正文对比度 p5 ≥ 4\.5 达 WCAG AA）；弹层/对话框保持不透明。

- **着色器崩溃隔离**：iframe 隔离，崩溃只重启 iframe；编译失败给出「该作品需要 WebGL2 特性/代码有误」的明确提示，不拖垮主页面。

- **自动播放**：默认开启声音并按条目记忆；桌面可自动有声；浏览器端需静音兜底＋「开声音」按钮。

- **许可证**：插件本体按 MIT 发布；ShaderToy 作品默认 CC BY\-NC\-SA（非商业），不能随 MIT 公开包分发。公开版预设改为「作品清单＋用户自备 API key 一键导入」；本地构建时可用自己的 key 把 24 个作品内嵌自用。

- **API key**：官方 API 仅返回 public\+api 权限作品；key 只存本地设置，不得上传或随包分发。

- **兼容性**：少数作品用到 WebGL2 专属特性、多 pass 或外部纹理（iChannel 图片）——预设库要人工挑选纯程序化作品；运行时对多 pass 用 FBO 承接。

- **安装生效**：UI 插件装完必须完全退出并重启桌面；桌面端存储用文件（dsh\-app:// scheme 下 localStorage 不保证）。

- **版本锚点**：open\-sea\-skin 验证于 Harness 0\.1\.2\-alpha\.3；当前 0\.2\.x 接口仍在演进，开发时以最新源码与官方文档为准，重要挂载点做版本探测。

# 附录 A：你的 24 项初选清单与声音标注

声音/交互标注来自你的挑选备注，作品实际结构以 Shadertoy 页面为准（标题未逐条核验）。

|序号|作品（ShaderToy）|你的备注|声音 / 交互|
|---|---|---|---|
|1|[Ms2SD1](https://www.shadertoy.com/view/Ms2SD1)|海浪|无|
|2|[fXc3RB](https://www.shadertoy.com/view/fXc3RB)|黑白摩托车，带音乐|有声音|
|3|[sf23W1](https://www.shadertoy.com/view/sf23W1)|造山|无|
|4|[XslGRr](https://www.shadertoy.com/view/XslGRr)|云海|无|
|5|[MdXyzX](https://www.shadertoy.com/view/MdXyzX)|更 Q 弹的海水|无|
|6|[WfcGWj](https://www.shadertoy.com/view/WfcGWj)|类似洞穴，带阴森音乐|有声音|
|7|[XtlSD7](https://www.shadertoy.com/view/XtlSD7)|马里奥，带音乐|有声音|
|8|[XsBXWt](https://www.shadertoy.com/view/XsBXWt)|扭曲的前进，带电子乐|有声音|
|9|[fXdXR7](https://www.shadertoy.com/view/fXdXR7)|Never Gonna Give You Up，带音乐|有声音|
|10|[4djSRW](https://www.shadertoy.com/view/4djSRW)|无信号画面，带音乐|有声音|
|11|[fXyGRy](https://www.shadertoy.com/view/fXyGRy)|3D 演奏，带音乐；考虑换"肥鱼"建模＋自制音乐|有声音|
|12|[NfGGWw](https://www.shadertoy.com/view/NfGGWw)|赛车画面，带音乐|有声音|
|13|[ltB3zD](https://www.shadertoy.com/view/ltB3zD)|信号干扰，带音乐|有声音|
|14|[Xsd3zf](https://www.shadertoy.com/view/Xsd3zf)|冰雪花|无|
|15|[4dfXWj](https://www.shadertoy.com/view/4dfXWj)|马里奥音乐，静态背景|有声音|
|16|[ssjyWc](https://www.shadertoy.com/view/ssjyWc)|诡异的扭动线条|无|
|17|[ltffzl](https://www.shadertoy.com/view/ltffzl)|下雨的窗户|无|
|18|[MtcGDH](https://www.shadertoy.com/view/MtcGDH)|我的世界（Minecraft 风格），能移动|交互（iMouse/键盘）|
|19|[tdjyzz](https://www.shadertoy.com/view/tdjyzz)|有日夜变化的草地大树背景|无|
|20|[Xs2fWD](https://www.shadertoy.com/view/Xs2fWD)|类元气骑士小游戏|交互（iMouse/键盘）|
|21|[lsfXz4](https://www.shadertoy.com/view/lsfXz4)|滚动的弹球|无|
|22|[Xds3zN](https://www.shadertoy.com/view/Xds3zN)|3D 旋转图形|无|
|23|[tlVGDt](https://www.shadertoy.com/view/tlVGDt)|动态背景|无|
|24|[lsl3RH](https://www.shadertoy.com/view/lsl3RH)|动态背景|无|

# 附录 B：参考来源

- [DeepSeek Harness 官方文档](https://deepseek-harness.github.io/deepseek-harness/)（Cordis 入门、Cordis 教程、架构参考：Profile/组合包、桌面应用、扩展点映射）

- [deepseek\-ai/deepseek\-harness GitHub](http://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/README.md)

- [dsh\-video\-skin（Something11235）](https://raw.githubusercontent.com/Something11235/dsh-video-skin/HEAD/README.md)：index\-inject 机制、注入红线、自动播放双轨、对比度实测

- [open\-sea\-skin（d\-dev0101）架构文档](https://raw.githubusercontent.com/d-dev0101/open-sea-skin/HEAD/docs/architecture.md)：shell\.background 原生路线、质量策略、安全策略

- [DSH Plugins 主题分类](https://www.dshplugin.store/category/theme)、[Awesome DSH Plugin 主题列表](https://awesome-dsh-plugin.com/zh/theme/)：同类插件生态

- [ShaderToy 官网](https://www.shadertoy.com/)（作品、官方 API、myapps 创建 key）；[shadertoy\-api（PyPI）](https://pypi.org/project/shadertoy-api/1.0.1/)

- [WebGL2 Shadertoy 教程（WebGL2 Fundamentals）](https://webgl2fundamentals.org/webgl/lessons/ru/webgl-shadertoy.html)：标准 uniform 清单

- npm：shadertoy\-renderer、@modelcontextprotocol/server\-shadertoy（基于 ShaderToyLite）、audio\-shader、shader\-doodle

- [openDAW Shadertoy Visualizer 手册](https://opendaw.studio/manuals/shadertoy)：音频纹理 512×2 布局

- [dsh Plugin Ground Truth](https://raw.githubusercontent.com/alextangson/dsh-dispatch/HEAD/docs/dsh-plugin-groundtruth.md)：插件 anatomy、事件与服务细节

> （注：部分内容由豆包工作 AI 生成）
