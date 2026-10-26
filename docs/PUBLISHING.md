# 发布流程（GitHub + npm）

两条流水线：

| 工作流 | 触发 | 做什么 |
|---|---|---|
| `.github/workflows/ci.yml` | push 到 `main` / PR / 手动 | `bundle` 检查（manifest、文件、许可证卫生、`npm pack` 内容）+ `renderer` 真浏览器 WebGL2 冒烟 |
| `.github/workflows/publish.yml` | **GitHub Release published** / 手动 | 校验版本与 tag 一致 → `npm run check` → `npm publish`（OIDC，无 token） |

npm 侧用 **Trusted Publisher（OIDC）**：不需要在仓库里放 `NPM_TOKEN`，发布时由 GitHub Actions 的 OIDC 身份换取短期凭证，并自动生成 provenance 证明。

> ✅ **链路已验证（2026-10-26）**：`v0.1.1` 经 `gh release create` → `publish.yml` → OIDC 发布成功，耗时 13s，
> provenance（SLSA v1）已写入 sigstore 透明日志，registry 元数据带 `dist.attestations`。
> 也就是说下面「一、2 首次手工发布」只需在**从零重建这条链路时**再做一次；日常发版直接跳到「二」。

---

## 一、需要你（仓库所有者）做的一次性准备

### 1. 建 GitHub 仓库

仓库名建议 `dsh-shadertoy-skin`（必须和 `package.json` 的 `repository.url` 完全一致，否则 npm 会拒绝通过 OIDC 发布）。

```powershell
gh repo create zdjmrq/dsh-shadertoy-skin --public --source . --remote origin --push
```

> 如果希望先私有开发、发布前再转 public：`--private`。注意 **私有仓库不生成 provenance**，公开发布前要切回 public（Settings → General → Danger Zone → Change visibility）。npm 第一次成功发布必须在配好 Trusted Publisher 后 **2 天内**完成，否则该配置过期，得删掉重建。

### 2. 首次发布（必须先手工一次）

npm 的 Trusted Publisher 配置入口在**已存在的包**的 settings 页，所以首个版本要先手工发布：

```powershell
# 需要 npm 账号 + 已开启 2FA
npm login
npm publish          # 发布 0.1.0
npm view dsh-shadertoy-skin version
```

> 备选：也可以用一次性 granular token 在 CI 里首发，但既然要手工一次，直接本地发更省事。发完记得**不要**把 token 留在任何地方。

### 3. 配置 Trusted Publisher

打开 <https://www.npmjs.com/package/dsh-shadertoy-skin> → **Settings** → **Trusted publishing** → 选 **GitHub Actions**，填：

| 字段 | 值 |
|---|---|
| Organization or user | `zdjmrq` |
| Repository | `dsh-shadertoy-skin` |
| Workflow filename | `publish.yml`（只要文件名，不要路径） |
| Environment name | 留空（除非以后要用 GitHub Environments 加人工审批） |
| Allowed actions | **勾上 “Allow npm publish”**（新配置默认只允许 stage publish，不勾就发不出去） |

保存后 **2 天内**必须跑一次成功的 `publish.yml`，否则配置失效。所有字段**大小写敏感、保存后不可修改**（要改只能删掉重建）。

### 4.（强烈建议）锁死 token 发布

Settings → **Publishing access** → 选 **Require two-factor authentication and disallow tokens** → Update。

Trusted Publisher 走 OIDC，不受这条限制影响。

---

## 二、日常发版

```powershell
# 1. 改版本（语义化版本）
npm version patch        # 或 minor / major，会顺手打 tag
# 2. 推代码和 tag
git push --follow-tags
# 3. 建 GitHub Release（publish.yml 由此触发）
gh release create "v$(node -p "require('./package.json').version")" --generate-notes
```

`publish.yml` 会先断言 `package.json` 的版本与 release tag 一致（`v0.1.0` ↔ `0.1.0`），不一致直接失败，不会发错版本。

也可以用 `workflow_dispatch` 手动触发，但同样要求 tag 已存在且版本一致（手动触发时跳过 tag 校验）。

### 本机网络特殊情况：`git push` 走不通时

这台机器上 `github.com:443` 会被 TLS 重置，而 `api.github.com` 正常，所以 `git push` / `git fetch` 会失败（`gh` 命令本身正常，因为它只走 api.github.com）。此时用仓库里的备用脚本推送：

```powershell
node tools/push-via-api.mjs --message "feat: ..."
```

它用 Git Data API（blobs → tree → commit → ref）把当前工作树推成一个 commit，需要 `gh auth login`（scope 含 `repo` 和 `workflow`）。注意：这样推出来的 commit SHA 与本地 `git log` 不同（内容相同），本地 git 与远端是两条平行历史；网络恢复后可以改回常规 `git push`。`gh release create` / `gh run` / CI 都照常可用（走 API）。

---

## 三、CI 会拦住什么

`npm run check`（`tools/check-bundle.mjs`）：

- manifest：`name` / `version` / `license=MIT` / `type=module` / `engines.node>=22.14` / `private≠true`
- `repository.url` 必须是 GitHub 形式；CI 里还会和 `GITHUB_REPOSITORY` 对比
- `dsh.bundle.patch` 存在、`dsh.client.platform === 'web'`、`exports['./client']` 指向真实文件
- `files` 里声明的每个文件都存在
- `cordis.patch.yml` 里不许出现绝对路径 / `file://`（发布包不能带作者机器的路径）
- 随包预设必须 `license: MIT`、文件存在、不是 `_` 开头的调试夹具
- 随包 `.glsl/.html/.js` 里不许出现 `shadertoy.com/view|embed` 链接（防止 NC 作品代码被误打包）
- `native-dist/presets/local/` 必须不存在（用户导入目录）
- `npm pack --dry-run` 的文件清单：必须含 `player.html`/两半入口，必须排除 `docs/`、`tools/`、`presets/dev/`、`presets/local/`

`renderer` job 用真 Chromium + SwiftShader 跑 `tools/renderer-smoke.mjs`：aurora/flow 必须 ES3 在跑且像素不同、legacy 改写成 ES3、`gl_FragData` 回落 ES1、坏 shader 必须出现错误面板、`debug=bg` 生效、无未捕获异常。

---

## 四、排错

| 现象 | 原因 / 处理 |
|---|---|
| `ENEEDAUTH` | workflow 文件名与 npm 上配置不一致（含 `.yml`）、缺 `permissions: id-token: write`、或不在 GitHub 托管 runner 上 |
| provenance 没生成 | 仓库是 private 或包是 private；改成 public 后重新发版 |
| 发布版本已存在 | 版本号没改；npm 不允许覆盖已发布版本 |
| tag 校验失败 | `npm version` 用的前缀与 release tag 不一致（本仓库约定 `v` 前缀） |
| 配置过期 | Trusted Publisher 建好 2 天内没成功发布过 → 删掉重建 |

官方文档：<https://docs.npmjs.com/trusted-publishers>

---

## 五、README 里的演示视频

README 顶部的演示视频用 **GitHub 附件（user-attachments）**，不引用仓库里的 mp4：

```md
<video src="https://github.com/user-attachments/assets/<uuid>" controls muted width="100%"></video>
```

- **为什么不用仓库里的 mp4**：`raw.githubusercontent.com` 对 `.mp4` 下发 `application/octet-stream` 且不支持 Range，`<video>` 直接引用播不了；GitHub 附件 URL 会 302 到 S3 签名地址，`video/mp4` + Range 都正常。
- **怎么拿到这个 URL**：在 GitHub 网页上编辑 `README.md`，把视频拖进编辑框，等它插好链接再 commit。
- **提交前链接是私有的**：没提交时匿名访问返回 404/403（只有上传者带登录态能拉），提交后才是 200 —— 所以别在草稿里就复制链接。
- **别把引用删干净**：附件能匿名播放是因为它出现在公开内容里；`docs/verify/readme-demo.mp4` 已不再被 README 引用（保留只为旧的 npm 0.2.1 README 链接不断），下次发版可以删掉。
