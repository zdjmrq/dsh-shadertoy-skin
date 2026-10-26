# 03 · 方案文档外部断言核验（生态 / ShaderToy / 许可证）

核验对象：`dsh 桌面版 ShaderToy 实时背景皮肤插件实现方案.md`（下称「方案」）。
方法：逐条抽出可外部核验的断言，抓原始页面（GitHub raw / npm registry / 站点 / 第三方文档）比对。
判定口径：**真** = 抓到原文一致；**部分真** = 抓到的原文与方案略有出入或需限定条件；**假** = 抓到原文明确相反；**未核验** = 抓不到（附原因，不推测填空）。

## 0. 本轮的工具限制（影响结论可信度，先说明）

- `web_fetch` 在本会话不可用（工具端点返回 HTTP 404，non-retryable），全程改用 `web_search` + `curl`（经本机系统代理 `127.0.0.1:7897`）直取原始文件。
- **`shadertoy.com` 对本机出口 IP 一律 403**（`Server: cloudflare`，body 恒为 11 字节 `Bad request`）：`/api/v1/shaders/Ms2SD1`、`/view/ltffzl`、`/browse` 三种路径、补全浏览器请求头后仍全部 403。因此**「作品是否存在 / 是否多 pass / 是否有 sound pass / 单作品许可证」无法直连核验**，只能用第三方引用旁证。
- 因此第 5 节（24 作品）与许可证细节属**抽样 + 旁证**，存在抽样偏差；`shadertoy.com/terms` 正文只拿到搜索引擎摘录，未拿到全文。

## 1. 同类插件是否真实存在

| 断言 | 判定 | 证据 / 原因 | 对决策的影响 |
|---|---|---|---|
| `dsh-video-skin`（Something11235）存在 | 真 | [README](https://github.com/Something11235/dsh-video-skin) 抓取成功（13.6KB）；npm `dsh-video-skin@0.1.5` license=MIT、dependencies 为空 | 可作为核心先例 |
| 同上：零依赖、可在「设置→插件→添加插件」安装、桌面+网页通用 | 真 | README 原文「Zero dependencies…host half imports only `node:` builtins」；npm 无依赖；安装串 `dsh-video-skin@0.1.5` | 方案「推荐范式」成立 |
| 同上：MIT | 真 | npm registry license=MIT；README §License | 可留 |
| 同上：用 `webserver/index-inject` 注入 `position:fixed; z-index:-1` 的 body 首子节点 | 真 | README §How it is wired 原文即 `ctx.on('webserver/index-inject', …)` + 三条约束 | **注入机制可信，M0 可照做** |
| 同上：三条红线（禁 `script-src` / apply() 内同步注册 / 挂 body 不挂 #root） | 真 | README 逐字对应「each one was paid for」三条 | 红线必须写进实现规范 |
| 同上：自动播放双轨（Electron 无 autoplayPolicy 限制；浏览器静音兜底 + 独立「开声音」按钮） | 真 | README §Sound 原文；desktop 未设 `webPreferences.autoplayPolicy` | C7 决策有实证支撑 |
| 同上：持久化走 `$DSH_HOME/*.json` + `POST/DELETE /…/override`；`dsh-app://` 下 localStorage 不保证 | 真 | README §Tuning it in the UI 原文 | 方案「持久化」一节可保留 |
| 同上：控件 `z-index:900`，低于内核 Modal(1000) | 真 | README 原文 | 可留 |
| 同上：正文对比度「p5 ≥ 4.5 达 WCAG AA」 | 部分真 | README 实测：默认参数 dark p5=6.86 / light p5=7.90；但同表 min 低至 1.22、light 极端档 p5 4.52 | 别当成保证值；写成「默认参数下 p5 ≈ 6.9」 |
| 同上：渲染器放进同源 iframe 隔离崩溃 | **假** | README 全文无 iframe：背景是 `position:fixed` 的 `<video>` 元素 | 这句是方案自己的设计，不能写成 video-skin 的做法 |
| `open-sea-skin`（d-dev0101）存在、实时 WebGPU 海洋 | 真 | [architecture.md](https://github.com/d-dev0101/open-sea-skin/blob/HEAD/docs/architecture.md) 原文：WebGPU + five Gerstner waves…；npm `open-sea-skin@1.2.6` MIT（与本机已装版本一致） | 可作视觉与质量策略参考 |
| 同上：原生路线靠 `shell.background` slot、需安装脚本改源码、不能独立安装 | 真 | 架构文档原文「adds a frame-owned `shell.background` slot」+ `install-into-harness.sh` copies the package into a source checkout | 方案路线 A 的「否，需改源码」判断正确 |
| 同上：零依赖 | **假** | 架构文档：WebGPU + **three.js 0.178.0 + TSL**，模块全部本地打包（"All three.js modules…are local"） | 别把 open-sea-skin 当零依赖样板 |
| 同上：验证于 Harness `0.1.2-alpha.3` | 真 | 架构文档 Compatibility 节逐字一致（commit dd6322d60, 2026-08-31） | 「版本锚点」可留 |
| 同上：DPR 上限 1.5 / 自适应渲染缩放 0.5–1.0 / 隐藏页暂停 / 帧率上限 / 低功耗 | 真 | 同上 §Renderer and quality policy 原文 | 「性能策略照抄」成立 |
| `dsh-wallpaper-engine`（elysia395）存在，实时 WebGL 壁纸 | 真 | [README](https://github.com/elysia395/dsh-wallpaper-engine) + `package.json`：npm `dsh-plugin-wallpaper-engine@1.4.0`，license **MIT**，把 Wallpaper Engine 的 Scene/Web/Video 壁纸搬进 DSH，Scene 由内置 MIT 引擎 **WebWallGL** 实时 WebGL 渲染 | 本项目最贴近的先例（同为 GLSL 实时壁纸） |
| 同上：走 `index-inject` 覆盖层 | **假** | `package.json` 声明 `dsh.client{platform:"web", immediately:true}`（官方 client 插件）；依赖 `webwallgl`、`x11`；README 中 index-inject 出现 0 次 | 见下方「路线 B 判断错误」 |
| `dsh-bg-new`（sz1698）存在 | 真 | [README](https://github.com/sz1698/dsh-bg-new) + `package.json@0.7.0` license **MIT**，五种背景（预设/纯色/渐变/图片/视频）+ 毛玻璃 | 可作功能面参考 |
| 同上：走 `index-inject` 覆盖层 | **假** | `dsh.client{platform:"web"}` + `exports["./client"]`；`lib/index.js`（45KB）中 `index-inject` 出现 **0** 次，仅 `ctx.inject(["webServer"])` + `ctx.webServer.register` | 同上 |
| 方案路线表：「B 类 = dsh-video-skin、dsh-bg-new **等大量壁纸插件**都走 index-inject」 | **假** | 四个被点名的插件里只有 dsh-video-skin 用 index-inject；wallpaper-engine、bg-new 都是官方 client 插件；open-sea-skin 是改源码 | **路线 A/B/C 三分法失真，需重写为「官方 client 插件 / index-inject / 改源码」三条** |

> 补充（本轮新发现，方案未提）：`dsh-shader-workbench`（[Moolight](https://github.com/Moolight/dsh-shader-workbench)）已存在，MIT、零第三方运行时依赖、纯 WebGL2、**Shadertoy 兼容预览 + 热重载 + 贴 `mainImage()` 直接变节点**，且自称有用例覆盖「真机 WebGL2 编译校验、GPU 像素回读、1080p 性能度量」。这是「几百行自研 mini runtime」这条结论最强的现实旁证，也是潜在的重叠竞品，方案应引用。

## 2. 生态数据

| 断言 | 判定 | 证据 / 原因 | 影响 |
|---|---|---|---|
| 「274+ 主题/外观插件」 | 真 | [awesome-dsh-plugin.com/zh/theme/](https://awesome-dsh-plugin.com/zh/theme/) `<title>主题与外观 — 274 个 dsh 插件</title>` | 数字可留，需标出处与日期 |
| 「900+ 主题/皮肤插件」 | 部分真 | [dshplugin.store/category/theme](https://www.dshplugin.store/category/theme) 结构化数据 `"numberOfItems":945`。与 274 不同源、不同分类口径，**不可相加** | 两句并排会让读者以为是同一口径，建议只留一个并注明来源 |
| `dshplugin.store` 站点存在 | 真 | HTTP 200，主题分类 158KB 页面 | 可留 |
| `awesome-dsh-plugin` 站点存在 | 真 | HTTP 200；全站自称 6896 插件（另：其仓库 `categories/themes-appearance.md` 自称 **476** 个，与站上 274 又不同，站点/仓库快照不一致） | 引用时写明抓取日期 |
| 「open-sea-skin、dsh-wallpaper-engine **已在运行**」 | **假** | open-sea-skin 本机确实已装（`~/.dsh/profiles/desktop/node_modules`，1.2.6）；**未找到 wallpaper-engine 的安装痕迹**，只在 npm/Store 存在 | 「已在运行」是幻觉式措辞，删 |

## 3. ShaderToy 官方 API / embed

| 断言 | 判定 | 证据 / 原因 | 影响 |
|---|---|---|---|
| `GET /api/v1/shaders/{id}?key=…` 存在 | 真（间接） | 本机 403 不能直连；[shadertoy_api](https://github.com/ivoleitao/shadertoy_api) README 明确「REST interfaces defined in the Shadertoy howto (`shadertoy.com/howto#q2`)」，key 在 `shadertoy.com/myapps` 创建，再补上线上第三方客户端事实存在 | 「粘贴网址导入」路径成立 |
| 无 key 返回 403 | 真（实测） | `curl https://www.shadertoy.com/api/v1/shaders/Ms2SD1` → **403**，body `Bad request`（11B）；带伪 key 同样 403 | 方案这句实测结论准确，可留 |
| 仅返回 `public+api` 权限作品 | 真 | shadertoy_api README 原文「browse shaders available with `public+api` privacy settings」 | 预设可用率会打折 |
| 返回结构含 `Shader` / `info` / `renderpass[]`（code 字段） | 真 | Rust crate 类型定义 [`Shader{ver, info, renderpass}`](https://docs.rs/crate/shadertoy/0.3.0/source/src/types.rs)；Dart 侧同名结构 | 解析器按此实现 |
| API 有调用上限 | 部分核验 | shadertoy_api README：「the number of operations available with this API are **limited**」。第三方 skill 提到「monthly budget」，未拿到官方原文 | 构建期批量拉 24 个要限速重试，别当无限 |
| `/embed/{id}` 存在且可第三方嵌入 | 真 | 官方形态 `shadertoy.com/embed/{ID}?gui=true&t=10&paused=true&muted=false` + `allowfullscreen`（[shadertoyunofficial 存档](https://web.archive.org/web/20190514044739/https://shadertoyunofficial.wordpress.com/2018/02/17/embedding-shadertoys-in-website/)、[abznak 博客](https://blog.abznak.com/2016/07/embedding-shadertoy-shaders-in-web-pages.html)）；AutoWall 项目即以 `/embed/` 替换 `/view/` 做全屏壁纸 | embed 兜底可用；`muted` 是官方参数，方案说「跨域无法控制音量」**存疑** |
| embed「背景不透明、无法控制参数」 | 未核验 | 无直连页面可查（403）；`?t=`/`?paused=`/`?muted=` 参数已证存在，`gui` 可关 | 保留为「待实测」，不要写成结论 |

## 4. 许可证

| 断言 | 判定 | 证据 / 原因 | 影响 |
|---|---|---|---|
| 「ShaderToy 作品默认 CC BY-NC-SA 3.0」 | 真（作为**默认值**） | [shadertoy.com/terms](https://www.shadertoy.com/terms) 摘录：「All the shaders you create…are owned by you. **You decide which license applies**…if you don't place a license on a shader, it will be protected by our **default license**」；默认即 CC BY-NC-SA 3.0（多处移植项目引 terms 原文） | 方向对，但必须补「默认」限定 |
| 「ShaderToy 作品（全部）默认 CC BY-NC-SA」 | 部分真 → 措辞需改 | 同上：作者可选，页面上确实存在标 CC0 / MIT / 自定义的作品 | 写成「未声明时默认 CC BY-NC-SA」；**逐个作品查许可证** |
| 「不能随 MIT 公开包分发」 | 真（对 NC/未声明作品成立） | CC BY-NC-SA 的 NC 限制商用、SA 要求衍生同协议，与 MIT 授权合并即冲突 | 结论成立，可保留 |
| 「公开版 = 作品清单 + 用户自备 API key 一键导入」 | 部分真（可行但有限制） | 可行；但只覆盖 `public+api` 作品、key 属用户个人 app（不应随包/上传）、API 有调用上限；且该做法**不构成对 NC 作品的再分发**（用户自己取），法律面比内置干净 | 建议作为公开版默认方案，但要写清三个限制 |
| 「只内置自写 shader / 用 CC0·MIT 授权作品」 | 真（方向正确） | 与上述条款一致；生态里已有 MIT 的 shader 插件先例（dsh-shader-workbench 自带示例） | 空预设占位就用自写 shader |

## 5. 24 个作品（抽样，有偏差）

本地无法访问 shadertoy.com，故只能靠第三方引用旁证；**「是否单 pass / 是否有 sound pass」本轮全部未核验**。

| 断言 | 判定 | 证据 / 原因 | 影响 |
|---|---|---|---|
| 附录 A 共 24 条 | 真 | 表内序号 1–24 完整 | 「24 个预设」数字可用 |
| `Ms2SD1` = 海浪 | 真（旁证） | 多篇移植文章把它作海面/Seascape 参考（CSDN《ShaderLab:海面》等） | 备注可信度尚可 |
| `XslGRr` = 云海 | 真（旁证） | 第三方 shadertoy 清单标注 `XslGRr — Clouds` | 同上 |
| `ltffzl` = 下雨的窗户 | 真（旁证） | 通称 **Heartfelt**（BigWings），多项目移植为「雨滴玻璃」（par-term `rain.glsl`、AGSL 文档） | 同上 |
| `Xds3zN` = 3D 旋转图形 | 部分真 | 实为 iq 的 **Raymarching - Primitives**（图元演示，会旋转）；ID 真，备注是外观描述 | 备注可改成「光线步进图元」 |
| `fXc3RB` = 黑白摩托车，带音乐 | 未核验 | 仅一条带 audio 标签的聚合页出现过该链接；无标题/内容证据 | 上线前人工点开确认 |
| `ssjyWc` = 诡异扭动线条 | 未核验 | 多种检索零命中 | 同上，且它也可能是 404 |
| 「24 个基本都是纯程序化单 pass」 | 未核验 | 无法查 pass 数；已知列表里含交互类（MtcGDH/Xs2fWD）与至少一个可能的键盘输入作品 | 方案附录自己已注明「标题未逐条核验」，保持这个诚实标注，别在摘要里断言 |
| 声音 / 交互标注列 | 未核验 | 无 sound pass 证据链 | 一律标「待验证」，M2 前用一个真实带音乐作品验证整条音频链路 |

## 6. 网页壁纸性能先例

| 断言 | 判定 | 证据 / 原因 | 影响 |
|---|---|---|---|
| Lively Wallpaper：WebView2/Chromium 渲染 web·视频·着色器壁纸，全屏应用时暂停（≈0% CPU/GPU）、可配电池暂停 | 真 | [官网 FAQ](https://livelywallpaper.app/faq/)、[DeepWiki 性能管理](https://deepwiki.com/rocksdanister/lively/6-performance-management) | 「隐藏/失焦暂停」有成熟先例；但它靠**全屏窗口检测**，本地背景层没有这个信号 → 只能退回 document.hidden + 失焦降帧 |
| Plash（sindresorhus）把任意网页当 macOS 壁纸 | 真 | [github.com/sindresorhus/Plash](https://github.com/sindresorhus/Plash)，~3.4k stars | 仅作「iframe/webview 承载」的旁证，方案已排除 macOS 场景 |
| Shadertoy 已有人拿来做壁纸 | 真 | AutoWall issue #13：Lively 直接吃 `shadertoy.com/view/...`，改成 `/embed/` 即全屏 | 说明 embed 路线现实可行 |
| 更贴近的生态先例（方案未引） | 真 | open-sea-skin 质量策略（DPR 1.5、0.5–1.0 自适应缩放、低功耗适配、`prefers-reduced-motion` 降到 ~20FPS）；dsh-wallpaper-engine 用 WebWallGL + 帧率控制 + 与模态层共存的 `docs/COEXISTENCE.md` | 比 Lively/Plash 更值得抄，建议替换引用 |

## 7. 附录 B 参考来源实测

| 断言 | 判定 | 证据 |
|---|---|---|
| `deepseek-harness.github.io` 官方文档站存在 | 真 | HTTP 200（57KB） |
| `raw…/deepseek-ai/deepseek-harness/master/README.md` 存在 | 真 | HTTP 200 |
| `alextangson/dsh-dispatch` 的 `dsh-plugin-groundtruth.md` 存在 | 真 | HTTP 200（50.6KB） |
| npm `shadertoy-renderer` / `@modelcontextprotocol/server-shadertoy` / `audio-shader` / `shader-doodle` 存在 | 真 | registry：1.1.0 / 2.0.3 / 1.2.4 / 0.0.5，均 MIT |
| npm `webwallgl`（wallpaper-engine 的渲染引擎） | 真 | 3.0.0，MIT |
| 「ShaderToyLite 被 server-shadertoy 采用」 | 未核验 | 包存在，但未读其依赖声明 |
| `glslCanvas` 存在 | 未核验 | 本轮未抓（不影响结论，只是候选库） |
| 「社区有 Tauri 壳打包（dsharness.app 等）」 | 部分核验 | `dsharness.app` 存在（标题 `DSH Desktop`，跳转 `/en/`），但**未证实是 Tauri** | 
| 「dsh-video-skin 已验证对比度 / open-sea-skin 已有 extension+static 三形态」 | 真 | 两 README 均有对应小节 |

## 8. 结论与建议

### 可以直接留作参考（证据充分）
1. **dsh-video-skin 的注入机制与三条红线**——这是全文最有价值的部分，逐字有据，且是本项目唯一的 installable 注入先例。方案 §背景、§cordis 插件、§红线 可原文保留（补一个 GitHub 链接与版本 v0.1.5）。
2. **open-sea-skin 的质量策略与版本锚点**——DPR 1.5 / 自适应缩放 / 隐藏暂停 / 低功耗 / 锁定 0.1.2-alpha.3，原文一致。
3. **ShaderToy API 的形态与无 key 403**——实测复现；返回结构 `Shader{ver,info,renderpass}` 并可用。
4. **许可证「默认 CC BY-NC-SA 3.0 → 不能随 MIT 包分发」**——结论成立。
5. **Lively / Plash 作为长期存在的旁证**、npm 上 4 个 shader 库真实存在、两个生态站点真实存在。

### 必须从方案里删掉或改写（已证伪 / 无据）
1. **「dsh-bg-new、dsh-wallpaper-engine 等大量壁纸插件走 index-inject」**——两者都是官方 `dsh.client` 插件，源码里 `index-inject` 出现 0 次。路线表要重写成三分法：
   - 官方 client 插件（`dsh.client` + slots + `webServer.register`）→ bg-new / wallpaper-engine / open-sea-skin 原生包
   - `webserver/index-inject` 内联脚本覆盖层 → 仅 video-skin 一例
   - 改源码加 slot → open-sea-skin 安装脚本（需 recompile client plugin）
   → **这直接影响 M0 技术选型**：client 插件是主流，能拿到 slot 与 settings UI，不必依赖注入红线；注入更适合「零构建、单文件」的轻量方案。建议把「client 插件 vs index-inject」列为待决策项，而不是已定案。
2. **「open-sea-skin 零依赖」**——three.js 0.178 + TSL 全量内置，删。
3. **「dsh-video-skin 用 iframe 隔离渲染器」**——它是 `<video>`，没有 iframe。改成「本项目拟用 iframe」。
4. **「正文对比度 p5 ≥ 4.5 达 WCAG AA」**——实际默认值 p5 6.86/7.90，但实测表里 min 到 1.22。改为「默认参数下 p5≈6.9，需按我们的背景逐张实测」。
5. **「open-sea-skin / dsh-wallpaper-engine 已在运行」**——只有 open-sea-skin 在本机；删掉「已在运行」。
6. **「900+ 主题/皮肤插件」与「274+」并列**——两个数字来源不同口径、不可相加；只留一个 + 出处 + 抓取日期。
7. **摘要里「24 个初选作品基本都是纯程序化单 pass」**——无任何核验手段，且名单里含交互类作品。降级为「待逐条核验」。
8. **embed「跨域无法控制音量与参数、背景不透明」**——`muted/t/paused/gui` 参数已证存在，这句要么删，要么标「待实测」。

### 许可证合规建议（内置预设 vs 清单+key）
- **公开版（MIT 发布）：不要内置任何 Shadertoy 作品代码**，含 CC BY-NC-SA 与「未声明（=默认 NC-SA）」的。可行组合：
  a. 内置 **自写 shader** 若干（MIT，随包）；b. 内置 **作者显式标注 CC0/MIT/Apache** 的作品（逐作品查页面许可证并留档截图）；c. 其余走「清单 + 用户自备 key 一键导入」。
- **「清单 + 用户 key 导入」不是免死金牌**：只覆盖 `public+api` 作品；key 是用户个人 app key，不得随包/上传/写进日志；API 有调用上限，需限速与缓存；用户导入后本地缓存的作品仍受原作者许可证约束（界面上要展示原作品链接/作者/许可证，并禁止二次分发）。
- **自用版（内嵌 24 个）也建议保留出处元数据**（作者、url、license 字段留空并提示用户确认），避免将来开源时把 NC 代码带出去。
- **合规的「零法律风险预览」路径是 `/embed/{id}` iframe**：不复制代码、不打包，转发官方播放器；代价是音量/参数控制受限（待实测），可作为「未取得授权的作品」的只读预览模式。
- 落地顺序建议：M0/M1 全部用自写 shader；M2 用一个**确认带 sound pass 且许可证允许**的作品验证音频链路；M3 再决定是否提供 key 导入。

### 抽样偏差声明
第 5 节 6/24 抽样、且全部依赖第三方引用；`fXc3RB`、`ssjyWc` 零证据，`MtcGDH`/`Xs2fWD` 等交互类未查。「24 个预设」这个数字本身成立，但**「24 个都能跑、都有正确的声音标注」尚未被任何证据支持**，M3 验收必须人工逐条过。
