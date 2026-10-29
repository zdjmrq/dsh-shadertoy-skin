#!/usr/bin/env node
/**
 * Audio smoke test — proves the ShaderToy mainSound pipeline actually produces
 * sound in a real browser: sound shader compiles, the 4096x1 readPixels chunks
 * decode to non-silent samples, and the WebAudio lookahead scheduler keeps
 * scheduling chunks.
 *
 * Covers:
 *   pulse (image + pulse-sound.glsl) -> ready{sound:true}, audio.state=running,
 *                                      chunks increasing, probe peak > 0.05
 *   aurora (no sound)               -> ready{sound:false}, audio.state=none
 *   muted=0&volume=70               -> effective gain 0.7 (GainNode reachable)
 *
 * The browser is launched with --autoplay-policy=no-user-gesture-required so the
 * AudioContext starts running without a user gesture; this is test-only. On a
 * normal page the player reports `suspended` and waits for a real gesture /
 * the parent's `audio-resume` message.
 *
 * Usage:
 *   node tools/audio-smoke.mjs [--headed]
 *   PLAYWRIGHT_CHANNEL=msedge node tools/audio-smoke.mjs     # use installed Edge
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const ROOT = new URL('..', import.meta.url)
const PORT = Number(process.env.SMOKE_PORT ?? 8732)
const BASE = `http://127.0.0.1:${PORT}`
const failures = []

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`ok    ${label}`)
  } else {
    failures.push(label)
    console.log(`FAIL  ${label}${detail ? `  (${detail})` : ''}`)
  }
}

async function waitForServer(timeoutMs = 10_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${BASE}/player.html`, { cache: 'no-store' })
      if (response.ok) return
    } catch { /* not up yet */ }
    await sleep(120)
  }
  throw new Error(`dev server did not start on ${BASE}`)
}

async function main() {
  let playwright
  try {
    playwright = await import('playwright')
  } catch {
    console.error('playwright is not installed. Run: npm install && npx playwright install chromium')
    process.exit(2)
  }

  const server = spawn(process.execPath, [fileURLToPath(new URL('./dev-server.mjs', import.meta.url)), String(PORT)], {
    cwd: fileURLToPath(ROOT),
    stdio: 'ignore',
  })

  let browser
  try {
    await waitForServer()
    const headless = !process.argv.includes('--headed')
    const launchArgs = [
      '--autoplay-policy=no-user-gesture-required',
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader',
    ]
    const channel = process.env.PLAYWRIGHT_CHANNEL || (process.env.CI ? 'chrome' : undefined)
    try {
      browser = await playwright.chromium.launch({ channel, headless, args: launchArgs })
    } catch (error) {
      if (!channel) throw error
      console.warn(`could not launch "${channel}", falling back to the bundled Chromium: ${error.message}`)
      browser = await playwright.chromium.launch({ headless, args: launchArgs })
    }
    const page = await browser.newPage({ viewport: { width: 800, height: 450 }, deviceScaleFactor: 1 })

    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(String(error)))

    const open = async (query) => {
      await page.goto(`${BASE}/player.html?${query}`, { waitUntil: 'load' })
    }
    const player = () => page.evaluate(() => window.__player ?? null)
    const diag = () => page.evaluate(() => document.getElementById('diag')?.textContent ?? '')
    const errText = () => page.evaluate(() => {
      const box = document.getElementById('err')
      return box && box.classList.contains('open') ? box.textContent ?? '' : ''
    })
    const waitFor = (fn, timeoutMs = 15_000, label = 'condition') => page.waitForFunction(fn, null, { timeout: timeoutMs, polling: 100 })
      .catch(() => { throw new Error(`timed out waiting for ${label}`) })

    // ---- pulse: image + sound, autoplay forced on
    await open('preset=pulse&fps=30&dim=1&audioprobe=1')
    await waitFor(() => window.__player?.ready === true, 20_000, 'ready')
    let state = await player()
    check('pulse reports ready', state.ready === true, JSON.stringify(state?.audio))
    check('pulse reports sound:true', state.sound === true, String(state.sound))
    check('ready message carries sound:true',
      await page.evaluate(() => (window.__outbox ?? []).some(m => m.type === 'ready' && m.sound === true)))
    check('pulse image pass keeps rendering', /running/.test(await diag()), await diag())
    check('pulse has no error panel', (await errText()) === '')

    await waitFor(() => window.__player?.audio?.state === 'running', 15_000, 'audio running')
    state = await player()
    const sampleRate = state.audio.sampleRate
    check('audio context runs at 44100 (or 48000 fallback)', sampleRate === 44100 || sampleRate === 48000, String(sampleRate))
    check('audio chunk size is 4096', state.audio.chunkSize === 4096, String(state.audio.chunkSize))

    // Headless audio backends can take ~1 s before AudioContext.currentTime starts
    // advancing, so wait for the scheduler to actually grow the queue before
    // measuring the rate.
    const initialChunks = (await player()).audio.chunks
    await page.waitForFunction(
      min => (window.__player?.audio?.chunks ?? 0) >= min,
      initialChunks + 4,
      { timeout: 10_000, polling: 100 },
    ).catch(() => { throw new Error('timed out waiting for more audio chunks') })
    const first = await player()
    const t0 = Date.now()
    await sleep(900)
    const second = await player()
    const elapsed = (Date.now() - t0) / 1000
    const perSecond = (second.audio.chunks - first.audio.chunks) / elapsed
    check('audio chunks keep being scheduled', second.audio.chunks > first.audio.chunks,
      `chunks ${first.audio.chunks} -> ${second.audio.chunks}`)
    check('scheduling rate is ~10 chunks/s', perSecond >= 4 && perSecond <= 25, perSecond.toFixed(1))

    await waitFor(() => (window.__audioProbe?.peak ?? 0) > 0.05, 10_000, 'non-silent audio probe')
    const probe = await page.evaluate(() => window.__audioProbe)
    check('decoded audio is non-silent (peak > 0.05)', probe.peak > 0.05, String(probe.peak))
    check('decoded audio has sane level (rms > 0.01)', probe.rms > 0.01, String(probe.rms))
    check('decoded audio does not clip (peak <= 1.0)', probe.peak <= 1.0, String(probe.peak))

    // ---- a preset without a sound pass must stay silent, and not break the image pass
    await open('preset=aurora&fps=30')
    await waitFor(() => window.__player?.ready === true, 20_000, 'aurora ready')
    state = await player()
    check('aurora reports sound:false', state.sound === false, String(state.sound))
    check('aurora audio state is none', state.audio.state === 'none', state.audio.state)

    // ---- ShaderToy's mono + sample-index signature: float mainSound(in int, float)
    await open('preset=dev/mono-sound&fps=30&dim=1&audioprobe=1&muted=0&volume=70')
    await waitFor(() => window.__player?.ready === true, 20_000, 'mono-sound ready')
    await waitFor(() => window.__player?.audio?.state === 'running', 15_000, 'mono-sound audio running')
    state = await player()
    check('mono int-samp sound compiles and runs', state.sound === true && state.audio.state === 'running', JSON.stringify(state.audio))
    await waitFor(() => (window.__audioProbe?.peak ?? 0) > 0.05, 10_000, 'mono-sound non-silent')
    const monoProbe = await page.evaluate(() => window.__audioProbe)
    check('mono sound reaches both channels (non-silent)', monoProbe.peak > 0.05, String(monoProbe.peak))

    // ---- muted=0&volume=70 must reach the GainNode
    await open('preset=pulse&fps=30&dim=1&audioprobe=1&muted=0&volume=70')
    await waitFor(() => window.__player?.ready === true, 20_000, 'pulse unmuted ready')
    await waitFor(() => window.__player?.audio?.state === 'running', 15_000, 'unmuted audio running')
    state = await player()
    check('unmuted volume reaches the GainNode', Math.abs(state.audio.gain - 0.7) < 0.01, String(state.audio.gain))

    // Freezing the image must not repeatedly render the same sound chunk.
    await open('preset=pulse&fps=30&speed=0&audioprobe=1&muted=0&volume=70')
    await waitFor(() => window.__player?.audio?.state === 'running', 15_000, 'frozen-image audio')
    const soundTime = await page.evaluate(() => window.__audioInternals.time)
    await page.waitForFunction(start => window.__audioInternals.time > start + .2, soundTime, { timeout: 5000 })
    check('image speed zero does not freeze or repeat the audio timeline', (await page.evaluate(() => window.__audioInternals.time)) > soundTime + 0.2)

    // ---- audioMode=once: the music stops at the duration, the image keeps going
    await open('preset=dev/mono-sound&fps=30&dim=1&audioMode=once&audioSeconds=2&muted=0&volume=70')
    await waitFor(() => window.__player?.ready === true, 20_000, 'play-once ready')
    await waitFor(() => window.__player?.audio?.state === 'running', 15_000, 'play-once audio running')
    await waitFor(() => window.__player?.audio?.state === 'ended', 15_000, 'play-once audio ended')
    const ended = await player()
    check('music plays once then stops', ended.audio.state === 'ended', JSON.stringify(ended.audio))
    const chunksAtEnd = ended.audio.chunks
    const framesOf = async () => Number(/frames=(\d+)/.exec(await diag())?.[1] ?? 0)
    const framesAtEnd = await framesOf()
    await sleep(1200)
    const afterEnd = await player()
    check('no new audio chunks after the end', afterEnd.audio.chunks === chunksAtEnd, `${chunksAtEnd} -> ${afterEnd.audio.chunks}`)
    check('the image keeps rendering after the music ends', (await framesOf()) > framesAtEnd, `${framesAtEnd} -> ${await framesOf()}`)

    // ---- audioMode=loop: a finite piece replays — the audio clock wraps at 音乐时长
    await open('preset=dev/decay-sound&fps=30&dim=1&audioprobe=1&muted=0&volume=70&audioMode=loop&audioSeconds=2')
    await waitFor(() => window.__player?.ready === true, 20_000, 'music-loop ready')
    await waitFor(() => window.__player?.audio?.state === 'running', 15_000, 'music-loop running')
    const samples = []
    for (let i = 0; i < 40; i++) {
      samples.push(await page.evaluate(() => ({
        time: window.__audioInternals?.time ?? null,
        state: window.__player?.audio?.state ?? null,
        peak: window.__audioProbe?.peak ?? 0,
        chunks: window.__player?.audio?.chunks ?? 0,
      })))
      await sleep(120)
    }
    const clock = samples.map(sample => sample.time).filter(time => typeof time === 'number')
    const wrapped = clock.some((time, index) => index > 0 && time < clock[index - 1] - 0.5)
    check('music loop wraps the audio clock at 音乐时长', wrapped && clock.length > 10 && Math.max(...clock) < 3.5,
      `max=${Math.max(...clock).toFixed(2)} wrapped=${wrapped}`)
    check('music loop keeps running (never "ended")', samples.every(sample => sample.state === 'running'),
      samples.map(sample => sample.state).join(','))
    const audibleAfterWrap = samples.some((sample, index) => index > 0
      && typeof clock[index] === 'number' && typeof clock[index - 1] === 'number'
      && clock[index] < clock[index - 1] - 0.5 && sample.peak > 0.05)
    check('the piece is audible again after the wrap', audibleAfterWrap,
      samples.slice(0, 8).map(sample => `${sample.time?.toFixed(2)}:${sample.peak.toFixed(2)}`).join(' '))

    check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300))

    console.log('')
    console.log(`audio metrics: sampleRate=${sampleRate} chunkSize=${second.audio.chunkSize}` +
      ` chunks/s=${perSecond.toFixed(1)} peak=${probe.peak.toFixed(3)} rms=${probe.rms.toFixed(3)}`)
  } finally {
    await browser?.close().catch(() => {})
    server.kill()
  }

  if (failures.length > 0) {
    console.log(`\naudio smoke failed: ${failures.length} assertion(s)`)
    process.exit(1)
  }
  console.log('\naudio smoke ok')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
