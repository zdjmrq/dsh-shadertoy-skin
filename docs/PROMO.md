# 宣传网页与视频

网页：https://zdjmrq.github.io/dsh-shadertoy-skin/

发布包：https://github.com/zdjmrq/dsh-shadertoy-skin/releases/tag/promo-2026-10-29

## 当前定稿：v4

用户已确认约 2 分 3 秒的第四版视频。1080p 成片位于 `artifacts/promo-v4/DSH-ShaderToy-介绍片-v4-1080p.mp4`；宣传包上传独立 GitHub Release，不改变插件 0.4.6 的版本，也不将宣传包标为插件的 latest release。

- 固定封面开场，检查前 150 帧封面标牌边缘位置一致，修复逐帧缩放产生的跳动。
- 标题页改为画面、音乐、交互三张实图卡片；删除雨窗说明中遮挡图片的人工框。
- 设置部分使用用户提供的风中树景截图，约 6 秒概括功能。
- Take On Me、Never Gonna Give You Up、马里奥三个音乐作品保留同步原录屏声音，留有无旁白试听；旁白期间降低音乐音量。
- 造山、像素世界和地牢的交互演示保留，支持导入、改代码及 ShaderToy 推荐。

旁白为 Edge TTS `zh-CN-XiaoyiNeural` 合成女声，语速不变、音高 +2 Hz。字幕根据 WordBoundary 元数据对齐。开头为「各位人类和ai大家好呀」。

## 发布资料

`artifacts/promo-v4/发布包/` 和 `dsh-shadertoy-bilibili-kit-v4.zip` 包含：

- 已确认的 1080p MP4、16:9 PNG 封面、SRT/VTT 字幕。
- 标题、完整简介、章节、标签、置顶评论。
- 发布指南、作品与许可、SHA256 校验表。

文案的仓库版本：[bilibili-promo.md](bilibili-promo.md)。简介包含作品署名及完整第三方说明链接。包内不含私人原始录屏、设置原图和内部剪辑缓存。成片已有硬字幕，无需再烧录一层字幕。

## 维护网页和发布包

`tools/promo/publish_v4.py` 直接读取已确认的视频，只转码网页播放副本，不重新渲染成片。导出前后核对 1080p 文件 SHA256：

```powershell
python tools/promo/publish_v4.py --site
node tools/site-smoke.mjs
```

网页使用 720p 播放副本、VTT 和封面，媒体链接带版本参数，避免浏览器混用旧视频与新字幕。`site/assets/film-info.json` 保存当前版本、实际时长和章节，网页测试核对媒体元信息、字幕、拖动播放、移动布局及减少动态效果。GitHub Pages 工作流验证后部署。

网页无远程字体、追踪脚本或在线着色器负载。展示区可见时才播放一个静音录屏；减少动态效果或省流量时保留静态封面。网站和制作工具均不在 npm 发布清单中。

## 从原始素材重建（供后续修改）

原始录屏和树景截图只读，位于用户本地。v4 共接收九段录屏，实际使用其中七段；海面仅用于封面和改编对比，原马里奥片段由新录屏替代。旧成片保留在各自 artifacts 目录。

```powershell
python -m pip install -r tools/promo/requirements.txt
python tools/promo/narration_v2.py --story tools/promo/storyboard-v4.json --output .tmp-validation/promo-v4/narration
python tools/promo/build_v3.py --revision 4 --local-only --sources '原始录屏目录' --settings-image '树景设置截图.png'
python tools/promo/qa_v3.py --revision 4
```

`storyboard-v4.json` 保存旁白、字幕和素材文件时间戳；`motion_v3.py` 生成说明动画；`build_v3.py` 支持 v3/v4 剪辑。音乐单独渲染为精确长度的 PCM 再合成，避免剪辑边界少一帧音频造成后续音轨提前。中间产物在 `.tmp-validation/promo-v4/`。

海面改编对比图来自隔离浏览器测试环境的实际着色器截图；首次重建这两张图时可运行 `node tools/promo/capture-ui.mjs`。重建后需要重新审片；已确认成片的发布应使用 publish 工具，避免意外替换定稿。

## 作品与许可

第三方作品保留作者、来源和许可；造山侵蚀算法、风中树景的部分组件等另有自身声明。详见发布包和 [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md)。网页、制作脚本及插件自写代码采用 MIT。
