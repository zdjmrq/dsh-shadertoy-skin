#!/usr/bin/env node
/**
 * Raster icon generator for the plugin store.
 *
 *   node tools/make-icon.cjs
 *       -> assets/icon-180.png (180x180, transparent background)
 *
 * The store list only accepts png/jpg/webp icons, so the SVG source needs one
 * raster copy. Rendered with Playwright so the geometry matches `icon.svg`
 * exactly; set PLAYWRIGHT_CHANNEL=chrome on CI images that ship Chrome.
 *
 * Storefront screenshots are NOT generated here: `docs/market/` is maintained by
 * hand and listed in `screenshots.json` (see docs/market/README.md).
 */
const { mkdirSync, readFileSync } = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

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
    mkdirSync(path.join(ROOT, 'assets'), { recursive: true })
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
