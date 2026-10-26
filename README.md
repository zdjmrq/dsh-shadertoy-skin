# dsh-shadertoy-skin

[![CI](https://github.com/zdjmrq/dsh-shadertoy-skin/actions/workflows/ci.yml/badge.svg)](https://github.com/zdjmrq/dsh-shadertoy-skin/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-shadertoy-skin)](https://www.npmjs.com/package/dsh-shadertoy-skin)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**给 DeepSeek Harness 桌面版套一层实时 ShaderToy 背景皮肤。** 一个零运行时依赖的 WebGL2 小播放器 + 背景库 + 玻璃界面，把聊天界面变成半透明的「浮在着色器上」的皮肤。

Realtime [ShaderToy](https://www.shadertoy.com/) background skin for DeepSeek Harness (desktop & web): a zero-runtime-dependency WebGL2 player, a background library, and a translucent glass shell.

![aurora](https://raw.githubusercontent.com/zdjmrq/dsh-shadertoy-skin/main/docs/verify/M0/aurora-default.png)
![flow](https://raw.githubusercontent.com/zdjmrq/dsh-shadertoy-skin/main/docs/verify/M0/flow-default.png)

## 状态

M0（渲染器 + 插件骨架 + 设置面板）已完成，持续加功能：

- [x] WebGL2 ShaderToy 兼容运行时：`mainImage` / 旧式 `void main` / GLSL ES 3.00 + ES 1.00 回落 / uniform 自动补齐 / 行号可读的编译错误
- [x] 零依赖单文件播放器，`/shader-skin/player.html` 由 Host 半从磁盘实读（改代码刷新即可，无需重启）
- [x] Host 半：静态路由 + `$DSH_HOME/shader-skin.json` 原子状态存取 + `$DSH_HOME/shader-skin/presets/` 本地预设目录
- [x] Client 半：把播放器挂成 body 首子节点、转发 iMouse / 主题 / 可见性，全部资源走 `ctx.effect` 清理
- [x] 玻璃壳：`theme.overrideTokens` 只透「底壳」（AppFrame / 侧栏），卡片与输入框保持实体；两层表面做 alpha 补偿
- [x] 设置面板（右下角圆钮）：启用开关、作品切换、玻璃不透明度、模糊、**渲染分辨率**、**帧率上限**、播放速度、音量/静音、恢复默认；改动即时生效并自动保存
- [x] **背景库**：内置 + 我的背景列表、切换、改名、删除；粘贴代码导入、文件导入（ShaderToy JSON / GLSL）、从 `$DSH_HOME/shader-skin/presets/` 导入
- [x] **每背景独立参数**（`overrides`），可「本背景恢复默认」
- [x] **`mainSound` 音频**：4096 采样块 → `readPixels` → WebAudio 前瞻调度 + Gain/限幅，音量与静音实时生效
- [x] 深浅色主题适配（设置面板与玻璃都跟随 DSH）
- [ ] 侧边栏入口：**暂时关闭**（注册进 `sidebar.panellist` + `main` 会卡死前端，已用常量 `ENABLE_SIDEBAR_ENTRY` 关掉，待定位后再开）
- [ ] 多 pass（Buffer A–D）、音频可视化回馈、兼容性静态体检

## 参数与默认值

默认值集中在 [`native-dist/defaults.json`](native-dist/defaults.json)，面板读它来渲染选项与「恢复默认」，Host 用它做兜底——**改一个文件就能改默认值**。

| 参数 | 默认 | 可选 | 说明 |
|---|---|---|---|
| `enabled` | `true` | 开/关 | 关掉只移除背景层，设置面板仍在 |
| `glass` | `72` (%) | 40–90 | 界面不透明度；越低背景越明显，下限锁定保证可读性 |
| `blur` | `0` px | 0–12 | 只在 > 0 时启用 CSS `filter` |
| `scale` | `1`× | 0.5 / 0.75 / 1 / 1.25 / 1.5 | 渲染分辨率倍率（DPR 上限 1.5） |
| `fps` | `30` | 15 / 20 / 30 / 60 | 渲染帧率上限；聊天时 30 足够 |
| `speed` | `1`× | 0–2 | 时间轴倍速 |
| `volume` / `muted` | `60` / `false` | 0–100 / 开/关 | 带 `mainSound` 的作品默认出声；浏览器可能拦截自动播放，面板会给「开声音」 |

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

安装后背景默认是「极光」，右下角有设置圆钮（参数/背景库两个页签）。

**开发期的安全阀**：如果界面出现卡死等异常，新建一个空文件 `$DSH_HOME/shader-skin.safe` 再刷新页面——客户端会跳过所有注入进 `#root` 的 UI（侧边栏入口等），只保留背景层与悬浮面板；删掉该文件即可恢复。

## 预设与许可证（重要）

- 随包只有**自写**的 MIT 着色器，**不包含任何 ShaderToy 作品代码**。
- ShaderToy 作品默认受 **CC BY-NC-SA 3.0**（作者未另行声明时）保护，不能随 MIT 包再分发。想用你收藏的作品：
  1. 在 ShaderToy 页面用作者的 Export / 复制 Code 拿到代码（**仅限个人使用**）；
  2. 放到 `$DSH_HOME/shader-skin/presets/`（这个目录不进包、不进 git）；
  3. 该目录通过 `/shader-skin/local/<file>` 暴露给播放器。
- 公开版计划支持「作品清单 + 用户自备 API key 一键导入」，不会内置 NC 作品。

## 开发

```sh
npm run dev              # http://127.0.0.1:8730/player.html?preset=aurora
npm run check            # 包结构 / 许可卫生 / npm pack 内容检查（无依赖）
npm run test:host        # Host 半路由 + 状态 v2 + 本地预设列表
npm run test:renderer    # 真浏览器 WebGL2 渲染 + 设置面板冒烟（需 playwright）
npm run test:audio       # mainSound → readPixels → WebAudio 真实出声验证（需 playwright）
```

Windows 上已装 Edge 可以跳过浏览器下载：`PLAYWRIGHT_CHANNEL=msedge npm run test:renderer`。

开发服务器同时挂了本地预设目录（只读），可以直接预览你导出的作品、不用先导入：

```
http://127.0.0.1:8730/player.html?preset=local/<file>.glsl
```

改 `native-dist/player.html`、`native-dist/panel.html` 或 `native-dist/presets/*.glsl` → 刷新页面即生效（Host 半读盘、no-cache）；插件壳（`index.js`/`client.js`）改动要重启客户端。**开发时优先改 `native-dist/*`**：改 `client.js` 会触发热重载，重载期间的 UI 变更风险最高，`client.js` 的改动请集中在一次做完再重启验证。

架构与决策记录在 [`docs/00-决策与方案复核.md`](docs/00-决策与方案复核.md)，渲染器说明在 [`docs/renderer-notes.md`](docs/renderer-notes.md)，发布流程在 [`docs/PUBLISHING.md`](docs/PUBLISHING.md)。

## 目录

```
index.js              Host 半：/shader-skin 路由 + 状态文件 + 本地预设目录 + safe-mode
client.js             Client 半：背景 iframe + 悬浮面板 + 玻璃 token + 事件转发
cordis.patch.yml      bundle patch（插入 shadertoy-skin 行）
native-dist/
  player.html         零依赖 WebGL2 播放器（渲染 + mainSound 音频）
  panel.html          设置界面（参数 / 背景库，深浅色自适应）
  defaults.json       全部默认参数（改这里就改默认值）
  presets/*.glsl      随包 MIT 着色器 + `pulse-sound.glsl`
  presets/dev/        测试夹具（不进 npm 包）
locale/ icon.svg      插件管理器展示资源
tools/                开发服务器 / 包检查 / 渲染冒烟 / 音频冒烟
.github/workflows/    CI + npm 发布（OIDC trusted publishing）
```

## License

[MIT](LICENSE)。第三方着色器代码的许可证由其作者决定，本仓库不收录。
