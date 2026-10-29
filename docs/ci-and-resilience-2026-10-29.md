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

反复切换作品、开关背景、改窗口大小，逐周期记录页面堆与 Worker 代数。测量前会清空测试壳的 `window.__messages`（它记录所有 postMessage，不清会制造假增长）并强制 GC。本机 30 周期结果：

```
soak: 30 cycles, heap 4.1 -> 4.7 MiB (growth after warm-up 0.3 MiB), renderer generation 1
ok    repeated switching/enable/resize cycles keep the settings page and renderer stable
```

结论：设置页/客户端侧堆增长有界（预热后 +0.3 MiB/30 周期），渲染 Worker 未被意外重启，无未捕获错误。

已知限制：该指标只覆盖页面/客户端堆，Web Worker 与 GPU 显存不在 `Performance.getMetrics` 内；Worker 侧的内存边界由多 pass（96 MiB）、纹理（1600 万像素）、音频队列（32 块）的硬限制与既有回归覆盖。

## 三、探索性攻击测试（一次性，2026-10-29 晚）

确定性套件只验证已知坏输入；另做了一轮不进 CI 的探索性攻击，用来找**尚未编码的**问题。结果全部通过，没有发现新缺陷：

| 探测 | 结果 |
|---|---|
| 12 个并发 PUT 用同一 `if-match` | 1×200 + 11×409，状态完整 |
| 16 个并发无条件 PUT + 读取交错 | 写入后状态可解析，30 次 GET 全 200 |
| 畸形百分号编码 / `..%2f` / `..%5c` 路径 | 全 4xx，无 5xx |
| 状态文件被替换为 symlink / hardlink | Windows 下 symlink 需要权限（环境限制）；hardlink 测试通过：PUT 替换目录项，链接目标文件未被改写 |
| 190 个作品、约 1.4 MB 代码的近上限状态 | PUT 23 ms / GET 10 ms，重载正常 |
| 本地预设目录中硬链接/符号链接逃逸 | 列表跳过、直接 GET 拒绝（符号链接受 Windows 权限限制未能本机创建） |
| 5000 条 params/mouse/未知类型消息洪泛 | 播放器继续出帧，无页面错误 |
| 200 KB 作品名 + 500 KB 未知参数 | 不崩溃、正常运行 |
| 25 次开关背景 | 最终恰好 1 个播放器、ready，状态 `enabled=true` |
| 60 次拖动滑块（保存风暴） | 状态落盘、恢复日志清空、显示“已保存” |
| localStorage 配额耗尽后继续改设置 | 恢复日志降级，PUT 保存成功 |
| 30% Host 请求失败（页面重载期间） | 页面能恢复，重载后设置可用，状态未损坏 |
| 设置 iframe 连续重载 8 次 | 仍只有一个播放器，状态完整，无未捕获错误 |
| GPU 上下文丢失 + 连续切换 | Worker 重建为 generation 2 并恢复 |
| 播放中音频设备被移除（`createBufferSource` 抛错） | 音频报错但画面继续渲染，无页面错误；换作品后恢复正常 |

其中两条最值得长期保留的探测已编码进 `test:adversarial`：并发 `if-match` 写、播放中音频设备丢失。

## 四、验证

- 本机：`npm test`（419/419 + TypeScript + Host + 项目格式）、17 个浏览器套件（新增 adversarial）、`test:soak`（30 周期）均通过。
- CI（`4cf725b`）：静态检查 + 17 个浏览器套件全绿；新增的 `adversarial` 在 Chrome + SwiftShader 下通过。
- 文档提交跳过验证：本条更新只改 `docs/`，推送后的 CI 应只跑静态检查、跳过整个浏览器矩阵（见该 commit 的运行记录）。

