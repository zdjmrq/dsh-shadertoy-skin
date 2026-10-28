# 商店截图（手动维护）

`docs/market/` 里是 dsh-market / awesome 列表用的商店截图，展示顺序由仓库根目录的 `screenshots.json` 决定（最多 8 张，按顺序）。

**不再从演示视频里自动截帧**：演示录屏里有输入法浮动条、侧栏内容和视频压缩痕迹，手动截图更好看，也能自己挑最能代表作品的一帧。

## 规范

- 文件名 `0N-<slug>.png`；展示顺序 = `screenshots.json` 里的顺序，与文件名前缀一致。
- 尺寸 1280×740（宽 16:9 附近）；dsh-market 的卡片按这个比例展示。
- 内容：真实 DSH 界面 + 一个能代表作品的效果。**不要**出现头像、昵称、聊天隐私、输入法浮动条、本机路径。
- 格式 PNG 或 JPG，单张建议 ≤ 1 MB；体积大就无损压缩（`pngquant` / `optipng`）或转 JPG。
- 换图：直接覆盖同名文件；增删条目时同步改 `screenshots.json`，不需要动其他地方。

## 图标

`assets/icon-180.png` 仍由脚本从 `icon.svg` 渲染（180×180、透明背景），保证和图标源一致：

```sh
node tools/make-icon.cjs
```

列表只接受 png/jpg/webp 图标，所以 SVG 需要这一份栅格副本；改 `icon.svg` 后重新跑一次即可。
