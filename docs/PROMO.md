# 宣传网页与视频

网页：<https://zdjmrq.github.io/dsh-shadertoy-skin/>

`site/` 是可直接部署的静态网站；GitHub Actions 先运行 `tools/site-smoke.mjs` 检查手机布局、录屏切换、复制、键盘导航和减弱动态效果，再发布到 GitHub Pages。网页没有远程字体、追踪脚本或在线着色器负载。只在展示区可见时播放一个静音录屏；系统偏好减少动态效果或省流量时，默认保留静态封面。

仓库 About 的 Website 填上面的 Pages 地址。网页修改走分支，验证后合并 main，Pages 会自动更新。网站和宣传工具没有加入 npm 的 `files` 清单，不增加插件安装包体积。

## 素材与视频

2026-10-29 提供的六段素材依次为：雨窗、造山、海面、Take On Me、地牢、马里奥。原始视频始终只读，不提交到仓库。网页只收录重新编码的静音短片、封面和约 80 秒的 720p 介绍片。

完整版交付放在本地 `artifacts/promo/`（Git 忽略）：

- `DSH-ShaderToy-宣传片-1080p.mp4`：1920×1080、30 fps、H.264、AAC 48 kHz，含硬字幕，适合直接上传 B 站。
- `B站封面.png`：1920×1080。
- `字幕.srt`：简体中文字幕。
- `B站发布文案.md`：标题、简介、章节、标签及作品署名。
- `剪辑时间线.json`：每章旁白、取材位置和时间信息。
- `成片检查图.jpg`、`技术检查.txt`：画面抽检和音视频参数/响度检查。

旁白为 Microsoft Edge 语音合成的 `zh-CN-YunxiNeural`，只发送旁白文字，不上传视频。原声静音，使用脚本原创生成的氛围配乐。介绍片中的编辑器为明确标注的功能结构示意；其余画面来自实际 DSH 录屏。

开头向“人类和 AI”问好，并问候“大肥鱼”；没有借用任何账号的头像、声音或身份。

## 重建

Windows / Python 3.11+；使用系统雅黑和 Consolas 字体。可选的媒体制作依赖独立于 npm 插件：

```powershell
python -m pip install -r tools/promo/requirements.txt
python tools/promo/build.py --sources 'D:\HUAWEI\Videos\屏幕录制' --stage all
python tools/promo/qa.py
node tools/site-smoke.mjs
```

脚本从 `storyboard.json` 读取旁白和取材位置；素材目录由 `--sources` 提供，原始文件名中的六个时间戳保持不变。生成缓存位于 `.tmp-validation/promo/build/`。改脚本或分镜会使对应剪辑缓存失效；改旁白后会重新生成语音。

## 作品署名

网页的「作品与许可」、视频发布简介和仓库第三方说明都保留原作者。录屏中的作品采用 CC BY-NC-SA 3.0；造山的侵蚀算法组件另保留 MPL 2.0，详情见 [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md)。自写网页、视频制作脚本和程序生成配乐随项目采用 MIT。请保留第三方作品的署名与原许可。
