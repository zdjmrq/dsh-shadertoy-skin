# 宣传网页与视频

网页：<https://zdjmrq.github.io/dsh-shadertoy-skin/>

`site/` 是静态网站；GitHub Actions 先运行 `tools/site-smoke.mjs` 检查布局、录屏切换、复制、键盘导航、字幕和视频播放，再发布到 GitHub Pages。无远程字体、追踪脚本或在线着色器负载。展示区可见时才播放一个静音录屏；减少动态效果或省流量时保留静态封面。

网页修改走分支，验证后合并 main，Pages 自动更新。网站及制作工具不在 npm 的 `files` 中，不增加插件安装包体积。

## 第三版视频（当前线上版）

使用作者于 2026-10-29 提供的八段录屏：雨窗、造山、海面、Take On Me、地牢、马里奥、我的世界和 Never Gonna Give You Up。第三版精选使用其中六段，海面仅用于封面和改编对比；马里奥仅作为静态推荐图。原始视频只读，不提交仓库。另通过隔离的浏览器测试环境录制实际插件设置、导入和代码标签页，不访问已安装 DSH 的个人配置。

第三版约 2 分 7 秒：先用封面轻推和图形动画开场，解释代码生成画面与音乐，留出原作品音乐试听，再介绍市场安装、ShaderToy、导入、修改与交互。说明动画、图片占多数，不再反复播放海面。海面加星光使用实际着色器改编的前后画面。开头为「各位人类和ai大家好呀」。

旁白使用 Edge TTS `zh-CN-XiaoyiNeural`，语速不变、音高 +2 Hz；清亮、亲切的合成女声。仅发送旁白文字，不上传录屏。音乐作品片段保留同步录屏声音；Take On Me 接 Never Gonna Give You Up，留有无旁白试听。其余镜头静音，无另加配乐。中间剪辑使用 PCM，避免分段 AAC 编码填充造成音画漂移；最终混音通过旁白侧链压低作品音乐。字幕依据语音返回的 WordBoundary 元数据对齐。

正式交付在本地 `artifacts/promo-v3/`（Git 忽略）：

- `DSH-ShaderToy-介绍片-v3-1080p.mp4`：1920×1080、30 fps、H.264、AAC 48 kHz 立体声、硬字幕。
- `B站封面.png`、`字幕.srt`、`B站发布文案.md`。
- `剪辑时间线.json`、`制作说明.json`、`成片检查图-1.jpg`、`成片检查图-2.jpg`、`技术检查.txt`。

网页使用 720p 压缩版、VTT 字幕与封面。旧版保留于本地 `artifacts/promo/`、`artifacts/promo-v2/` 和备份目录，不再用于网站。

## 重建第三版

`site/assets/film-info.json` 记录线上视频版本、时长和章节，网页测试据此核对实际媒体。

Windows / Python 3.11+，使用系统雅黑和 Consolas 字体。npm 开发依赖提供 Playwright；第一次录制需安装浏览器及 Playwright FFmpeg。

```powershell
python -m pip install -r tools/promo/requirements.txt
npm ci
npx playwright install msedge ffmpeg
node tools/promo/capture-ui.mjs
python tools/promo/narration_v2.py --story tools/promo/storyboard-v3.json --output .tmp-validation/promo-v3/narration
python tools/promo/build_v3.py --sources 'D:\HUAWEI\Videos\屏幕录制'
python tools/promo/qa_v3.py
node tools/site-smoke.mjs
```

`storyboard-v3.json` 保存旁白、字幕和素材时间戳；`build_v3.py` 定义剪辑点与混音；`motion_v3.py` 生成说明动画，市场搜索界面和声音波形均标注为示意。缓存位于 `.tmp-validation/promo-v3/`。旁白修改会重新生成对应语音；剪辑以实际输出帧对齐，原片不足时仅轻微放慢或补尾帧，不循环拼接。

网页版六个短片及海报沿用首版资源；首次重建这些资源可使用旧工具的 `build.py --sources ... --stage prepare`，第三版成片复用 `capture-ui.mjs` 生成的实际界面素材，其余图形由代码生成，不依赖旧版成片。B站发布文案源文件为 [bilibili-promo.md](bilibili-promo.md)。

## 作品署名

网页「作品与许可」、发布简介和第三方说明保留原作者。录屏作品采用 CC BY-NC-SA 3.0；造山侵蚀算法组件另保留 MPL 2.0。完整信息见 [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md)。自写网页与制作脚本采用 MIT，第三方作品保留原许可。
