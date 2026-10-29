import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { renderSize } from '../native-dist/project.js'
import { startHarness } from './browser-harness.mjs'

const h = await startHarness()
let browser
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.env.CI ? 'chrome' : 'msedge'), headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] })
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const url = `${h.url}/shader-skin/player.html?preset=aurora&watchdogMs=2000`
  await page.goto(url)
  await page.waitForFunction(() => window.__player?.ready)
  assert.equal(await page.evaluate(() => window.__player.isolated), true)
  assert.equal(await page.evaluate(() => {
    try { document.querySelector('canvas').getContext('webgl2'); return false } catch { return true }
  }), true, 'the interface thread must not own the WebGL context')
  await page.evaluate(() => {
    const preset = { name: 'deduplicated', code: { image: 'void mainImage(out vec4 c,in vec2 p){c=vec4(.3,.4,.5,1);}' } }
    for (let i = 0; i < 40; i++) window.postMessage({ type: 'init', preset, params: { dim: 1 } }, location.origin)
  })
  await page.waitForFunction(() => window.__player?.ready && window.__player.preset === 'deduplicated')
  assert.equal(await page.evaluate(() => window.__player.workerGeneration), 1)
  const generation = await page.evaluate(() => window.__player.workerGeneration)
  await page.evaluate(() => window.__player.inspect('lose-context'))
  await page.waitForFunction(g => window.__player?.ready && window.__player.workerGeneration > g, generation)
  await page.evaluate(() => window.__player.inspect('lose-context'))
  await page.waitForFunction(() => window.__player?.failure?.includes('重复崩溃'))
  console.log('ok    rendering is isolated, repeated init is coalesced, repeated GPU crashes trip the circuit breaker')

  // A deliberately blocked worker models a stuck compiler/readPixels. The
  // interface remains responsive while the watchdog terminates that thread.
  await page.route('**/render-worker.js?*', route => route.fulfill({ contentType: 'text/javascript', body: 'onmessage=()=>{while(true){}}' }))
  await page.goto(url)
  await page.evaluate(() => {
    const button = document.createElement('button'); button.id = 'alive'; button.textContent = 'alive'
    button.style = 'position:fixed;top:20px;left:20px;z-index:5'
    button.onclick = () => button.dataset.clicked = 'yes'; document.body.append(button)
  })
  await page.click('#alive')
  assert.equal(await page.getAttribute('#alive', 'data-clicked'), 'yes')
  await page.waitForFunction(() => window.__player?.failure && /无响应|初始化超时/.test(window.__player.failure), null, { timeout: 6000 })
  assert.ok((await page.evaluate(() => window.__outbox)).some(message => message.type === 'error' && message.stage === 'worker'))
  await page.unroute('**/render-worker.js?*')
  await page.route('**/player-runtime.js', route => route.fulfill({ contentType: 'text/javascript', body: 'await new Promise(()=>{})' }))
  await page.goto(url)
  await page.waitForFunction(() => window.__player?.failure?.includes('初始化超时'), null, { timeout: 6000 })
  await page.unroute('**/player-runtime.js')
  console.log('ok    a heartbeating worker with stalled asynchronous initialization also times out')
  await page.evaluate(() => window.postMessage({ type: 'init', preset: { name: 'recovered', code: { image: 'void mainImage(out vec4 c,in vec2 p){c=vec4(0,1,0,1);}' } }, params: { dim: 1, tintMix: 0, paused: false } }, location.origin))
  await page.waitForFunction(() => window.__player?.ready && window.__player.preset === 'recovered')
  const pixel = await page.evaluate(() => window.__player.inspect('pixel'))
  assert.ok(pixel[1] > 250 && pixel[0] < 5, String(pixel))

  // postMessage retries can be delivered out of order: an older init/params
  // revision must never override a newer one.
  await page.evaluate(() => {
    const post = (type, revision, body) => window.postMessage({ type, revision, ...body }, location.origin)
    post('init', 5, { preset: { name: 'revision-new', code: { image: 'void mainImage(out vec4 c,in vec2 p){c=vec4(0.,1.,0.,1.);}' } }, params: { dim: 1, tintMix: 0 } })
    post('init', 4, { preset: { name: 'revision-old', code: { image: 'void mainImage(out vec4 c,in vec2 p){c=vec4(1.,0.,0.,1.);}' } }, params: { dim: 1, tintMix: 0 } })
  })
  await page.waitForFunction(() => window.__player?.preset === 'revision-new' && window.__player.ready)
  assert.equal(await page.evaluate(() => window.__player.preset), 'revision-new', 'a stale init must not win')
  await page.evaluate(() => window.postMessage({ type: 'params', revision: 2, params: { dim: 0 } }, location.origin))
  await page.waitForTimeout(250)
  const dimmed = await page.evaluate(() => window.__player.inspect('pixel'))
  assert.ok(dimmed[1] < 5, `a newer params update must apply: ${dimmed}`)
  await page.evaluate(() => window.postMessage({ type: 'params', revision: 1, params: { dim: 1 } }, location.origin))
  await page.waitForTimeout(250)
  const stillDim = await page.evaluate(() => window.__player.inspect('pixel'))
  assert.ok(stillDim[1] < 5, `a stale params update must be ignored: ${stillDim}`)
  console.log('ok    out-of-order init/params revisions are ignored')
  const size = renderSize(16000, 9000, 3, 2)
  assert.ok(size.width * size.height <= 8 * 1024 * 1024)
  assert.ok(size.width <= 8192 && size.height <= 8192)
  await writeFile(join(h.home, 'shader-skin.safe'), '')
  const safePage = await browser.newPage()
  let renderRequested = false
  safePage.on('request', request => { if (/player.html|render-worker.js/.test(request.url())) renderRequested = true })
  const safeCheck = safePage.waitForResponse(response => response.url().endsWith('/shader-skin/safe-mode'))
  await safePage.goto(h.url)
  await safeCheck
  await safePage.waitForTimeout(500)
  assert.equal(renderRequested, false)
  assert.equal(await safePage.locator('#shadertoy-skin-bg').count(), 0)
  assert.equal(await safePage.locator('#shadertoy-skin-glass-style').count(), 0)
  console.log('ok    extreme viewport sizes respect the pixel budget and safe mode never starts a renderer')

  // A missing/broken output device used to stop the whole renderer ("声音设备
  // 异常" went through stop()). It must only disable sound; the wallpaper keeps
  // rendering and the failure is reported as an audio state instead.
  const audioPage = await browser.newPage({ viewport: { width: 640, height: 360 } })
  const audioPageErrors = []
  audioPage.on('pageerror', error => audioPageErrors.push(error.message))
  await audioPage.addInitScript(() => {
    class BrokenAudioContext { constructor() { throw new Error('no output device') } }
    Object.defineProperty(window, 'AudioContext', { configurable: true, get: () => BrokenAudioContext })
  })
  await audioPage.goto(`${h.url}/shader-skin/player.html?preset=pulse`)
  await audioPage.waitForFunction(() => window.__player?.ready && window.__player.frames > 5, null, { timeout: 30000 })
  const audioMessages = await audioPage.evaluate(() => window.__outbox.filter(message => message.type === 'audio'))
  assert.ok(audioMessages.some(message => message.state === 'error'), 'a broken device must surface as an audio error')
  assert.equal(await audioPage.evaluate(() => window.__player.isolated), true)
  assert.deepEqual(audioPageErrors, [])
  await audioPage.close()
  console.log('ok    a failing audio device is reported without stopping the renderer')
  assert.deepEqual(errors, [])
  console.log('ok    a stuck worker cannot block interface clicks, times out and recovers on project switch')
} finally { await browser?.close(); await h.close() }
