import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { startHarness } from './browser-harness.mjs'

const h = await startHarness()
let browser
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.env.CI ? 'chrome' : 'msedge'), headless: true })
  const url = `${h.url}/shader-skin/panel.html?mode=main`
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const reads = []
  let release
  const gate = new Promise(resolve => { release = resolve })
  await page.route(/\/shader-skin\/(defaults.json|presets\/index.json|state)$/, async route => {
    reads.push(route.request().url())
    await gate
    await route.continue()
  })
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.querySelector('#boot-message')?.textContent.includes('正在读取'))
  assert.equal(await page.locator('#fab').isVisible(), false, 'the old floating launcher must never flash in main mode')
  assert.equal(await page.locator('#panel').isVisible(), false)
  // All reads must start while the others are unresolved: no serialized RTTs.
  await assert.doesNotReject(async () => {
    const deadline = Date.now() + 3000
    while (reads.length < 3 && Date.now() < deadline) await page.waitForTimeout(20)
    assert.equal(reads.length, 3)
  })
  release()
  await page.waitForSelector('#preset-dd .dd-trigger')
  assert.equal(await page.locator('.boot-status').isVisible(), false)
  await page.unrouteAll({ behavior: 'wait' })
  console.log('ok    main shape is immediate, popup launcher stays hidden, startup reads run concurrently')

  let writes = 0
  page.on('request', request => { if (request.method() === 'PUT') writes++ })
  await page.route('**/presets/index.json', route => route.fulfill({ status: 503, body: 'host unavailable' }))
  await page.goto(url)
  await page.waitForFunction(() => document.querySelector('#boot-message').textContent.includes('HTTP 503'))
  assert.ok(await page.locator('#boot-retry').isVisible())
  assert.equal(await page.locator('#panel').isVisible(), false)
  assert.equal(writes, 0, 'a missing catalog must never reset the stored artwork or save fallback data')
  await page.unrouteAll({ behavior: 'wait' })
  await page.click('#boot-retry')
  await page.waitForSelector('#preset-dd .dd-trigger')
  console.log('ok    failed metadata reads show the HTTP cause and retry; no editable fallback can overwrite state')

  for (const health of [{ version: '0.4.3', stateVersion: 3 }, { version: '0.4.6' }]) {
    await page.route('**/shader-skin/health', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ name: 'shadertoy-skin', ...health }) }))
    await page.goto(url)
    await page.waitForFunction(() => document.querySelector('#boot-message').textContent.includes('完全退出并重新启动 DSH'))
    assert.equal(await page.locator('#panel').isVisible(), false)
    assert.equal(writes, 0, 'a stale Host must not silently discard newly supported settings')
    await page.unrouteAll({ behavior: 'wait' })
  }
  console.log('ok    old live Hosts require a complete restart before editing new-version settings')

  await page.route('**/shader-skin/state', () => {})
  await page.goto(url)
  await page.waitForFunction(() => document.querySelector('#boot-message').textContent.includes('超过 8 秒'), null, { timeout: 12000 })
  assert.ok(await page.locator('#boot-retry').isVisible())
  await page.unrouteAll({ behavior: 'ignoreErrors' })
  console.log('ok    stalled Host reads have a bounded deadline and an actionable timeout message')

  await page.route('**/shader-skin/state', route => route.fulfill({ contentType: 'application/json', body: '{invalid' }))
  await page.goto(url)
  await page.waitForFunction(() => document.querySelector('#boot-message').textContent.includes('数据格式异常'))
  await page.unrouteAll({ behavior: 'wait' })
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }))
  await page.route('**/shader-skin/state', route => route.abort('internetdisconnected'))
  await page.goto(url)
  await page.waitForFunction(() => document.querySelector('#boot-message').textContent.includes('网络已断开'))
  assert.equal(writes, 0)
  assert.deepEqual(errors, [])
  console.log('ok    invalid data and confirmed offline states are reported distinctly, without unhandled errors')
} finally {
  await browser?.close()
  await h.close()
}
