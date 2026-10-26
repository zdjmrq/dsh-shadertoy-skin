# 01 · DSH 插件机制真实 API 面（0.2.1-rc.3 / 官方 Electron 桌面版）

> 结论标注：**[核验]** = 有源码/实测证据；**[推断]** = 由证据链推出、无直接运行验证；**[未知]** = 未查清。
> 证据缩写：`WEBSERVER`=`app.asar/dsh/node_modules/@deepseek-ai/dsh-host-webserver/lib/index.js`；`MAIN`=`app.asar/lib/main.js`；`FRONT`=`app.asar/dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-BXV-oxvX.js`（压缩单行，按函数名引用）；`CM`=…/`dsh-client-modules/lib/index.js`，`CM-C`=…/`lib/client.js`；其余写包名+文件。
> **取材局限**：本会话 `cordis_inspect_query` 的 client 平台（Theme/Slots/Service）连续 5 次 10s 超时（页面未连到本会话），因此 client 侧结论全部改用**安装包源码**（比 inspect 更硬）。Host 侧 inspect 正常（`webserver/index-inject`、`webServer`、`clientModules`、`storageDomain`、`settings`、`hmr` 均已取到 exact contract）。

---

## 1. IndexInjection 契约与 boot 时序

**类型（精确，来自 host Event `webserver/index-inject` 的 referencedTypes，与 WEBSERVER:12-99 一致）** [核验]

```ts
type IndexInjectionPlacement = 'head' | 'body'
type IndexInjection =
  | { kind: 'global';        name: string; value: unknown }            // 渲染为 head 内联 <script>globalThis[name]=…</script>
  | { kind: 'script';        placement; text: string }                 // <script>text</script>
  | { kind: 'script-src';    placement; src: string }                  // <script src="…"></script>
  | { kind: 'script-preload'; src: string }                            // <link rel="preload" as="script">
  | { kind: 'style';         text: string }                            // <style>…</style>，固定 head
  | { kind: 'html';          placement; html: string }                 // 原样插入
```

- 事件签名 `(table: IndexInjection[]): void`，mode=emit；描述原文："Emitted on every index render and every worker boot-payload request; listeners push their current rows, so a row's data is read fresh at emit time." [核验]
- 收集是**每次调用重新 emit**：`collectIndexInjections()` = 新建数组 + `ctx.emit(...)`（WEBSERVER:522-526）；`renderIndex()` 每次响应都重收（:533-535）。Web 形态里不存在"启动快照"。 [核验]

**Web 形态（浏览器）**：`renderIndexInjections` 把 head 行插在 `<head>` 开标签后、body 行插在 `<body>` 开标签后，最后追加一句 `READY_MARKUP` 解析 `__DSH_BOOT_READY__` deferred（WEBSERVER:70,79-97）；页面 entry 在读取注入状态前会 `await __DSH_BOOT_READY__.promise`（WEBSERVER:62-70 注释 + FRONT `RZ.run`）。内联行随 HTML 解析**同步执行**，`script-src` 是普通阻塞外链。 [核验]

**桌面形态（Electron）——与计划文档的"启动快照"说法部分吻合，但机制不同** [核验]
1. 桌面 index.html 是**打包静态文件**（`dsh-web-frontend/dist/index.html`），不走 `renderIndex`。shell 的 protocol handler 直接读文件，并往 `<head>` 注入 `__DSH_BOOT_READY__ = Promise.withResolvers()`（MAIN:8197-8223，尤其 :8221）；webserver 包的文档注释也自认 "Electron uses file:// plus IPC instead"（WEBSERVER:105-106）。
2. injection 表只在 **Host 进程发 `ready` 时采集一次**：`injections: ctx.webServer.collectIndexInjections()`（`dsh-desktop-host/lib/index.js:342-349`）→ 主进程存进闭包变量（MAIN:12138, 12193-12194）。
3. 每次页面加载，渲染进程通过 IPC `dsh-desktop:boot` 取**同一份快照**：返回 `{ injections, streamBaseUrl }`（MAIN:12424-12431）。→ **刷新页面不会重新收集注入行**。
4. 渲染端解释器 `UZ`（FRONT）：`global`→赋值；`script`→`createElement('script')`+textContent+append 到 head/body，**append 即同步执行**；`script-src`→**await** 动态 `<script src>` 加载，`onerror` 直接 reject；`script-preload`→**空操作**；`style`→append 到 head；`html`→`insertAdjacentHTML`。全部行应用完后才 `__DSH_BOOT_READY__.resolve()`（FRONT 桌面分支）；随后 boot 主流程 `await` 该 promise → 读 `__DSH_BOOT__` 建模块系统 → 挂载 `#root`。

**结论**：桌面内联注入 script 的执行时机是「页面 load 之后、`#root` 挂载之前，按表顺序同步执行」，不是 HTML head 解析期；placement 只决定挂到哪个父节点（style 固定 head）。整表在 boot 阶段被 await（`script-src` 参与 await，内联 script 是同步）。**一个失败的 `script-src` 会 reject boot readiness，主进程按 fatal 处理**（MAIN:12433-12438）。计划文档"必须完全重启"这一条对 **injection 行** 成立，原因不是"快照机制神秘"，而是上面第 2 步。

## 2. 安装 / 生效语义：改完代码到底怎么才能看到效果

三个事件的真实含义 [核验]

| 信号 | 含义 | 依赖 |
|---|---|---|
| `app-boot/config-reload`（`dsh-app-boot/lib/index.js:3871`） | 已把 profile patch 重新合并进**运行中的 Loader 树**，无新 inactive entry（进程不重启）。settings 服务在此清缓存（`dsh-settings/lib/index.js:336-338`） | Host HMR 在跑 |
| `clientModules.onGraphChanged`（CM:655-666,713-719） | Host 端 graph 重算（行增删 / artifact rev 变）。**Host 侧**信号；浏览器要另经传输层才知道 | `@deepseek-ai/dsh-client-hmr` |
| `plugin-manager/changed`（`dsh-plugin-manager/lib/types/index.js:974`） | 一次 manager 操作完成（profile 被改）。只用于 UI 失效刷新，**不代表浏览器已加载新代码** | — |

三条传输链 [核验]
- Host 半代码：`hmr` 服务在运行（Host inspect `hmr` 存在；`dsh-base/cordis.patch.yml:28-29` 挂载 `@deepseek-ai/dsh-hmr`），`reconcileProfile()` 会替换文件已变化的运行中插件。
- Client bundle：`dsh-client-hmr` 每 500ms stat 轮询每个 graph 行的 client bundle（`dsh-client-hmr/lib/index.js:22,79-115`），变了就 `rebuilt(id)` → SSE `/plugins/events` 推 `rebuilt`/`graph` 帧（:116-169）→ 浏览器端 `entries.reload(id,rev)` / `entries.sync(graph)` 热替换（`dsh-client-hmr/lib/client.js:269-311`、CM-C:407-461）。README 明说"普通的插件启用/停用**无需刷新页面或重启 Host**"（`dsh-client-hmr/README.md:12`）。
- index 注入行：**没有热链**。桌面快照见 §1；Web 刷新页面即可（每次响应重收）。

**开发迭代口诀（按改动类型分层）** [推断，基于上述机制]
1. 改 `player.html` / `native-dist/*` 静态资源 → 不用重启：路由是 `cache-control: no-cache`（`open-sea-skin/plugin/index.js:22-29`），重开 iframe 即可。
2. 改 client.js → 500ms 级热替换（前提：桌面 SSE 通，见下）。
3. 改 Host `index.js`（apply/路由）→ Host 模块 HMR 可能热更 apply，但**它 push 的 injection 行不会进桌面快照** → 要整机重启才能看到注入行变化。
4. 新装/新启用 bundle → Host 侧 `app-boot/config-reload` 生效；浏览器侧依赖 SSE 热加行。`dsh-client-hmr/README.md:118` 写 "Web transport only — Electron installation and backend restart handling do not use this SSE path"，所以**桌面端能否免重启看到新 client 插件，必须实测**；保守按"整机重启"。
5. 桌面 SSE 是否可用：页面 `__DSH_TRANSPORT__ = { ownsHost:true, streamBaseUrl }`，**没有 `fetch`**（FRONT 桌面分支）→ client-hmr 退回原生 `EventSource('/plugins/events')`（`client.js:288-305`）；该相对路径会落到 `dsh-app://app/plugins/events`，被 shell 转发到 Host（MAIN:12406-12413）。[推断：链路成立，未实测] 最低成本实验：在设置→插件里启用已安装但未启用的 `open-sea-skin`，看海洋是否**不重启**出现。

## 3. Client 插件（`dsh.client`）的真实能力边界

**package.json 字段只有 4 个**（`CM:62-76` 的 `parseDshClient`）[核验]：`platform`（必填 string，只有 `'web'` 会被收进表，`CM:733`）、`inject`（string[]，激活顺序）、`external`（string[]，非 baseline 运行时导入）、`immediately`（bool → boot 时预取）。**没有** `entry`、没有 HTML/脚本注入字段；client 入口固定在 `exports["./client"]`（`CM:737-746`）。

**打包/加载** [核验]：`clientModules` 通过 webServer 的 `/plugins` 前缀路由供包（`CM:202`）；URL 形如 `/plugins/??<id>/client.js,…&rev=<rev>`（combo，`CM:204-209`）或 `/plugins/<id>/<file>?rev=`（`CM:221-222`）；桌面同样走 shell 转发（MAIN:12406-12413）。**不是 ESM**：产物是脚本，执行时只调 `window.__ModuleLoader__.load({ id, factory(require){ … return module.exports } })`（模板 `templates/decoration/client.js:1-2`；`CM:17-24` 注释说明 lazy-CJS 模型）。React 从浏览器模块表 `require('react')` 取，shell 的 `staticModules` 提供 react/react-dom/cordis/zod/…（FRONT `OZ()`），**不要安装或 CDN 引入 React**；非 baseline 导入写进 `dsh.client.external`。

**能直接操作 DOM 吗**：能。client 模块跑在页面主世界，可 `document.createElement`、加 `<style>`、改 body。已安装生产先例：`open-sea-skin`（iframe `position:fixed;inset:0;z-index:0;pointer-events:none`，`document.body.insertBefore(frame, body.firstChild)`，`document.head.appendChild(style)`，按钮/面板直接 append body，`client.js:315-373,583-607`）；`dsh-better-sidebar` 大量 portal 到 `document.body`（`src/client/index.tsx:157`、`AnchoredPopover.tsx:176`）。skill 里"不要替换 app root 或往 body 追加第二个应用"（`references/ui-plugin.md:13`）、"不要在你的组件外写 DOM / append to body"（`references/practices.md:36`）是**工程规范**（别抢应用根、别做第二套 React 应用、别读别人 DOM 估位），**不是运行时限制**；一个 `pointer-events:none` 的 fixed 背景层不违反它 [推断，依据上述先例]。真正的边界是：① 不进 `#root`（React 独占，createRoot 渲染会清掉外来节点）；② 不建第二个 React root；③ 所有资源（style/iframe/监听器）用 `ctx.effect` 清理——HMR 热替换会重新执行 bundle 并 removeOwnedStyles（CM-C:497），手动节点必须自己删；④ 层叠：`#root > AppFrame` 是 `position:relative`（`ui-layout/lib/client.js:73`），背景层作为 body 更早的 positioned 子元素会先绘制。

## 4. 持久化的真实可用选项（排序）

**(a) Host 端 node:fs 写 `$DSH_HOME/shader-skin.json` + Host HTTP 路由 —— 推荐** [核验]
- Host 插件就是普通 Node ESM，可直接 `import { readFile, writeFile, rename } from 'node:fs/promises'`（open-sea-skin `plugin/index.js:6` 即如此）；`$DSH_HOME` 由宿主环境给出（默认 `~/.dsh`；解析规则 `$DSH_HOME` → `~/.dsh`，`dsh-home-paths/lib/index.js:109-111`）。写临时文件+rename 原子替换，避免半截 JSON。
- 客户端读写：Host `ctx.effect(() => ctx.webServer.register({kind:'prefix', path:'/shader-skin', handler}))`，client 用**相对页面基址** fetch；桌面下 `dsh-app://app/shader-skin/...` 被 shell 转发到 Host 同源（MAIN:12406-12413），生产先例 `dsh-better-sidebar` 的 `/sidebar/api/*`（`src/index.ts:1447-1488`）+ client `hostRouteUrl`/`hostHttpBase`（`src/client/host-route-url.ts`、`desktop-env.ts:34-57`）。**不要**用 `__DSH_TRANSPORT__.streamBaseUrl` 发 HTTP（那是 Host 真实 origin，跨源且插件路由没有 CORS 头 → 浏览器直接失败）。
- `ctx.fs` 不需要：它是抽象 FS provider（`writeText(target, content, expected?, signal?, sandboxPolicy?)`），面向工具/会话沙箱；插件写自己的配置文件用 node:fs 更直接。

**(b) `storageDomain.open(defineDomain)` —— 想 schema 校验就选它** [核验]
- KV 域：`open(spec)` → `domain.table(name).get/put/update/entries/delete`，写得进即已持久化，另有 `domain/changed` 事件。底层 json 后端 root = `$DSH_HOME/storages`（`dsh-base/cordis.patch.yml:179-188`：`root: !!js dshHomePath('storages')`；`dsh-storage-json/README.md:36-46`）。适合 entries 表 + global 参数；代价：zod/`defineDomain`、open/close 生命周期、版本迁移、仍要 HTTP 路由才能给 client。

**(c) settings 服务（`settings/document-updated` 的来源）—— 只适合少量标量** [核验]
- 只投影 Config 里标了 `.volatile()` 的字段，写入 profile 的 `cordis.patch.yml`（`dsh-settings/README.md:12,33-39`；Service：`describe/update/replace/mutate`；事件在写入后 emit，`dsh-settings/lib/index.js:435,461`）。适合 `enabled`、默认透明度这类全局标量；**不适合** 24 条背景库 + 每背景参数（会把 patch 写成大 JSON，且 UI 是自动表单）。

**(d) localStorage —— 可用，但只当缓存** [核验+推断]
- `dsh-app` 以 `{standard:true, secure:true, supportFetchAPI:true, corsEnabled:true, stream:true, codeCache:true}` 注册（MAIN:11880-11889）→ Chromium 视为安全标准源，localStorage 可用。生产插件在桌面直接用它：`open-sea-skin/plugin/client.js:562-607`；`dsh-better-sidebar/src/client/state.ts:907-1197`（每会话状态）、`DiffPane.tsx:336-347`（try/catch）。
- 风险：仅该 origin 配额（Chromium 惯例 ~5MB [推断，未实测]）；清站点数据/重置 profile 即丢；Host 读不到；不随 `$DSH_HOME` 备份。
- 结论：**背景库/每背景参数的真源 → (a)**；音量、当前选择、面板位置这类可丢状态 → localStorage 缓存或同文件里的 `transient` 段。

## 5. 主题透明化：项目生死判断

**机制** [核验]
- `theme.overrideTokens(source, tokens)`：按 source 叠一层 token 覆盖，层内按 seq 后覆盖前，返回 disposer；**值必须是 `{light,dark}` 字符串对**，传裸字符串直接抛教学错（`dsh-client-ui-theme/lib/client.js:1819-1847`，校验 :1931-1943）。
- 落到 DOM 的方式：`ui-layout` 的 `ThemePresenter.apply()` 把 `snapshot.active.tokens` 逐个 `document.body.style.setProperty(name, value)`，`theme/change` 时重放并回收旧名（`ui-layout/lib/client.js:548-569,700-710`）→ 即**内联变量**，能压过基础样式表里的 `body{--dsw-alias-…}`，但压不过 `!important`。
- 覆盖范围：overrideTokens **不限 14 个 token**（校验只查值形状）。`Theme` inspect 的 14 个内置目录是 bg-base、bg-layer-1、bg-layer-2、bg-overlay、border-l1、border-l2、brand-primary、label-primary、label-secondary、state-error/idle/success/warn-primary、specific-sidebar-fill（`ui-theme/lib/client.js:1531-1629`）。而打包 CSS 里实际有 **57 个** `--dsw-alias-*`/`--dsw-specific-*`（含 bg-layer-3/4、bg-mask-1、bg-module-platform、specific-menu、specific-input-major…），只要消费者写 `var(...)`，overrideTokens 就能命中。

**判断：可行，但"只用官方 overrideTokens"不够，必须 client 半注入 `<style>` 补丁。** 原因：① overrideTokens 只能设变量，写不了 `body{background:transparent}` 这类规则；② 覆盖不了硬编码颜色与平台壳对 frame 的单独着色（`ui-layout/lib/client.js:73`：`[data-windows-titlebar] .frame{background:var(--dsw-specific-sidebar-fill)}`、`.frame:before` 画标题栏条、`.sidebarCol` 用 specific-sidebar-fill）；③ 压不过任何 `!important`。open-sea-skin 的 `glassCss()` 就是这套补丁的完整实测样本（`open-sea-skin/plugin/client.js:96-178`）：同时压低 `body` + 9 个 token + Windows/mac 平台选择器 + `[role=dialog]/[data-shortcut-modal=settings]/alertdialog` 强制 `.97` 不透明。

**要覆盖的清单** [核验+推断]：`--dsw-alias-bg-base`、`bg-layer-1/2/3/4`、`bg-module-platform`、`bg-mask-1`、`bg-overlay`（弹层，保持≥.97）、`--dsw-specific-sidebar-fill`、`specific-menu`；再补规则让 AppFrame 的 frame/sidebarCol/centerCol/overlay 容器透明（Windows 还有 `.frame:before` 标题条、rightbar col）。**注意 `body` 本身不需要透明**：body 背景是最底层画布，我们的 fixed 背景层是它之上的 positioned 子元素；只需让 `#root` 内部表面半透明即可。

**坑**：a) 多层半透明叠加会变暗（必须一起透明，否则侧栏/中栏深浅不一）；b) light/dark 两套都要给；c) `[data-platform=darwin] .frame{background:0 0}` 本来就透明，别重复叠；d) 弹层/设置模态必须回不透明，否则正文可读性直接崩；e) `:has()` 锚定整树在流式渲染下很贵——better-sidebar 明确弃用并改 `#root [data-dsh-center-col]` 单节点标记（`dsh-better-sidebar/src/client/layout.css` 注释）；f) open-sea-skin 里 `--dsw-alias-bg-multi-select`、`--dsw-specific-selector`、`.dshDesktopFrame/.dshDesktopSidebarSurface/[data-dsh-desktop-mode]` 在本版**不存在**（asar 内 grep 无命中，57 token 表里也没有）→ 属别的桌面壳/旧版残留，照抄是无效规则。

## 6. 设置 UI 的真实挂载点

模板/宿主声明的 slot 目录（`ui-layout/lib/client.js:623-653`；settings 页 `ui-settings-general/lib/client.js:1240-1273`）[核验]

| 槽位 | kind/scope | 用途 | 注册形态与 props |
|---|---|---|---|
| `settings.section` | list / root | 设置页一个完整分类页（左侧导航项） | `{name,id,order,label:()=>string,locale}`；渲染 props `{close}`（`ui-settings-general:337`） |
| `settings.general.item` | list / root | 通用设置页里的一行 | `{name,id,order,label,locale}`；props `{}`（`ui-settings-general:638`） |
| `settings.plugins.tab` | list / root | 设置→插件里的子 tab（由 `ui-settings-plugins` 声明，`:201-212`） | `{name,id,order,label}` |
| `plugins.bundle.config` | keyed / root | 插件管理器中某 bundle 的配置页，`key`=包名，props `{view:'page'}`+`entryKey`（`ui-plugin-manager/lib/client.js:4440-4459,2964`） | `{name, id, key, ...}` |

通用注册 API：`ctx.slots.inject(ownerSlotKey, () => ctx.slots.register({ name, id, order, label, locale, inject, key, children }, Component))`；`label` 是返回已翻译文本的函数；`inject` 函数返回附加 props（生产例 `dsh-better-sidebar/src/client/index.tsx:458-464`：`inject: () => ({store, service})`）；需要子槽就在 `children` 里声明 `{kind,scope}`。client 模块 `exports.inject = ['slots','theme','locale']` 这样的服务依赖。

**推荐**：主界面挂 `settings.section`（一页容纳 背景库列表 + 5 个滑块 + 音量/静音 + 启用开关），`settings.general.item` 再加一行"启用 Shader 背景"；即时调参保留播放器内悬浮面板（DOM，open-sea-skin 风格）。`plugins.bundle.config` 只适合"插件自身配置页"，要先进插件管理器点开，不适合当主入口。

与 Host 通信：client 相对路径 `fetch('shader-skin/store')` → Host `webServer` 路由（桌面同源转发，见 §4a）。不要引用 Harness Client 包（`practices.md:35`），控件自己写、用 `--dsw-alias-*`。

最小注册形态（示意、未编译）：

```js
// client.js 内 exports.apply(ctx)
ctx.slots.inject('settings.section', () => ctx.slots.register({
  name: 'settings.section',
  id: 'shader-skin',
  order: 50,
  label: () => 'Shader 背景',
  locale: 'shader-skin',
}, ShaderSkinSection))          // 组件内 fetch('shader-skin/store') 读写

ctx.slots.inject('settings.general.item', () => ctx.slots.register({
  name: 'settings.general.item', id: 'shader-skin-toggle', order: 50,
}, EnableRow))
```

## 7. bundle 最小骨架

模板已在 asar 内读毕并**原样复制到工作区**：`docs/research/templates/decoration/`（`package.json`、`index.js`、`client.js`、`cordis.patch.yml`、`locale/en.json`、`icon.svg`）。文件→作用→关键字段：

| 文件 | 作用 | 关键字段 | 来源 |
|---|---|---|---|
| `package.json` | 安装清单 | `exports["./client"]`、`dsh.bundle.patch`、`dsh.client{platform:'web',inject:[],immediately?}`、`files`（含 locale/icon） | 模板原文（`templates/decoration/package.json:6-20`）；`manifestVersion:1` 见 better-sidebar，是否必需 [未知] |
| `cordis.patch.yml` | 插入 Loader 行 | `- insert: - id: <row>; name: <pkg>`（可带 `config`） | 模板原文（:1-3） |
| `index.js`（Host） | Host 半 | `export const name`；`export const inject=['webServer']`；`export function apply(ctx)`；路由/文件/数据都挂 `ctx.effect` 返回清理 | 模板只有空 apply；真实参考 `open-sea-skin/plugin/index.js:10-11,73-79` |
| `client.js`（Client） | 浏览器半 | `window.__ModuleLoader__.load({id, factory:(require)=>{…; exports.name/inject/apply; return module.exports}})` | 模板原文（:1-22）；DOM/持久化/清理参考 open-sea-skin client.js:583-607 |
| `locale/*.json` | Plugin Manager 显示名 | `meta.title`/`meta.description`（多语言各一份） | 模板原文（`locale/en.json:2-5`）+ `references/host-plugin.md:31-53` |
| `icon.svg` | 插件图标 | ≤256KiB，包内路径 | 模板原文 |
| `native-dist/skin.html` 等 | 渲染器（WebGL2 + audio），由 Host 路由供 | iframe 同源隔离，`postMessage` 传参 | **需我们补**（open-sea-skin 同构） |

我们的建议结构：Host 半 = `inject=['webServer']` + `/shader-skin` 静态（skin.html/player.js）+ `/shader-skin/store` 读写 JSON；Client 半 = 建 fixed `pointer-events:none` iframe 作为 body 首子元素 + 注入玻璃 `<style>` + 悬浮面板 + `settings.section` 注册；**尽量不写 index-inject 行**（否则每次改动都要整机重启，§1/§2），只有"必须早于首帧生效"的样式才考虑 `kind:'style'` 注入。**需补**：数据模型、GLSL 运行时、音频、locale 文案、指标/降级。

## 8. 三条"红线"逐条判决

1. **"不能用 `kind:'script-src'`" —— 半假。** 框架自己就用它注入 bootstrap 批（`CM:494-498`）。真实风险在桌面解释器：`script-src` 被 **await** 动态加载，一个 404/拒绝就让 boot readiness reject → 主进程 fatal（FRONT `UZ`；MAIN:12433-12438）。内联 `script` 不会"加载失败"（它抛异常只是 uncaught，不阻断 boot）。→ 正确表述：script-src 可用，但任何失败都是启动级事故；注入脚本内容优先内联。
2. **"注入监听器必须在 apply() 里同步注册" —— 条件成立。** 桌面 injection 表只在 Host `ready` 时 collect 一次（`dsh-desktop-host/lib/index.js:346`），那之后才注册的监听器**本次会话任何页面加载都看不到**；Web 端每次 index 响应重新 emit（WEBSERVER:522-535），晚注册只影响注册前后的刷新。`export const inject=['webServer']` 本身不致命（webServer 在 ready 前已就绪）[推断]；致命的是 apply 里 `await`/延迟注册 `ctx.on`。
3. **"背景层必须挂 body 首子节点（否则破坏启动 DOM 水合）" —— 做法对，理由是错的。** `#root` 是空 div + 客户端 createRoot 渲染（`index.html` 只有 `<div id="root">`，FRONT 用 createRoot，不是 hydrate）→ 不存在水合。真实原因：① `#root` 归 React 独占，塞进去会被清掉/不一致；② 层叠——body 里更早的 positioned 元素先绘制，`#root > .frame`（position:relative）后绘制覆盖它（`ui-layout/lib/client.js:73`）。open-sea-skin 就是 `body.insertBefore(frame, body.firstChild)`（`client.js:331`）。关键是"在 #root 之外 + 层叠正确"，首子节点只是最简单满足条件的位置。

---

## 给决策者的 5 条要点

1. **硬约束**：桌面版的 index 注入行是 **Host 启动时的一次性快照**，改注入行/新增注入行必须整机重启；这不是"文档迷信"，是 `desktop-host:346 → MAIN:12138,12406-12431` 的代码事实。→ 背景层请走 **client 半 DOM**（HMR 可见），别把 index-inject 当设置/热更通道。
2. **硬约束**：`dsh.client` 只有 `platform/inject/external/immediately` 四个字段，入口固定 `exports["./client"]`，产物是 `window.__ModuleLoader__.load` 的 lazy-CJS；player.html 必须由 Host `webServer.register` 路由提供（open-sea-skin 同构已验证）。React 从浏览器模块表 `require('react')` 拿，禁止自带/CDN。
3. **硬约束**：主题透明化只能"token + `<style>` 补丁"组合拳；`overrideTokens` 不是 14 token 上限（可任意 token，但要求 `{light,dark}` 对），它写不了规则、压不过 `!important`、管不了平台壳 frame 着色 → 弹层必须回不透明、light/dark 双套、选择器用 `data-platform/[data-shell-overlay]` 等稳定锚点，别用 CSS-module hash 或 `:has()` 整树匹配。
4. **可选路线**：持久化首选 **Host node:fs 写 `$DSH_HOME/shader-skin.json` + 同源 HTTP 路由**（`dsh-better-sidebar` 已验证形态）；localStorage 在 `dsh-app://` 下确实可用，但只当缓存；settings 的 `.volatile()` Config 只放少量全局标量；storageDomain 想要 schema 校验再上。设置 UI 首选 `settings.section` 一页，`settings.general.item` 加开关。
5. **坑**：a) "必须完全重启"对注入行成立，对 client-only 变更取决于桌面 SSE（`EventSource('/plugins/events')` 经 shell 转发，[推断] 成立但需实测——启用已装未启用的 open-sea-skin 就是零成本实验）；b) "script-src 禁用"是误读，真雷是加载失败杀 boot；c) "body 首子节点/水合"解释错误；d) `client-hmr` README 承认 Electron 安装路径不走 SSE 通道，演示时按"重装/新插件需重启"兜底；e) open-sea-skin 里 2 个 token（bg-multi-select、specific-selector）+ 社区桌面类名在本版不存在，照抄无效。
