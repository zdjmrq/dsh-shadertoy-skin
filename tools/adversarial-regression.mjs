// Adversarial regressions: malformed Host state, hostile shader sources, bogus
// interaction messages and rapid preset churn. The player must keep the previous
// image, reject input with an actionable error and never take the renderer or the
// settings page down with it. Deterministic on purpose: no random fuzzing seeds
// change between runs.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { startHarness } from './browser-harness.mjs'

const h = await startHarness()
let browser
const pixelGreen = pixel => pixel[0] < 5 && pixel[1] > 250

try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.env.CI ? 'chrome' : 'msedge'), headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] })

  // ------------------------------------------------------------------ Host input
  const api = await browser.newPage()
  const put = (body, headers = {}) => api.request.put(`${h.url}/shader-skin/state`, {
    data: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  })
  const empty = { version: 3, activeId: null, entries: [], overrides: {}, settings: {} }

  assert.equal((await put('{not json')).status(), 400, 'malformed JSON must be rejected')
  assert.equal((await put(empty, { 'content-type': 'text/plain' })).status(), 415, 'wrong content type must be rejected')
  assert.equal((await put({ ...empty, entries: [{ id: 'a', code: { image: 'void mainImage(out vec4 c,in vec2 p){c=vec4(1.);}' } }, { id: 'a', code: { image: 'void mainImage(out vec4 c,in vec2 p){c=vec4(1.);}' } }] })).status(), 400, 'duplicate ids must be rejected')
  assert.equal((await put({ ...empty, entries: [{ id: 'big', code: { image: 'x'.repeat(1_600_000) } }] })).status(), 400, 'oversized shader code must be rejected')
  assert.equal((await put({ ...empty, entries: [{ id: 'buf', code: { image: 'void mainImage(out vec4 c,in vec2 p){c=vec4(1.);}', buffers: { A: 'x', B: 'x', C: 'x', D: 'x', E: 'x' } } }] })).status(), 400, 'more than four buffers must be rejected')
  assert.equal((await put({ ...empty, entries: [{ id: 'chan', code: { image: 'void mainImage(out vec4 c,in vec2 p){c=vec4(1.);}', channels: { image: ['buffer:D'] } } }] })).status(), 400, 'channels must reference existing resources')
  // Include cycles are expanded by the player, not the Host: storing them is
  // allowed (the state file is user data), but the renderer must reject them —
  // covered by the hostile-GLSL section below.
  assert.equal((await put({ ...empty, entries: [{ id: 'inc', code: { image: '#include "a.glsl"', includes: { 'a.glsl': '#include "b.glsl"', 'b.glsl': '#include "a.glsl"' } } }] })).status(), 200)
  assert.equal((await put({ ...empty, entries: [{ id: 'asset', code: { image: 'void mainImage(out vec4 c,in vec2 p){c=vec4(1.);}', assets: { 'x.png': 'data:image/png;base64,!!!' } } }] })).status(), 400, 'invalid image payloads must be rejected')
  const oversized = await put(`{"version":3,"entries":[],"overrides":{},"settings":{},"junk":"${'x'.repeat(2_100_000)}"}`)
  assert.equal(oversized.status(), 413, 'payloads over 2 MB must be rejected before parsing')

  // Prototype-polluting keys arrive as own JSON properties; nothing may reach
  // Object.prototype and the settings page must still boot from the saved file.
  await writeFile(join(h.home, 'shader-skin.json'), JSON.stringify({
    version: 3, activeId: 'proto', settings: { enabled: true, glass: 61 },
    entries: [{ id: 'proto', name: 'proto', code: { image: 'void mainImage(out vec4 c,in vec2 p){c=vec4(.2,.4,.6,1.);}' } }],
    overrides: JSON.parse('{"proto":{"glass":70,"__proto__":{"polluted":true}},"__proto__":{"glass":5}}'),
  }))
  const shell = await browser.newPage()
  const shellErrors = []
  shell.on('pageerror', error => shellErrors.push(error.message))
  await shell.goto(h.url)
  await shell.waitForSelector('iframe[title="ShaderToy 背景设置"]')
  const panel = await shell.waitForFunction(() => {
    const frame = document.querySelector('iframe[title="ShaderToy 背景设置"]')
    return frame?.contentWindow?.document?.querySelector('#preset-dd .dd-trigger') ? true : false
  }).then(() => shell.frames().find(frame => frame.url().includes('panel.html')))
  await panel.waitForSelector('#preset-dd .dd-trigger')
  assert.equal(await shell.evaluate(() => ({}).polluted), undefined, 'parent prototype must stay clean')
  assert.equal(await panel.evaluate(() => ({}).polluted), undefined, 'panel prototype must stay clean')
  assert.deepEqual(shellErrors, [])
  console.log('ok    malformed Host payloads are rejected; prototype-polluting keys never leak into either page')

  // Stale ids and ETags: a replay with the old revision must conflict, a fresh
  // one must win, and ids are bounded before they reach the client.
  const first = await put({ ...empty, activeId: 'e'.repeat(400), entries: [{ id: 'e'.repeat(400), code: { image: 'void mainImage(out vec4 c,in vec2 p){c=vec4(1.);}' } }] })
  assert.equal(first.status(), 200)
  const stored = await (await api.request.get(`${h.url}/shader-skin/state`)).json()
  assert.ok(stored.activeId.length <= 200 && stored.entries[0].id.length <= 200, 'entry ids must be bounded')
  const etag = (await api.request.get(`${h.url}/shader-skin/state`)).headers()['etag']
  assert.equal((await put({ ...empty, settings: { glass: 50 } }, { 'if-match': '"stale"' })).status(), 409)
  assert.equal((await put({ ...empty, settings: { glass: 50 } }, { 'if-match': etag })).status(), 200)
  assert.equal((await api.request.get(`${h.url}/shader-skin/..%2findex.js`)).status(), 403, 'encoded traversal must be refused')

  // Twelve writers sharing one ETag: the queued atomic writes may let exactly
  // one win, everyone else must conflict instead of silently overwriting.
  assert.equal((await put({ ...empty })).status(), 200)
  const baseEtag = (await api.request.get(`${h.url}/shader-skin/state`)).headers()['etag']
  const writers = await Promise.all(Array.from({ length: 12 }, () => put({ ...empty, settings: { glass: 55 } }, { 'if-match': baseEtag })))
  const writerStatuses = writers.map(response => response.status())
  assert.equal(writerStatuses.filter(status => status === 200).length, 1, `exactly one writer may win: ${writerStatuses}`)
  assert.equal(writerStatuses.filter(status => status === 409).length, 11, `the rest must conflict: ${writerStatuses}`)
  assert.equal((await (await api.request.get(`${h.url}/shader-skin/state`)).json()).settings.glass, 55, 'the winner must be persisted')
  console.log('ok    ids are bounded, stale ETags conflict, concurrent writers cannot silently overwrite and traversal is refused')

  // -------------------------------------------------------------- hostile GLSL
  const player = await browser.newPage({ viewport: { width: 480, height: 320 } })
  const playerErrors = []
  player.on('pageerror', error => playerErrors.push(error.message))
  await player.goto(`${h.url}/shader-skin/player.html?preset=aurora&muted=1&fps=20`)
  await player.waitForFunction(() => window.__player?.ready)
  const generation = await player.evaluate(() => window.__player.workerGeneration)
  const init = (code, name, extra = {}) => player.evaluate(({ code, name, extra }) =>
    window.postMessage({ type: 'init', preset: { name, code }, params: { dim: 1, tintMix: 0, muted: 1, ...extra } }, location.origin), { code, name, extra })
  const waitSettled = async (name) => {
    const baseline = await player.evaluate(() => (window.__outbox ?? []).filter(message => message.type === 'error').length)
    await player.waitForFunction(({ expected, baseline }) => {
      const errors = (window.__outbox ?? []).filter(message => message.type === 'error').length
      return window.__player?.ready && (window.__player.preset === expected || errors > baseline)
    }, { expected: name, baseline }, { timeout: 30000 })
  }

  await init({ image: 'void mainImage(out vec4 c,in vec2 p){c=vec4(0.,1.,0.,1.);}' }, 'adversarial-base')
  await player.waitForFunction(() => window.__player?.preset === 'adversarial-base' && window.__player.ready)
  const basePixel = await player.evaluate(() => window.__player.inspect('pixel'))
  assert.ok(pixelGreen(basePixel), `base image: ${basePixel}`)

  const badImages = [
    ['truncated', { image: 'void mainImage(out vec4 c,in vec2 p){c=vec4(' }],
    ['random tokens', { image: '/* fuzz */ @@@ ### $ !!! }{ ;;; vec4 mainImage' }],
    ['metadata junk', { image: 'void mainImage(out vec4 c,in vec2 p){c=vec4(1.);}', buffers: { A: 'x', B: 'x', C: 'x', D: 'x', E: 'x' } }],
    ['missing include', { image: '#include "missing.glsl"\nvoid mainImage(out vec4 c,in vec2 p){c=vec4(1.);}' }],
    ['include cycle', { image: '#include "a.glsl"', includes: { 'a.glsl': '#include "b.glsl"', 'b.glsl': '#include "a.glsl"' } }],
    ['dangling channel', { image: 'void mainImage(out vec4 c,in vec2 p){c=vec4(1.);}', channels: { image: ['buffer:D'] } }],
  ]
  for (const [label, code] of badImages) {
    const framesBefore = await player.evaluate(() => window.__player.frames)
    await init(code, `bad-${label}`)
    await waitSettled(`bad-${label}`)
    await player.waitForTimeout(250)
    const state = await player.evaluate(() => ({ preset: window.__player.preset, frames: window.__player.frames, generation: window.__player.workerGeneration, ready: window.__player.ready }))
    assert.equal(state.generation, generation, `${label}: the renderer must not restart`)
    assert.ok(state.frames > framesBefore, `${label}: frames must keep advancing on the previous image`)
    const pixel = await player.evaluate(() => window.__player.inspect('pixel'))
    assert.ok(pixelGreen(pixel), `${label}: the previous image must survive (${pixel})`)
  }
  console.log('ok    malformed projects are rejected while the previous shader keeps rendering')

  // Valid-but-hostile shaders: huge comments are fine, NaN/Inf outputs are
  // clamped by the GL, and a broken sound pass must not take the image down.
  await init({ image: `${'// filler\n'.repeat(20_000)}void mainImage(out vec4 c,in vec2 p){c=vec4(0.,1.,0.,1.);}` }, 'huge-comments')
  await player.waitForFunction(() => window.__player?.preset === 'huge-comments' && window.__player.ready, null, { timeout: 30000 })
  assert.ok(pixelGreen(await player.evaluate(() => window.__player.inspect('pixel'))))

  await init({ image: 'void mainImage(out vec4 c,in vec2 p){c=vec4(1./0.,0./0.,-1./0.,1.);}' }, 'nan-inf')
  await player.waitForFunction(() => window.__player?.preset === 'nan-inf' && window.__player.ready, null, { timeout: 30000 })
  await player.waitForTimeout(300)
  assert.ok((await player.evaluate(() => window.__player.frames)) > 0)

  await init({ image: 'void mainImage(out vec4 c,in vec2 p){c=vec4(0.,1.,0.,1.);}', sound: 'float mainSound(float t){return t==t?1e30:0.;}' }, 'nan-sound')
  await player.waitForFunction(() => window.__player?.preset === 'nan-sound' && window.__player.ready, null, { timeout: 30000 })
  await player.waitForTimeout(300)
  assert.ok(pixelGreen(await player.evaluate(() => window.__player.inspect('pixel'))), 'a broken sound pass must not hide the image')

  await init({ image: 'void mainImage(out vec4 c,in vec2 p){c=vec4(0.,1.,0.,1.);}', sound: '// no mainSound here' }, 'silent-broken-sound')
  await player.waitForFunction(() => window.__player?.preset === 'silent-broken-sound' && window.__player.ready, null, { timeout: 30000 })
  assert.ok(pixelGreen(await player.evaluate(() => window.__player.inspect('pixel'))))
  console.log('ok    huge sources, NaN/Inf output and broken sound passes stay contained')

  // ------------------------------------------------- audio device loss mid-play
  // A crash-prone environment can lose the output device while a piece plays:
  // the audio pipeline must fail loudly but the picture must keep going.
  const audioPage = await browser.newPage({ viewport: { width: 320, height: 200 } })
  const audioErrors = []
  audioPage.on('pageerror', error => audioErrors.push(error.message))
  await audioPage.addInitScript(() => {
    const RealContext = window.AudioContext
    window.__breakAudio = false
    const original = RealContext.prototype.createBufferSource
    RealContext.prototype.createBufferSource = function (...args) {
      if (window.__breakAudio) throw new Error('device removed')
      return original.apply(this, args)
    }
  })
  await audioPage.goto(`${h.url}/shader-skin/player.html?preset=take-on-me&scale=0.5&fps=20`)
  await audioPage.waitForFunction(() => window.__player?.ready, null, { timeout: 60000 })
  await audioPage.waitForFunction(() => window.__player.audio.state === 'running', null, { timeout: 30000 })
  const audioFrames = await audioPage.evaluate(() => window.__player.frames)
  await audioPage.evaluate(() => { window.__breakAudio = true })
  await audioPage.waitForFunction(() => ['error', 'suspended'].includes(window.__player.audio.state), null, { timeout: 30000 })
  await audioPage.waitForTimeout(600)
  const audioState = await audioPage.evaluate(() => ({ frames: window.__player.frames, ready: window.__player.ready, audio: window.__player.audio.state }))
  assert.equal(audioState.ready, true, `the player must survive the device loss: ${JSON.stringify(audioState)}`)
  assert.ok(audioState.frames > audioFrames, `the picture must continue after the device loss: ${JSON.stringify(audioState)}`)
  assert.deepEqual(audioErrors, [])
  await audioPage.close()
  console.log('ok    losing the audio device mid-playback keeps the picture running')

  // ------------------------------------------------- rapid preset churn/abuse
  for (let i = 0; i < 40; i++) {
    await init({ image: `void mainImage(out vec4 c,in vec2 p){c=vec4(0.,${i % 2},0.,1.);}` }, `churn-${i}`)
  }
  await waitSettled('churn-39')
  await player.waitForTimeout(400)
  const churn = await player.evaluate(() => ({ preset: window.__player?.preset, ready: window.__player?.ready, generation: window.__player?.workerGeneration, frames: window.__player?.frames }))
  assert.ok(churn.ready, `rapid switching must settle: ${JSON.stringify(churn)}`)
  assert.ok(churn.generation <= generation + 3, `rapid switching must coalesce worker restarts: ${JSON.stringify(churn)}`)
  assert.ok(churn.preset === 'churn-39' || churn.preset === 'churn-38', `the last injected preset must stay active: ${JSON.stringify(churn)}`)

  // Client-side interaction validation: forged tokens/coordinates/keys are
  // ignored without throwing, and a forged "start" cannot reach the player.
  await shell.waitForFunction(() => {
    const frame = document.querySelector('#shadertoy-skin-bg')
    return frame?.contentWindow?.__player?.ready === true
  }, null, { timeout: 30000 })
  const shellPlayer = shell.frames().find(frame => frame.url().includes('player.html'))
  await shell.bringToFront()
  await shell.waitForTimeout(400)
  const framesBeforeForgery = await shellPlayer.evaluate(() => window.__player.frames)
  await panel.evaluate(() => {
    const bogus = [
      { type: 'interaction-key', token: 'forged', keyCode: 65, down: true },
      { type: 'interaction-pointer', token: 'forged', x: Number.NaN, y: Infinity, down: true },
      { type: 'interaction', enabled: true, token: 'forged' },
    ]
    for (const message of bogus) parent.postMessage(message, location.origin)
  })
  await shell.waitForTimeout(600)
  assert.ok(await shellPlayer.evaluate(() => window.__player.frames) > framesBeforeForgery)
  assert.deepEqual(shellErrors, [])

  await player.setViewportSize({ width: 1, height: 1 })
  await player.waitForTimeout(400)
  await player.setViewportSize({ width: 480, height: 320 })
  await player.waitForTimeout(300)
  assert.deepEqual(playerErrors, [])
  console.log('ok    rapid preset churn, forged interaction messages and a 1x1 viewport stay contained')
} finally {
  await browser?.close()
  await h.close()
}
