#!/usr/bin/env node
/**
 * Renderer smoke test — the real thing: boots the dev server, drives the player in
 * a real Chromium, and asserts the WebGL pipeline actually works.
 *
 * Covers:
 *   aurora / flow          -> running, GLSL ES 3.00, frames advancing, pixels differ
 *   presets/dev/legacy     -> legacy `gl_FragColor` shader rewritten to ES 3.00
 *   presets/dev/es1        -> ES 3.00 fails, ES 1.00 fallback succeeds
 *   presets/dev/broken     -> error panel shows a compile error with a remapped line
 *   debug=bg               -> magenta debug layer
 *
 * Usage:
 *   npm i && npx playwright install chromium     # once
 *   node tools/renderer-smoke.mjs [--headed]
 *
 * On machines with Microsoft Edge installed you can skip the browser download:
 *   PLAYWRIGHT_CHANNEL=msedge node tools/renderer-smoke.mjs
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const ROOT = new URL('..', import.meta.url)
const PORT = Number(process.env.SMOKE_PORT ?? 8731)
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
    const channel = process.env.PLAYWRIGHT_CHANNEL || undefined
    browser = await playwright.chromium.launch({
      channel,
      headless: !process.argv.includes('--headed'),
      args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
    })
    const page = await browser.newPage({ viewport: { width: 1024, height: 640 }, deviceScaleFactor: 1 })

    const consoleErrors = []
    page.on('pageerror', error => consoleErrors.push(String(error)))

    const open = async (query) => {
      await page.goto(`${BASE}/player.html?${query}`, { waitUntil: 'load' })
    }
    const diag = () => page.evaluate(() => document.getElementById('diag')?.textContent ?? '')
    const errText = () => page.evaluate(() => {
      const box = document.getElementById('err')
      return box && box.classList.contains('open') ? box.textContent ?? '' : ''
    })
    const waitForFrames = async (minimum = 20, timeoutMs = 8_000) => {
      const started = Date.now()
      while (Date.now() - started < timeoutMs) {
        const text = await diag()
        const match = /frames=(\d+)/.exec(text)
        if (match && Number(match[1]) >= minimum) return text
        await sleep(120)
      }
      return diag()
    }
    const shotHash = async () => createHash('sha256').update(await page.screenshot()).digest('hex')

    // --- aurora: ES3 + animation
    await open('preset=aurora&fps=60&dim=1')
    let text = await waitForFrames(24)
    check('aurora runs', /running/.test(text), text)
    check('aurora uses GLSL ES 3.00', /·\s*es3\s*·/.test(text), text)
    check('aurora advances frames', /frames=(\d+)/.test(text) && Number(/frames=(\d+)/.exec(text)[1]) >= 24, text)
    check('aurora has no error panel', (await errText()) === '')
    const auroraHash = await shotHash()

    // --- flow: different shader must produce different pixels
    await open('preset=flow&fps=60&dim=1')
    await waitForFrames(12)
    const flowHash = await shotHash()
    check('flow renders different pixels than aurora', flowHash !== auroraHash)
    const flowText = await diag()
    check('flow uses GLSL ES 3.00', /·\s*es3\s*·/.test(flowText), flowText)

    // --- legacy main(): rewritten to ES3
    await open('preset=dev/legacy&fps=60')
    text = await waitForFrames(8)
    check('legacy gl_FragColor shader is rewritten to ES 3.00', /·\s*es3\s*·/.test(text), text)

    // --- ES 1.00 fallback
    await open('preset=dev/es1&fps=60')
    text = await waitForFrames(8)
    check('gl_FragData shader falls back to GLSL ES 1.00', /·\s*es1\s*·/.test(text), text)

    // --- compile error surfaces with a remapped source line
    await open('preset=dev/broken&fps=60')
    await sleep(400)
    const compileError = await errText()
    check('broken shader shows the error panel', compileError.includes('着色器编译失败'), compileError.slice(0, 120))
    check('compile error keeps source line numbers', /ERROR:\s*0:\d+/.test(compileError), compileError.slice(0, 200))

    // --- debug magenta layer
    await open('debug=bg&fps=60')
    await waitForFrames(8)
    const debugText = await diag()
    check('debug=bg reports the debug layer', /debug-bg/.test(debugText), debugText)

    // --- settings panel (standalone mode, dev base)
    await page.goto(`${BASE}/panel.html?base=`, { waitUntil: 'load' })
    const panelState = () => page.evaluate(() => ({
      fps: document.getElementById('fps')?.value,
      scale: document.getElementById('scale')?.value,
      glass: document.getElementById('glass')?.value,
      blur: document.getElementById('blur')?.value,
      speed: document.getElementById('speed')?.value,
      fpsOptions: [...(document.getElementById('fps')?.options ?? [])].map(option => option.value),
      scaleOptions: [...(document.getElementById('scale')?.options ?? [])].map(option => option.value),
      presets: [...(document.getElementById('preset')?.options ?? [])].map(option => option.value),
      panelOpen: document.getElementById('panel')?.classList.contains('open'),
    }))
    const initial = await panelState()
    check('panel opens in standalone mode', initial.panelOpen === true)
    check('panel defaults to 30 fps', initial.fps === '30', String(initial.fps))
    check('panel defaults to 1x render scale', initial.scale === '1', String(initial.scale))
    check('panel defaults to 72% glass', initial.glass === '72', String(initial.glass))
    check('panel offers fps choices 15/20/30/60', initial.fpsOptions.join(',') === '15,20,30,60', initial.fpsOptions.join(','))
    check('panel offers render scales 0.5..1.5', initial.scaleOptions.join(',') === '0.5,0.75,1,1.25,1.5', initial.scaleOptions.join(','))
    check('panel lists the shipped presets', initial.presets.includes('aurora') && initial.presets.includes('flow'), initial.presets.join(','))
    await page.selectOption('#fps', '60')
    await page.selectOption('#scale', '0.75')
    await page.evaluate(() => {
      const range = document.getElementById('glass')
      range.value = '55'
      range.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const changed = await panelState()
    check('changing fps applies', changed.fps === '60', String(changed.fps))
    check('changing render scale applies', changed.scale === '0.75', String(changed.scale))
    check('changing glass applies', changed.glass === '55', String(changed.glass))
    await page.click('#reset')
    await sleep(120)
    const reset = await panelState()
    check('reset restores the documented defaults', reset.fps === '30' && reset.scale === '1' && reset.glass === '72', JSON.stringify(reset))

    check('no uncaught page errors', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 300))
  } finally {
    await browser?.close().catch(() => {})
    server.kill()
  }

  if (failures.length > 0) {
    console.log(`\nrenderer smoke failed: ${failures.length} assertion(s)`)
    process.exit(1)
  }
  console.log('\nrenderer smoke ok')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
