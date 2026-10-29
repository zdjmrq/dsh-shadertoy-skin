import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { startHarness } from './browser-harness.mjs'

const h = await startHarness()
let browser
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.env.CI ? 'chrome' : 'msedge'), headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] })
  const page = await browser.newPage({ viewport: { width: 240, height: 160 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    window.__scheduledSamples = []
    const RealContext = window.AudioContext
    window.AudioContext = class extends RealContext {
      createBufferSource() {
        const source = super.createBufferSource(), start = source.start.bind(source)
        source.start = (when, offset = 0) => {
          const data = source.buffer.getChannelData(0)
          window.__scheduledSamples.push({ first: data[0], last: data.at(-1), length: data.length, when, offset })
          return start(when, offset)
        }
        return source
      }
    }
    const RealWorker = window.Worker
    window.Worker = class extends RealWorker {
      set onmessage(listener) {
        const pending = []
        let timer
        const flush = () => { clearTimeout(timer); timer = null; for (const event of pending.splice(0)) listener(event) }
        super.onmessage = event => {
          if (event.data.kind === 'audio' && event.data.action === 'start') {
            if (window.__holdAudioUntil > performance.now()) {
              pending.push(event)
              timer ??= setTimeout(flush, window.__holdAudioUntil - performance.now())
              return
            }
            // MessagePort delivery is FIFO, including at the end of a stall.
            flush()
          }
          listener(event)
        }
      }
    }
  })
  await page.goto(`${h.url}/shader-skin/player.html?preset=aurora&audioprobe=1`)
  await page.waitForFunction(() => window.__player?.ready)
  // A ramp makes missing/repeated chunks measurable without listening to a tone.
  // The 120-second seam is outside this test: only scheduling can break the ramp.
  await page.evaluate(() => window.postMessage({ type: 'init', preset: { id: 'continuity', name: 'continuity', code: {
    image: 'void mainImage(out vec4 c,in vec2 p){c=vec4(.3);}',
    sound: 'vec2 mainSound(float t){return vec2(.05+t*.001);}', duration: { image: 120, sound: 120 },
  } }, params: { muted: false, volume: 30, fps: 15, loop: true, audioMode: 'loop' } }, location.origin))
  await page.waitForFunction(() => window.__scheduledSamples.length > 25)
  await page.evaluate(() => { window.__holdAudioUntil = performance.now() + 1900 })
  await page.waitForFunction(() => window.__player.audio.underruns > 0)
  await page.waitForFunction(() => window.__scheduledSamples.length > 80)
  const samples = await page.evaluate(() => window.__scheduledSamples)
  assert.ok(samples.every(sample => sample.offset === 0), 'late chunks must never be truncated with a playback offset')
  for (let i = 1; i < samples.length; i++) {
    assert.ok(Math.abs(samples[i].first - samples[i - 1].last) < .00004, `missing/repeated musical samples at chunk ${i}: ${JSON.stringify(samples.slice(i - 1, i + 1))}`)
    assert.ok(samples[i].when > samples[i - 1].when, 'device timestamps must stay ordered after rebasing')
  }
  assert.equal(await page.evaluate(() => window.__player.audio.state), 'running')
  const playback = await page.evaluate(() => window.__player.playback)
  assert.ok(Math.abs(playback.time - playback.musicAudibleTime) < .2, `picture and audible music drifted after recovery: ${JSON.stringify(playback)}`)
  assert.deepEqual(errors, [])
  console.log('ok    1.9-second delayed delivery recovers without dropping, repeating or truncating musical chunks')
  console.log('ok    device queue remains bounded and music stays running after virtual-clock rebasing')
  await page.evaluate(() => window.postMessage({ type: 'init', preset: { id: 'repeat', name: 'repeat', code: {
    image: 'void mainImage(out vec4 c,in vec2 p){c=vec4(fract(iTime),.2,.3,1.);}',
    sound: 'vec2 mainSound(float t){return vec2(.1);}', duration: { image: 1.2, sound: 1 },
  } }, params: { muted: false, volume: 30, speed: 1, loop: true, loopMode: 'auto', audioMode: 'loop' } }, location.origin))
  await page.waitForFunction(() => window.__player?.preset === 'repeat' && window.__player.playback.repeats >= 4)
  const repeated = await page.evaluate(() => window.__player.playback)
  assert.equal(repeated.jointPeriod, 1.2)
  assert.equal(repeated.musicLoopPeriod, 1.2)
  assert.ok(Math.abs(repeated.time - repeated.musicAudibleTime) < .2, JSON.stringify(repeated))
  assert.deepEqual(errors, [])
  console.log('ok    multiple joint-loop boundaries keep the audible clock and clear the image feedback together')

  // Autoplay policy keeps the device suspended until a real gesture; the picture
  // runs in the meantime. Unlocking must not rewind it (joint playback follows
  // the audible clock), so the scheduler joins at the running picture position.
  const gated = await browser.newPage({ viewport: { width: 320, height: 200 } })
  const gatedErrors = []
  gated.on('pageerror', error => gatedErrors.push(error.message))
  await gated.addInitScript(() => {
    const RealContext = window.AudioContext
    const gate = { allow: false }
    window.__audioGate = gate
    window.AudioContext = class extends RealContext {
      get state() { return gate.allow ? super.state : 'suspended' }
      resume() { return gate.allow ? super.resume() : Promise.resolve() }
    }
  })
  await gated.goto(`${h.url}/shader-skin/player.html?preset=take-on-me&scale=0.5&fps=15&muted=1`)
  await gated.waitForFunction(() => window.__player?.ready)
  await gated.waitForTimeout(2500)
  const blocked = await gated.evaluate(() => ({ time: window.__player.playback.time, audio: window.__player.audio.state, joint: window.__player.playback.jointPeriod }))
  assert.equal(blocked.audio, 'suspended', 'the gated device must stay blocked')
  assert.equal(blocked.joint, 209, `take-on-me has a known joint period: ${JSON.stringify(blocked)}`)
  assert.ok(blocked.time > 1.2, `the picture must run while the device is blocked: ${JSON.stringify(blocked)}`)
  await gated.evaluate(() => { window.__audioGate.allow = true })
  await gated.mouse.click(60, 60)
  await gated.waitForFunction(() => window.__player.audio.state === 'running')
  const atUnlock = await gated.evaluate(() => window.__player.playback)
  await gated.waitForTimeout(600)
  const afterUnlock = await gated.evaluate(() => window.__player.playback)
  assert.ok(atUnlock.time > 1, `unlocking audio must not rewind the picture: ${JSON.stringify(atUnlock)}`)
  assert.ok(afterUnlock.time >= atUnlock.time - .1, `the picture keeps running after the unlock: ${JSON.stringify([atUnlock.time, afterUnlock.time])}`)
  assert.ok(Math.abs(afterUnlock.time - afterUnlock.musicAudibleTime) < .2, `music joins at the picture position: ${JSON.stringify(afterUnlock)}`)
  assert.deepEqual(gatedErrors, [])
  await gated.close()
  console.log('ok    a blocked audio device unlocks at the running picture position instead of rewinding it')
} finally { await browser?.close(); await h.close() }
