import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { startHarness } from './browser-harness.mjs'

const h = await startHarness()
let browser
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.env.CI ? 'chrome' : 'msedge'), headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] })
  const page = await browser.newPage({ viewport: { width: 320, height: 240 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${h.url}/shader-skin/player.html?preset=aurora&audioprobe=1`)
  await page.waitForFunction(() => window.__player?.ready)
  await page.evaluate(() => window.postMessage({ type: 'init', preset: { id: 'test', name: 'bounded-tone', code: {
    image: 'void mainImage(out vec4 c,in vec2 p){c=vec4(.5);}',
    // Deliberately keeps making sound after its declared end: the player must
    // enforce silence, not rely on each imported synth doing it itself.
    sound: 'vec2 mainSound(float t){return vec2(.4);}', duration: { image: 8, sound: 1 },
  } }, params: { muted: false, volume: 50, speed: 1, loop: true, loopMode: 'auto', audioMode: 'loop', audioDurationMode: 'auto' } }, location.origin))
  await page.waitForFunction(() => window.__player?.ready && window.__player.preset === 'bounded-tone' && window.__audioProbe?.peak > .3)
  await page.waitForFunction(() => window.__player.playback.musicAudibleTime > 1.3 && window.__audioProbe?.peak === 0)
  let state = await page.evaluate(() => window.__player.playback)
  assert.equal(state.jointPeriod, 8)
  assert.equal(state.musicLoopPeriod, 8)
  // Reconfigure synthesis while inside the silence tail. It must retain the
  // audible cursor, not restart at zero just because the music has ended.
  const before = state.musicAudibleTime
  await page.evaluate(() => window.postMessage({ type: 'params', params: { muted: true } }, location.origin))
  await page.waitForTimeout(160)
  state = await page.evaluate(() => window.__player.playback)
  assert.ok(state.musicAudibleTime >= before - .1 && state.musicAudibleTime < before + .6, `${before} -> ${state.musicAudibleTime}`)
  assert.equal(await page.evaluate(() => window.__audioProbe.peak), 0)
  console.log('ok    joint-loop silence tails are actually silent and mute changes preserve their cursor')

  for (const [params, joint, image, music] of [
    [{ loop: false }, 0, 0, 1],
    [{ loop: true, loopMode: 'manual', loopSeconds: 5 }, 0, 5, 1],
    [{ loopMode: 'auto', audioMode: 'once' }, 0, 8, 0],
    [{ audioMode: 'loop', speed: 2 }, 0, 8, 1],
    [{ speed: 1 }, 8, 8, 8],
  ]) {
    await page.evaluate(params => window.postMessage({ type: 'params', params }, location.origin), params)
    await page.waitForFunction(expected => {
      const p = window.__player.playback
      return p.jointPeriod === expected[0] && p.loopPeriod === expected[1] && p.musicLoopPeriod === expected[2]
    }, [joint, image, music])
  }
  assert.deepEqual(errors, [])
  console.log('ok    loop off, manual image periods, once-only music and non-1x speed retain independent semantics')

  const response = await page.request.put(`${h.url}/shader-skin/state`, { data: { version: 2, activeId: 'fixture', settings: { muted: true }, entries: [
    { id: 'fixture', name: 'Audit Song', author: 'Audit Synth', code: {
      image: '// @duration 2\nvoid mainImage(out vec4 c,in vec2 p){c=vec4(.5);}',
      sound: '// @duration 3\nvec2 mainSound(float t){return vec2(.1);}',
    } },
    { id: 'silent-fixture', name: 'Quiet Fixture', code: { image: 'void mainImage(out vec4 c,in vec2 p){c=vec4(.5);}' } },
  ] } })
  assert.equal(response.status(), 200)
  await page.goto(h.url)
  await page.waitForSelector('iframe[title="ShaderToy 背景设置"]')
  let panel = page.frames().find(frame => frame.url().includes('panel.html'))
  await panel.waitForSelector('#preset-dd .dd-trigger')
  await panel.waitForFunction(() => document.querySelector('#playback-hint').textContent.includes('按 3 秒联播'))
  assert.match(await panel.textContent('#playback-hint'), /画面 2 秒 \/ 音乐 3 秒/)
  const hint = await panel.textContent('#playback-hint')
  await page.evaluate(() => document.querySelector('iframe[title="ShaderToy 背景设置"]').contentWindow.postMessage({ type: 'playback', id: 'previous', imageDuration: 800, musicDuration: 900 }, location.origin))
  await panel.waitForTimeout(100)
  assert.equal(await panel.textContent('#playback-hint'), hint)
  await page.evaluate(() => { const frame = document.querySelector('iframe[title="ShaderToy 背景设置"]'); frame.src = frame.src })
  await page.waitForTimeout(150)
  panel = page.frames().find(frame => frame.url().includes('panel.html'))
  await panel.waitForFunction(() => document.querySelector('#playback-hint')?.textContent.includes('按 3 秒联播'))
  console.log('ok    the panel receives real runtime durations, ignores obsolete artwork status and resyncs after remount')

  await panel.click('#tab-library')
  await panel.selectOption('#lib-filter', 'mine')
  assert.equal(await panel.locator('#lib-list .item').count(), 2)
  await panel.fill('#lib-search', 'AUDIT SYNTH')
  assert.equal(await panel.locator('#lib-list .item').count(), 1)
  assert.match(await panel.textContent('#lib-list'), /Audit Song/)
  await panel.fill('#lib-search', '<no matching background>')
  assert.equal(await panel.locator('#lib-list .item').count(), 0)
  assert.match(await panel.textContent('#lib-list'), /没有匹配/)
  await panel.press('#lib-search', 'Escape')
  assert.equal(await panel.locator('#lib-list .item').count(), 2)
  await panel.selectOption('#lib-filter', 'builtin')
  assert.equal(await panel.locator('#lib-list .item').count(), 12)
  await panel.selectOption('#lib-filter', 'silent')
  await panel.fill('#lib-search', 'silent-fixture')
  assert.equal(await panel.locator('#lib-list .item').count(), 1)
  assert.match(await panel.textContent('#lib-list'), /Quiet Fixture/)
  assert.deepEqual(errors, [])
  console.log('ok    library search handles names, authors and ids, combining source/sound filters and empty/Escape states')
} finally {
  await browser?.close()
  await h.close()
}
