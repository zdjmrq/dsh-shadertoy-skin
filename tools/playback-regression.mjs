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
} finally {
  await browser?.close()
  await h.close()
}
