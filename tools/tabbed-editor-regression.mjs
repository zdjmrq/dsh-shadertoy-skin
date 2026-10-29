import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { startHarness } from './browser-harness.mjs'

const h = await startHarness()
let browser
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.env.CI ? 'chrome' : 'msedge'), headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(h.url)
  await page.waitForSelector('iframe[title="ShaderToy 背景设置"]')
  let panel = page.frames().find(frame => frame.url().includes('panel.html'))
  await panel.waitForSelector('#preset-dd .dd-trigger')
  const disk = async () => JSON.parse(await readFile(join(h.home, 'shader-skin.json'), 'utf8'))
  const image = 'void mainImage(out vec4 c,in vec2 p){c=vec4(.5);}'
  await panel.click('#tab-library')
  assert.deepEqual(await panel.locator('#paste-tabs [role=tab]').allTextContents(), ['Image', 'Sound'])
  assert.equal(await panel.locator('#paste-workspace textarea:visible').count(), 1)
  await panel.fill('#paste-name', 'Tabbed import')
  await panel.fill('#paste-image', image)
  await panel.click('#paste-tabs [data-file=sound]')
  await panel.fill('#paste-sound', 'vec2 mainSound(float t){return vec2(0.0);}')
  await panel.click('#paste-new')
  await panel.fill('#paste-filename', 'Common.glsl')
  await panel.press('#paste-filename', 'Enter')
  await panel.locator('#paste-extra-files [data-project-file=common]').fill('float shared(){return .5;}')
  await panel.click('#paste-new')
  await panel.fill('#paste-filename', 'Buffer A.glsl')
  await panel.click('#paste-create')
  await panel.locator('#paste-extra-files textarea:visible').fill(image)
  await panel.click('#paste-tabs [data-file=image]')
  assert.equal(await panel.inputValue('#paste-image'), image)
  await panel.click('#paste-channel-details summary')
  await panel.selectOption('#paste-channels select >> nth=0', 'buffer:A')
  await panel.click('#paste-tabs [data-file=common]')
  await panel.press('#paste-tabs [data-file=common]', 'Home')
  assert.equal(await panel.getAttribute('#paste-tabs [data-file=image]', 'aria-selected'), 'true')
  await page.reload()
  await page.waitForSelector('iframe[title="ShaderToy 背景设置"]')
  panel = page.frames().find(frame => frame.url().includes('panel.html'))
  await panel.waitForSelector('#preset-dd .dd-trigger')
  await panel.click('#tab-library')
  assert.equal(await panel.inputValue('#paste-image'), image)
  assert.equal(await panel.inputValue('#paste-extra-files [data-project-file=common]'), 'float shared(){return .5;}')
  await panel.click('#paste-add')
  await panel.waitForFunction(() => document.querySelector('#note').textContent.includes('已加入'))
  assert.equal((await disk()).entries[0].code.channels.image[0], 'buffer:A')
  assert.deepEqual(await panel.locator('#paste-tabs [role=tab]').allTextContents(), ['Image', 'Sound'])
  console.log('ok    paste: single visible editor, default tabs, new passes, channel wiring, keyboard navigation and draft recovery')

  await panel.click('#tab-code')
  await panel.waitForSelector('#project-tabs [data-file=common]')
  assert.equal(await panel.locator('#code-workspace textarea:visible').count(), 1)
  assert.equal(await panel.locator('#project-tabs [data-file=all]').count(), 0)
  await panel.locator('#code-image').evaluate(area => { area.focus(); area.setSelectionRange(12, 18); area.scrollTop = 15 })
  await panel.click('#project-tabs [data-file=sound]')
  assert.equal(await panel.locator('#code-workspace textarea:visible').count(), 1)
  await panel.click('#project-tabs [data-file=image]')
  assert.deepEqual(await panel.locator('#code-image').evaluate(area => [area.selectionStart, area.selectionEnd]), [12, 18])
  await panel.click('#project-new')
  await panel.fill('#project-filename', 'helper.glsl')
  await panel.click('#project-create')
  await panel.locator('#code-extra-files [data-project-file="includes:helper.glsl"]').fill('float helper(){return .7;}')
  await panel.click('#code-save')
  await panel.waitForFunction(() => document.querySelector('#code-note').textContent.includes('已保存'))
  assert.ok((await disk()).entries[0].code.includes['helper.glsl'].includes('.7'))
  await panel.click('#project-tabs [data-file=common]')
  assert.ok((await panel.inputValue('#code-extra-files [data-project-file=common]')).includes('shared'))
  console.log('ok    code: one visible file, no all-files mode, preserved cursor/content and whole-project save')

  // Reserve the real browser's shared keepalive budget. A second keepalive
  // request of 10 KiB must fail; the ordinary save must still reach the Host.
  let releaseQuota, quotaStarted
  const quotaGate = new Promise(resolve => { releaseQuota = resolve })
  const quotaReady = new Promise(resolve => { quotaStarted = resolve })
  await page.route('**/quota', async route => { quotaStarted(); await quotaGate; await route.fulfill({ body: 'ok' }) })
  await panel.evaluate(() => { window.quotaRequest = fetch('/quota', { method: 'POST', body: 'x'.repeat(60000), keepalive: true }).catch(() => null) })
  await quotaReady
  assert.equal(await panel.evaluate(() => fetch('/quota-overflow', { method: 'POST', body: 'x'.repeat(10000), keepalive: true }).then(() => false, () => true)), true)
  await panel.click('#project-tabs [data-file=image]')
  await panel.fill('#code-image', image + '\n//' + 'a'.repeat(10000))
  await panel.click('#code-save')
  await panel.waitForFunction(() => document.querySelector('#code-note').textContent.includes('已保存'))
  assert.ok((await disk()).entries[0].code.image.length > 10000)
  releaseQuota(); await panel.evaluate(() => window.quotaRequest)
  console.log('ok    reproduced 64 KiB keepalive exhaustion; ordinary saves still succeed')

  let calls = 0, writtenTag, writtenBody
  const ids = []
  await page.route('**/shader-skin/state', async route => {
    if (route.request().method() !== 'PUT') return route.continue()
    ids.push(route.request().headers()['x-shader-save-id'])
    if (++calls === 1) {
      const response = await route.fetch()
      assert.equal(response.status(), 200)
      writtenTag = response.headers().etag
      writtenBody = await readFile(join(h.home, 'shader-skin.json'), 'utf8')
      await route.abort('failed') // simulate losing only the proxy response
    } else {
      const response = await route.fetch()
      assert.equal(response.status(), 200)
      assert.equal(response.headers().etag, writtenTag)
      await route.fulfill({ response })
    }
  })
  await panel.click('#tab-params')
  await panel.fill('#glass', '43')
  await panel.waitForFunction(() => document.querySelector('#note').textContent === '已保存')
  assert.equal(calls, 2)
  assert.ok(ids[0] && ids[0] === ids[1])
  assert.equal(await readFile(join(h.home, 'shader-skin.json'), 'utf8'), writtenBody)
  await page.unroute('**/shader-skin/state')
  console.log('ok    a lost successful response is retried with one receipt, unchanged ETag/disk, and no false conflict')

  let attempts = 0
  await page.route('**/shader-skin/state', route => {
    if (route.request().method() !== 'PUT') return route.continue()
    attempts++; return route.abort('failed')
  })
  await panel.fill('#glass', '44')
  await panel.waitForFunction(() => document.querySelector('#note').textContent.includes('连接中断'))
  assert.equal(attempts, 2, 'bounded retry rather than an automatic infinite loop')
  assert.equal((await disk()).overrides[(await disk()).activeId].glass, 43)
  assert.ok(await panel.evaluate(() => localStorage.getItem('shadertoy-skin.pending-state')))
  await page.unroute('**/shader-skin/state')
  await panel.click('#note button')
  await panel.waitForFunction(() => document.querySelector('#note').textContent === '已保存')
  assert.equal((await disk()).overrides[(await disk()).activeId].glass, 44)
  console.log('ok    persistent failure stops after two attempts, preserves recovery and supports manual retry')

  for (const [status, body, expected] of [[404, 'missing route', '保存路由不存在'], [403, 'forbidden', '没有保存权限'], [500, 'state write failed (ENOSPC)', '磁盘空间不足'], [503, 'unavailable', 'Host 服务暂不可用']]) {
    await page.route('**/shader-skin/state', route => route.request().method() === 'PUT' ? route.fulfill({ status, body }) : route.continue())
    await panel.fill('#glass', String(status % 60 + 25))
    await panel.waitForFunction(expected => document.querySelector('#note').textContent.includes(expected), expected)
    assert.match(await panel.textContent('#note'), new RegExp(`HTTP ${status}`))
    await page.unroute('**/shader-skin/state')
  }
  await page.context().setOffline(true)
  await panel.fill('#glass', '45')
  await panel.waitForFunction(() => document.querySelector('#note').textContent.includes('网络已断开'))
  await page.context().setOffline(false)
  await panel.click('#note button')
  await panel.waitForFunction(() => document.querySelector('#note').textContent === '已保存')
  console.log('ok    offline network, missing route, permission, disk capacity and temporary Host failure have distinct actionable errors')

  // Headers arrive, but the error body never closes. Exercise the real abort
  // signal with an accelerated deadline; the save queue must still settle.
  await panel.evaluate(() => {
    window.__actualFetch = window.fetch
    window.__actualTimeout = window.setTimeout
    window.setTimeout = (fn, ms, ...args) => window.__actualTimeout(fn, ms === 12000 ? 120 : ms, ...args)
    window.fetch = async (url, options) => {
      if (options?.method !== 'PUT') return window.__actualFetch(url, options)
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode('state write failed (ENOSPC)'))
        options.signal.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')), { once: true })
      } }), { status: 500 })
    }
  })
  await panel.fill('#glass', '46')
  await panel.waitForFunction(() => document.querySelector('#note').textContent.includes('磁盘空间不足'))
  assert.equal((await disk()).overrides[(await disk()).activeId].glass, 45)
  await panel.evaluate(() => { window.fetch = window.__actualFetch; window.setTimeout = window.__actualTimeout })
  await panel.click('#note button')
  await panel.waitForFunction(() => document.querySelector('#note').textContent === '已保存')
  assert.equal((await disk()).overrides[(await disk()).activeId].glass, 46)
  console.log('ok    stalled error bodies retain HTTP/storage causes, respect the request deadline and release the save queue')

  const shots = new URL('../.tmp-validation/tabbed-editor/', import.meta.url)
  await mkdir(shots, { recursive: true })
  for (const dark of [true, false]) {
    await page.evaluate(dark => document.body.toggleAttribute('data-ds-dark-theme', dark), dark)
    await panel.waitForFunction(dark => document.documentElement.dataset.theme === (dark ? 'dark' : 'light'), dark)
    await panel.click('#tab-code')
    await panel.click('#project-tabs [data-file=image]')
    await page.screenshot({ path: new URL(`${dark ? 'dark' : 'light'}-code.png`, shots).pathname.replace(/^\/([A-Za-z]:)/, '$1') })
    await panel.click('#tab-library')
    await panel.locator('#paste-workspace').scrollIntoViewIfNeeded()
    await page.screenshot({ path: new URL(`${dark ? 'dark' : 'light'}-paste.png`, shots).pathname.replace(/^\/([A-Za-z]:)/, '$1') })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  for (const tab of ['code', 'library']) {
    await panel.click(`#tab-${tab}`)
    assert.ok(await panel.evaluate(() => document.body.scrollWidth <= innerWidth), tab)
  }
  assert.deepEqual(errors, [])
  console.log('tabbed editor and save regressions ok')
} finally { await browser?.close(); await h.close() }
