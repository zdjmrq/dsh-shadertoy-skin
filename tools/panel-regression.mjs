import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { startHarness } from './browser-harness.mjs'

const harness = await startHarness()
let browser
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.env.CI ? 'chrome' : 'msedge'), headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(harness.url)
  await page.waitForSelector('iframe[title="ShaderToy 背景设置"]')
  const frame = page.frames().find(frame => frame.url().includes('panel.html'))
  await frame.waitForSelector('#preset-dd .dd-trigger')
  const builtinCount = await frame.locator('#lib-list .item').count()
  const player = () => page.frames().find(frame => frame.url().includes('player.html'))
  const running = async id => {
    await player().waitForFunction(id => {
      const text = document.querySelector('#diag').textContent
      return text.includes('running') && text.includes(`shader=${id === 'flow' ? '流体色带' : '极光'}`)
    }, id)
  }
  await running('aurora')
  for (const id of ['flow', 'aurora', 'flow', 'aurora', 'flow', 'aurora']) {
    await page.evaluate(() => window.__messages = [])
    await frame.click('#preset-dd .dd-trigger')
    await frame.locator('#preset-dd .dd-item').nth(id === 'aurora' ? 0 : 1).click()
    await running(id)
  }
  console.log('ok    more than four real client preset switches keep initializing')

  let releaseSlowShader
  let markSlowShader
  const slowShader = new Promise(resolve => { releaseSlowShader = resolve })
  const requestedSlowShader = new Promise(resolve => { markSlowShader = resolve })
  const delayShader = async route => { markSlowShader(); await slowShader; await route.continue() }
  await page.route('**/presets/flow.glsl', delayShader)
  await frame.click('#preset-dd .dd-trigger')
  await frame.locator('#preset-dd .dd-item').nth(1).click()
  await requestedSlowShader
  await frame.click('#preset-dd .dd-trigger')
  await frame.locator('#preset-dd .dd-item').nth(0).click()
  await running('aurora')
  releaseSlowShader()
  await page.waitForTimeout(200)
  assert.match(await player().textContent('#diag'), /shader=极光/)
  await page.unroute('**/presets/flow.glsl', delayShader)
  console.log('ok    a stale slow shader response cannot replace the latest selection')

  let concurrentWrites = 0
  let maximumWrites = 0
  const delayedWrite = async route => {
    if (route.request().method() !== 'PUT') return route.continue()
    maximumWrites = Math.max(maximumWrites, ++concurrentWrites)
    await new Promise(resolve => setTimeout(resolve, 500))
    const response = await route.fetch()
    concurrentWrites--
    await route.fulfill({ response })
  }
  await page.route('**/shader-skin/state', delayedWrite)
  await frame.fill('#glass', '41')
  await page.waitForTimeout(380)
  await frame.fill('#glass', '63')
  await page.waitForTimeout(1300)
  assert.equal(maximumWrites, 1)
  assert.equal(JSON.parse(await readFile(join(harness.home, 'shader-skin.json'), 'utf8')).overrides[JSON.parse(await readFile(join(harness.home, 'shader-skin.json'), 'utf8')).activeId].glass, 63)
  await page.unroute('**/shader-skin/state', delayedWrite)
  console.log('ok    overlapping autosaves are serialized and the last value reaches disk')

  await frame.click('#tab-code')
  await frame.waitForFunction(() => document.querySelector('#code-image').value.includes('mainImage'))
  const original = await frame.inputValue('#code-image')
  const draft = original + '\n// preserve my draft'
  await frame.fill('#code-image', draft)
  await frame.click('#tab-params')
  await frame.click('#tab-code')
  await frame.waitForFunction(() => document.querySelector('#code-image').value.includes('preserve my draft'))
  assert.equal(await frame.inputValue('#code-image'), draft)
  console.log('ok    switching tabs preserves unsaved code')

  const failWrites = async route => route.request().method() === 'PUT' ? route.fulfill({ status: 500, body: 'test failure' }) : route.continue()
  await page.route('**/shader-skin/state', failWrites)
  await frame.click('#code-save')
  await frame.waitForFunction(() => document.querySelector('#code-note').textContent.includes('保存失败'))
  assert.equal(await frame.inputValue('#code-image'), draft)
  assert.equal(await frame.locator('#lib-list .item').count(), builtinCount)
  console.log('ok    failed writes keep the draft, report failure and roll back the fork')
  await page.unroute('**/shader-skin/state', failWrites)
  await frame.click('#code-save')
  await frame.waitForFunction(() => document.querySelector('#code-note').textContent.includes('副本'))
  const stored = JSON.parse(await readFile(join(harness.home, 'shader-skin.json'), 'utf8'))
  assert.equal(stored.entries.length, 1)
  assert.equal(stored.entries[0].code.image, draft)
  assert.equal(stored.activeId, stored.entries[0].id)
  console.log('ok    retry saves the code to disk and activates exactly one copy')

  const persisted = await frame.inputValue('#code-image')
  await frame.fill('#code-image', persisted + '\n// discard me')
  await frame.click('#code-revert')
  await frame.waitForFunction(() => !document.querySelector('#code-image').value.includes('discard me'))
  assert.equal(await frame.inputValue('#code-image'), persisted)
  console.log('ok    explicit revert discards the draft')

  await frame.click('#tab-library')
  const common = 'float commonValue() { return 0.5; }'
  const image = 'void mainImage(out vec4 c, in vec2 p) { c = vec4(commonValue()); }'
  await frame.setInputFiles('#file-input', { name: 'common.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ renderpass: [
    { type: 'common', code: common }, { type: 'image', code: image },
    { type: 'sound', code: 'vec2 mainSound(float t) { return vec2(commonValue()); }' },
  ] })) })
  await frame.waitForFunction(count => document.querySelectorAll('#lib-list .item').length === count + 2, builtinCount)
  await frame.waitForFunction(() => document.querySelector('#note').textContent.includes('已保存'))
  const imported = JSON.parse(await readFile(join(harness.home, 'shader-skin.json'), 'utf8')).entries.at(-1)
  assert.equal(imported.code.image, image)
  assert.equal(imported.code.common.trim(), common)
  assert.ok(imported.code.sound.includes('mainSound'))
  console.log('ok    Common, Image and Sound are preserved as independently editable files')

  await frame.setInputFiles('#file-input', { name: 'cubemap.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ renderpass: [{ type: 'cubemap', code: image }, { type: 'image', code: image }] })) })
  await frame.waitForFunction(() => document.querySelector('#note').textContent.includes('暂不支持'))
  assert.equal(await frame.locator('#lib-list .item').count(), builtinCount + 2)
  console.log('ok    unsupported Cubemap imports show a clear error and do not add broken entries')

  // An invalid shader must leave the previous GPU program rendering.
  const oldFrames = await player().evaluate(() => Number(/frames=(\d+)/.exec(document.querySelector('#diag').textContent)?.[1]))
  await page.evaluate(() => document.querySelector('#shadertoy-skin-bg').contentWindow.postMessage({ type: 'init', preset: { name: 'broken', code: { image: 'void mainImage(out vec4 c,in vec2 p) { c = DOES_NOT_EXIST; }' } } }, location.origin))
  await page.waitForFunction(() => window.__messages.some(m => m.type === 'error' && m.stage === 'compile'))
  await player().waitForFunction(old => Number(/frames=(\d+)/.exec(document.querySelector('#diag').textContent)?.[1]) > old + 5, oldFrames)
  console.log('ok    compile errors report diagnostics while the previous image continues rendering')
  assert.deepEqual(errors, [])
  console.log('panel regressions ok (real client + panel + WebGL2 + disk persistence)')
} finally {
  await browser?.close()
  await harness.close()
}
