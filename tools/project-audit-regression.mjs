import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile, mkdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { startHarness } from './browser-harness.mjs'

const h = await startHarness()
let browser, preview
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.env.CI ? 'chrome' : 'msedge'), headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] })
  const page = await browser.newPage({ viewport: { width: 1000, height: 850 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const load = async () => {
    await page.goto(h.url)
    await page.waitForSelector('iframe[title="ShaderToy 背景设置"]')
    const panel = page.frames().find(frame => frame.url().includes('panel.html'))
    await panel.waitForSelector('#preset-dd .dd-trigger')
    return panel
  }
  let panel = await load()
  const player = () => page.frames().find(frame => frame.url().includes('player.html'))
  const post = data => page.evaluate(data => document.querySelector('#shadertoy-skin-bg').contentWindow.postMessage(data, location.origin), data)
  const init = async (name, image, sound, params = {}) => {
    await post({ type: 'init', preset: { name, code: { image, sound } }, params: { loop: false, speed: 1, fps: 30, dim: 1, tint: '#000000', tintMix: 0, muted: true, audioMode: 'loop', audioDurationMode: 'auto', paused: false, ...params } })
    await player().waitForFunction(name => window.__player?.ready && window.__player.preset === name, name)
  }
  const pixel = () => player().evaluate(() => new Promise(resolve => {
    let remaining = 120
    const sample = () => {
    const gl = document.querySelector('canvas').getContext('webgl2')
    const bytes = new Uint8Array(4)
    gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
    if (bytes[0] || bytes[1] || bytes[2] || --remaining <= 0) resolve([...bytes])
    else requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  }))
  for (const [name, source] of [
    ['legacy-main', '\uFEFF// void main() {}\nvoid main();\nvoid main(){gl_FragColor=vec4(1);}'],
    ['modern-main', '#version 300 es\nuniform highp float iTime;\nout vec4 color;\nvoid mainImage(out vec4 c,in vec2 p){c=vec4(1);}\nvoid main(void){mainImage(color,gl_FragCoord.xy);}'],
    ['es1-main', 'void main(){gl_FragData[0]=vec4(1);}'],
  ]) {
    await init(name, source, undefined, { dim: .25, tintMix: .5 })
    const p = await pixel()
    assert.ok(p.slice(0, 3).every(v => Math.abs(v - 32) <= 2), `${name}: ${p}`)
  }
  console.log('ok    legacy/modern main(), mainImage helpers and ES1 fallback receive the actual brightness/tint filter')

  const image = 'void mainImage(out vec4 c,in vec2 p){c=vec4(.4,.5,.6,1);}'
  const sound = 'vec2 mainSound(int sampleIndex,float time){return vec2(sin(time*400.0)*.2);}'
  await init('pause-cursor', image, sound)
  await player().waitForFunction(() => window.__player.audio.chunks > 12)
  await post({ type: 'pause', paused: true })
  await player().waitForFunction(() => window.__player.audio.state === 'suspended')
  const pausedAt = await player().evaluate(() => window.__player.playback.musicTime)
  await post({ type: 'pause', paused: false })
  await player().waitForFunction(() => window.__player.audio.state === 'running')
  await post({ type: 'pause', paused: true })
  await player().waitForFunction(() => window.__player.audio.state === 'suspended')
  const pausedAgain = await player().evaluate(() => window.__player.playback.musicTime)
  assert.ok(Math.abs(pausedAgain - pausedAt) < .05, `unplayed lookahead must survive: ${pausedAt} -> ${pausedAgain}`)
  const duration = Math.max(1, pausedAgain + .25)
  await post({ type: 'params', params: { audioDurationMode: 'manual', audioSeconds: duration, audioMode: 'once', paused: false } })
  await player().waitForFunction(() => window.__player.audio.state === 'running')
  await player().waitForFunction(() => window.__player.audio.state === 'ended', null, { timeout: 5000 })
  assert.ok(Math.abs(await player().evaluate(() => window.__player.playback.musicTime) - duration) < .001)
  console.log('ok    pause/resume preserves unplayed music and duration changes rebuild the queued tail')

  // Failed paste imports keep the original input, and a generic state retry on
  // the code tab must never create an unexpected built-in copy.
  await page.route('**/shader-skin/state', route => route.request().method() === 'PUT' ? route.abort() : route.continue())
  await panel.click('#tab-library')
  await panel.fill('#paste-name', 'Pending import')
  await panel.fill('#paste-image', image)
  await panel.click('#paste-add')
  await panel.waitForFunction(() => !document.querySelector('#paste-error').hidden)
  assert.equal(await panel.inputValue('#paste-image'), image)
  await panel.click('#tab-code')
  await panel.waitForFunction(() => document.querySelector('#code-image').value.includes('mainImage'))
  const before = await panel.evaluate(() => document.querySelectorAll('#lib-list .item').length)
  await page.unroute('**/shader-skin/state')
  await panel.click('#note button')
  await panel.waitForFunction(() => document.querySelector('#note').textContent === '已保存')
  assert.equal(await panel.evaluate(() => document.querySelectorAll('#lib-list .item').length), before)
  console.log('ok    failed imports preserve input, and state retries never save unrelated editor code')

  // A delayed deletion owns its transaction. Activation/edits cannot race its
  // rollback or resurrect a removed entry through a later stale snapshot.
  const disk = () => readFile(join(h.home, 'shader-skin.json'), 'utf8').then(JSON.parse)
  let allowDelete, deleteStarted
  const gate = new Promise(resolve => { allowDelete = resolve })
  const started = new Promise(resolve => { deleteStarted = resolve })
  await page.route('**/shader-skin/state', async route => {
    if (route.request().method() !== 'PUT') return route.continue()
    deleteStarted()
    await gate
    await route.fulfill({ status: 500, body: 'simulated deletion failure' })
  })
  await panel.click('#tab-library')
  const row = panel.locator('#lib-list .item').filter({ hasText: 'Pending import' })
  page.once('dialog', dialog => dialog.accept())
  await row.getByRole('button', { name: '删除', exact: true }).click()
  await started
  assert.equal(await panel.evaluate(() => document.querySelector('#panel').inert), true)
  allowDelete()
  await panel.waitForFunction(() => !document.querySelector('#panel').inert)
  await page.unroute('**/shader-skin/state')
  assert.ok((await disk()).entries.some(entry => entry.name === 'Pending import'))
  panel = await load()
  await panel.click('#tab-library')
  assert.equal(await panel.locator('#lib-list .item').filter({ hasText: 'Pending import' }).count(), 1)
  console.log('ok    deletion is isolated and a failed deletion cannot reappear in the recovery journal')

  const downloaded = page.waitForEvent('download')
  await panel.locator('#lib-list .item').filter({ hasText: '马里奥' }).getByRole('button', { name: '导出', exact: true }).click()
  const download = await downloaded
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'))
  assert.equal(exported.license, 'CC BY-NC-SA 3.0')
  assert.ok(exported.author && exported.sourceUrl && exported.code.sound)
  const fileSaved = page.waitForResponse(response => response.url().endsWith('/state') && response.request().method() === 'PUT' && response.status() === 200)
  await panel.setInputFiles('#file-input', { name: 'roundtrip.json', mimeType: 'application/json', buffer: Buffer.from('\uFEFF' + JSON.stringify(exported)) })
  await fileSaved
  const reimported = (await disk()).entries.find(entry => entry.name === exported.name)
  for (const key of ['license', 'author', 'sourceUrl', 'licenseUrl']) assert.equal(reimported[key], exported[key])
  assert.deepEqual(reimported.code, exported.code)
  console.log('ok    artwork export/import round-trips both passes, author and original licence metadata')

  // Invalid localStorage recovery must not break an otherwise healthy config.
  await panel.evaluate(() => localStorage.setItem('shadertoy-skin.pending-state', JSON.stringify({ etag: null, state: { entries: null } })))
  panel = await load()
  assert.equal(await panel.locator('#preset-dd .dd-trigger').count(), 1)

  // The dev preview now shares the production import/path guard, and cannot
  // accidentally read or overwrite the real profile's state by default.
  const outside = join(h.home, 'outside')
  await mkdir(outside)
  await writeFile(join(outside, 'secret.txt'), 'not a preset')
  await mkdir(join(h.home, 'shader-skin', 'presets'), { recursive: true })
  await symlink(outside, join(h.home, 'shader-skin', 'presets', 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  preview = spawn(process.execPath, [fileURLToPath(new URL('./dev-server.mjs', import.meta.url)), '0'], { env: { ...process.env, DSH_HOME: h.home, DSH_DEV_STATE: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })
  const [output] = await once(preview.stdout, 'data')
  const url = String(output).match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]
  assert.ok(url, String(output))
  assert.equal((await fetch(`${url}/local/linked/secret.txt`)).status, 403)
  assert.equal((await fetch(`${url}/state`)).status, 403)
  assert.equal((await fetch(`${url}/shader-skin/state`)).status, 403)
  assert.equal((await fetch(`${url}/player.html`, { method: 'POST' })).status, 405)
  assert.equal((await fetch(`${url}/shader-skin/defaults.json`)).status, 200)
  console.log('ok    preview uses production directory boundaries and keeps profile persistence opt-in')
  assert.deepEqual(errors, [])
  console.log('project audit regressions ok')
} finally {
  if (preview) { const ended = once(preview, 'exit'); preview.kill(); await ended }
  await browser?.close()
  await h.close()
}
