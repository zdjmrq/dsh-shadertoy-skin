# CI 与韧性测试复查（2026-10-29 晚）

范围：`ci.yml` / `browser-tests.yml` / `publish.yml` / `pages.yml` 的成本与覆盖，以及插件在异常、恶意和长时间运行环境下的稳定性。

## 一、CI 现状与冗余判断

当前每次 push/PR：

- 静态检查 job（语法、包检查 419、Host、项目格式、TypeScript 7）
- 17 个浏览器套件各一个 runner（约 2–3 分钟完成）
- 发布时 `publish.yml` 再把同一批 17 个套件跑一遍，然后 `npm publish`
- `pages.yml` 只在 `site/**` 等路径变化时跑展示页冒烟并部署

判断与处理：

1. **纯文档提交跑 17 个浏览器套件是明显的冗余**——此前一条 docs-only 提交还因测试偶发失败变红。现在静态检查 job 先用 `git diff` 判断改动路径：只有 `index.js`、`client.js`、`package*.json`、`native-dist/`、`locale/`、`tools/`、`.github/workflows/` 变化才触发浏览器矩阵；纯 `docs/`、README、site 等提交只跑静态检查。
2. **TypeScript 检查单独占一个 runner 没有必要**：合并进静态检查 job（共享 npm 缓存），减少一次 checkout/setup。
3. **保留 17 个并行 job 而不是合并分组**：单套件 30–90 秒、失败能精确指到套件、互不拖慢；合并成 4–5 组会把反馈时间拉长到 4–6 分钟，且一个失败会掩盖同组其他套件。以 runner 分钟换故障定位精度，是刻意的取舍。
4. **发布前重复跑全量套件保留**：发布不可逆，独立于 push 时的 CI 再验证一遍同一 commit 是发布门禁，不与 CI 结果耦合；一个 release 多花约 3 分钟 runner 时间可以接受。
5. 其他：`npm ci` 在矩阵里每个 job 各一份，但 npm 下载缓存由 `setup-node` 共享，实际只有解包开销；`pages.yml` 已按路径过滤，无需改动。

改完后的结构：`static checks`（总是）+ `browser regressions`（按改动路径决定跑不跑）→ 发布时 `verify`（17 套件）+ `publish`。

## 二、对抗性 / 压力测试

### 新增 `test:adversarial`（已进 CI，17 号套件）

覆盖四类「插件可能被搞崩」的输入：

- **Host 恶意状态**：畸形 JSON、错误 Content-Type、重复 id、>4 Buffer、缺失通道资源、非法内嵌图片、>2 MB 请求体、超长 id 截断、旧 ETag 冲突、`..%2f` 路径穿越；以及 `__proto__` 键的**原型污染**——恶意状态文件能正常加载，但父页面和设置页的 `Object.prototype` 都保持干净。
- **坏 GLSL / 坏项目**：截断源码、随机 token、include 缺失与循环、>4 Buffer、悬空通道、无效内嵌图片——每一项都必须保留上一张画面继续渲染、渲染器不重启、帧数继续增长。
- **有效但极端**：约 200 KB 注释、`1./0.`、`0./0.` 输出、NaN 音量、缺 `mainSound` 的 Sound 代码、`mainSound` 返回 `1e30`——画面不能被音频或数值问题带崩。
- **快速切换与伪造消息**：40 次连续 init 必须收敛到最后一次、Worker 重启次数受限、帧继续推进；伪造的 `interaction` / `interaction-key` / `interaction-pointer`（错误 token、NaN/Infinity 坐标）被忽略且不抛异常；1×1 视口不产生未捕获错误。

### 新增 `test:soak`（可选，不进 CI）

反复切换作品、开关背景、改窗口大小，逐周期记录页面堆与 Worker 代数。本机 10 周期结果：

```
soak: 10 cycles, heap 5.4 -> 8.7 MiB (growth after warm-up 2.6 MiB), renderer generation 1
ok    repeated switching/enable/resize cycles keep the settings page and renderer stable
```

结论：设置页/客户端侧堆增长有界（预热后 +2.6 MiB/10 周期），渲染 Worker 未被意外重启，无未捕获错误。

已知限制：该指标只覆盖页面/客户端堆，Web Worker 与 GPU 显存不在 `Performance.getMetrics` 内；Worker 侧的内存边界由多 pass（96 MiB）、纹理（1600 万像素）、音频队列（32 块）的硬限制与既有回归覆盖。

## 三、验证

- 本机：`npm test`（419/419 + TypeScript + Host + 项目格式）、17 个浏览器套件（新增 adversarial）、`test:soak` 均通过。
- CI（`4cf725b`）：静态检查 + 17 个浏览器套件全绿；新增的 `adversarial` 在 Chrome + SwiftShader 下通过。
- 文档提交跳过验证：本条更新只改 `docs/`，推送后的 CI 应只跑静态检查、跳过整个浏览器矩阵（见该 commit 的运行记录）。

