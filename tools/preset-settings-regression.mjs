import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { startHarness } from './browser-harness.mjs'

const h = await startHarness()
let browser
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.env.CI ? 'chrome' : 'msedge'), headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
  const page = await browser.newPage({ viewport: { width: 1200, height: 950 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  // Start with an actual old disk file, not PUT (which would already migrate).
  await writeFile(join(h.home, 'shader-skin.json'), JSON.stringify({ version: 2, activeId: 'pulse', entries: [],
    settings: { enabled: true, glass: 43, panels: 'clear', fps: 60, scale: .5, volume: 25, muted: true },
    overrides: { pulse: { glass: 80, speed: .5 }, mario: { glass: 90, speed: 1.5 } } }))
  const disk = async () => JSON.parse(await readFile(join(h.home, 'shader-skin.json'), 'utf8'))
  const load = async () => {
    await page.goto(h.url)
    await page.frameLocator('iframe[title="ShaderToy 背景设置"]').locator('#preset-dd .dd-trigger').waitFor()
    return page.frames().find(frame => frame.url().includes('panel.html'))
  }
  let panel = await load()
  const saved = () => panel.waitForFunction(() => document.querySelector('#note').textContent === '已保存')
  const choose = async id => {
    await panel.click('#preset-dd .dd-trigger')
    await panel.locator('#preset-dd .dd-item').nth({ pulse: 2, mario: 4 }[id]).click()
    await saved()
  }
  const values = async () => panel.evaluate(() => Object.fromEntries(['glass', 'brightness', 'speed', 'blur', 'volume', 'muted'].map(id => {
    const n = document.getElementById(id); return [id, n.type === 'checkbox' ? n.checked : Number(n.value)]
  })))
  assert.equal((await values()).glass, 43, 'v2 global appearance must win over its stale artwork copy')
  assert.equal((await values()).speed, .5)
  await choose('mario')
  assert.equal((await values()).glass, 43)
  assert.equal((await values()).speed, 1.5)
  await panel.fill('#glass', '72')
  await panel.fill('#speed', '1.25')
  await panel.fill('#volume', '37')
  await saved()
  await choose('pulse')
  assert.equal((await values()).glass, 43)
  assert.equal((await values()).speed, .5)
  await panel.fill('#glass', '55')
  await panel.fill('#speed', '0.75')
  await panel.fill('#brightness', '130')
  await panel.fill('#blur', '2')
  await panel.fill('#volume', '19')
  await panel.uncheck('#muted')
  await saved()
  const pulse = await values()
  await choose('mario')
  assert.equal((await values()).glass, 72)
  assert.equal((await values()).speed, 1.25)
  assert.equal((await values()).volume, 37)
  panel = await load()
  assert.equal((await values()).glass, 72)
  await choose('pulse')
  assert.deepEqual(await values(), pulse)
  assert.equal((await disk()).version, 3)
  assert.equal((await disk()).settings.glass, 43, 'legacy baseline is never overwritten by an artwork edit')
  console.log('ok    v2 migration preserves the visible look, v3 settings stay independent across switches and reloads')

  await panel.click('#reset')
  await saved()
  assert.deepEqual(await values(), { glass: 60, brightness: 100, speed: 1, blur: 0, volume: 60, muted: false })
  await choose('mario')
  assert.equal((await values()).glass, 72)
  assert.equal((await values()).speed, 1.25)
  await panel.uncheck('#enabled')
  await saved()
  await choose('pulse')
  assert.equal(await panel.isChecked('#enabled'), false)
  assert.equal((await values()).glass, 60)
  await panel.check('#enabled')
  await saved()
  console.log('ok    restoring one background uses factory defaults without resetting others; enabled remains global')

  await page.route('**/shader-skin/state', route => route.request().method() === 'PUT' ? route.abort() : route.continue())
  await panel.fill('#glass', '66')
  await panel.waitForFunction(() => document.querySelector('#note').classList.contains('error'))
  await page.unroute('**/shader-skin/state')
  panel = await load()
  await panel.waitForFunction(() => !localStorage.getItem('shadertoy-skin.pending-state'))
  assert.equal((await values()).glass, 66)
  assert.equal((await disk()).overrides.pulse.glass, 66)
  await choose('mario')
  assert.equal((await values()).glass, 72)
  assert.deepEqual(errors, [])
  console.log('ok    interrupted saves recover into the correct background without leaking into another background')
} finally { await browser?.close(); await h.close() }
