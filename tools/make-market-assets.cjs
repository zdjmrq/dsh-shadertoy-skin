#!/usr/bin/env node
/**
 * Legacy video-frame generator for the storefront assets.
 * Current storefront screenshots are curated PNGs listed in screenshots.json.
 *
 *   assets/icon-180.png        raster icon (that list only accepts png/jpg/webp)
 *   docs/market/*.jpg          screenshots, also declared in ./screenshots.json
 *
 * Usage:
 *   MARIO_VIDEO=/path/to/mario.mp4 SEA_VIDEO=/path/to/seascape.mp4 \
 *     FFMPEG=/path/to/ffmpeg node tools/make-market-assets.cjs --legacy-video-screenshots
 *
 * Frames are cropped to 1280x740 so the recording's sidebar footer (avatar and
 * nickname) and the floating input-method toolbar never appear — which is why
 * the source recordings do not have to be masked first.
 *
 * screenshots.json is generated here so its order always matches the files.
 */
const { execFileSync } = require('node:child_process')
const { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const FFMPEG = process.env.FFMPEG || 'ffmpeg'
const MARIO = process.env.MARIO_VIDEO
const SEA = process.env.SEA_VIDEO

if (!process.argv.includes('--legacy-video-screenshots')) {
  console.error('screenshots.json now lists curated PNGs. This legacy generator would replace their selection; pass --legacy-video-screenshots explicitly to restore video frames.')
  process.exit(1)
}

if (!MARIO || !SEA) {
  console.error('set MARIO_VIDEO and SEA_VIDEO to the two demo recordings')
  process.exit(1)
}

// 2880x1824 and 2562x1640 sources; 1280 wide, bottom strip dropped.
const MARIO_FILTER = 'scale=1280:810:flags=lanczos,crop=1280:740:0:0'
const SEA_FILTER = 'scale=1280:820:flags=lanczos,crop=1280:740:0:0'

// Order matters: the first shot is the storefront hero image.
const SHOTS = [
  { file: 'chat-seascape.jpg', video: SEA, filter: SEA_FILTER, at: 8 },
  { file: 'chat-mario.jpg', video: MARIO, filter: MARIO_FILTER, at: 53 },
  { file: 'transparent-cards.jpg', video: MARIO, filter: MARIO_FILTER, at: 13 },
  { file: 'code-tab.jpg', video: MARIO, filter: MARIO_FILTER, at: 25 }
]

const market = path.join(ROOT, 'docs', 'market')
mkdirSync(path.join(ROOT, 'assets'), { recursive: true })
mkdirSync(market, { recursive: true })
for (const name of readdirSync(market)) {
  if (name.endsWith('.jpg')) rmSync(path.join(market, name))
}

for (const shot of SHOTS) {
  const target = path.join(market, shot.file)
  execFileSync(FFMPEG, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-ss', String(shot.at), '-i', shot.video, '-frames:v', '1',
    '-vf', shot.filter, '-q:v', '3', target
  ], { stdio: 'inherit' })
  console.log(`screenshot ${path.relative(ROOT, target)}`)
}

writeFileSync(
  path.join(ROOT, 'screenshots.json'),
  JSON.stringify(SHOTS.map(shot => `docs/market/${shot.file}`), null, 2) + '\n'
)
console.log('screenshots.json')

async function renderIcon() {
  const { chromium } = require('playwright')
  const svg = readFileSync(path.join(ROOT, 'icon.svg'), 'utf8')
  const data = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
    headless: true
  })
  try {
    const page = await browser.newPage({ viewport: { width: 180, height: 180 } })
    await page.setContent(
      `<html><body style="margin:0;background:transparent">` +
        `<img src="${data}" width="180" height="180" style="display:block">` +
        `</body></html>`
    )
    await page.screenshot({
      path: path.join(ROOT, 'assets', 'icon-180.png'),
      omitBackground: true,
      clip: { x: 0, y: 0, width: 180, height: 180 }
    })
    console.log('icon assets/icon-180.png')
  } finally {
    await browser.close()
  }
}

renderIcon().catch(error => {
  console.error(error.message)
  process.exit(1)
})
