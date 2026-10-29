// Optional soak test: repeated artwork switching, enable/disable cycles and
// window resizes for a few minutes. Not part of CI (slow and machine-sensitive):
// it looks for unbounded page-heap growth, renderer restarts and uncaught errors
// that short functional suites cannot see.
//
//   npm run test:soak                    # 12 cycles, ~1-2 minutes on a laptop
//   SOAK_CYCLES=40 npm run test:soak     # longer run
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { startHarness } from './browser-harness.mjs'

const CYCLES = Math.max(4, Math.min(120, Number(process.env.SOAK_CYCLES) || 12))
const PRESETS = ['aurora', 'flow', 'rain-window', 'seascape', 'rain-window-no-lightning', 'pulse']
const HEAP_GROWTH_LIMIT = 32 * 1024 * 1024

const h = await startHarness()
let browser
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.env.CI ? 'chrome' : 'msedge'), headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] })
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable').catch(() => {})
  await cdp.send('HeapProfiler.enable').catch(() => {})
  const heap = async () => {
    // The test harness records every same-origin message in window.__messages;
    // drop it (and force GC) so the metric reflects the plugin, not the harness.
    await page.evaluate(() => { if (Array.isArray(window.__messages)) window.__messages.length = 0 }).catch(() => {})
    await cdp.send('HeapProfiler.collectGarbage').catch(() => {})
    try {
      const { metrics } = await cdp.send('Performance.getMetrics')
      const value = metrics.find(metric => metric.name === 'JSHeapUsedSize')?.value
      if (value) return value
    } catch { /* fall back to performance.memory below */ }
    return page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0)
  }
  await page.goto(h.url)
  await page.waitForSelector('iframe[title="ShaderToy 背景设置"]')
  const panel = await page.waitForFunction(() => {
    const frame = document.querySelector('iframe[title="ShaderToy 背景设置"]')
    return frame?.contentWindow?.document?.querySelector('#preset-dd .dd-trigger') ? true : false
  }).then(() => page.frames().find(frame => frame.url().includes('panel.html')))
  await panel.waitForSelector('#preset-dd .dd-trigger')

  const playerFrames = () => {
    const frame = page.frames().find(candidate => candidate.url().includes('player.html'))
    return frame?.evaluate(() => ({ ready: window.__player?.ready, preset: window.__player?.preset, generation: window.__player?.workerGeneration, frames: window.__player?.frames }))
  }
  const waitPlayer = async expected => {
    for (let attempt = 0; attempt < 120; attempt++) {
      const state = await playerFrames()
      if (state?.ready && (!expected || state.preset === expected)) return state
      await page.waitForTimeout(100)
    }
    throw new Error(`player did not settle on ${expected}`)
  }
  const names = await page.evaluate(() => fetch('/shader-skin/presets/index.json', { cache: 'no-store' })
    .then(response => response.json())
    .then(list => Object.fromEntries(list.map(item => [item.id, item.name]))))
  const choose = async id => {
    await panel.click('#preset-dd .dd-trigger')
    const labels = await panel.locator('#preset-dd .dd-item').allTextContents()
    const name = names[id] ?? id
    const index = labels.findIndex(text => text.replace(/\s*·.*$/, '') === name)
    assert.ok(index >= 0, `preset ${id} (${name}) is missing from the picker`)
    await panel.locator('#preset-dd .dd-item').nth(index).click()
    await waitPlayer()
  }

  const heapSeries = []
  await page.waitForTimeout(1500)
  heapSeries.push(await heap())
  let generation = (await waitPlayer()).generation
  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    await choose(PRESETS[cycle % PRESETS.length])
    if (cycle % 3 === 0) {
      await panel.uncheck('#enabled')
      await page.waitForTimeout(200)
      await panel.check('#enabled')
      await waitPlayer()
    }
    if (cycle % 2 === 0) await page.setViewportSize({ width: 900 + (cycle % 3) * 120, height: 620 + (cycle % 4) * 40 })
    await page.waitForTimeout(350)
    heapSeries.push(await heap())
    const state = await playerFrames()
    if (state?.generation !== undefined) generation = Math.max(generation, state.generation)
  }
  const warm = 2
  const growth = heapSeries.at(-1) - heapSeries[warm]
  console.log(`soak: ${CYCLES} cycles, heap ${(heapSeries[0] / 1048576).toFixed(1)} -> ${(heapSeries.at(-1) / 1048576).toFixed(1)} MiB (growth after warm-up ${(growth / 1048576).toFixed(1)} MiB), renderer generation ${generation}`)
  assert.deepEqual(errors, [])
  assert.ok(heapSeries.at(-1) > 0 && growth < HEAP_GROWTH_LIMIT, `page heap grew by ${(growth / 1048576).toFixed(1)} MiB over ${CYCLES} cycles`)
  await waitPlayer()
  console.log('ok    repeated switching/enable/resize cycles keep the settings page and renderer stable')
} finally { await browser?.close(); await h.close() }
