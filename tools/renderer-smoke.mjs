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
    const headless = !process.argv.includes('--headed')
    const launchArgs = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']
    // CI images ship Chrome, so prefer the installed browser there and skip the
    // Playwright download entirely. Locally, PLAYWRIGHT_CHANNEL=msedge also works.
    const channel = process.env.PLAYWRIGHT_CHANNEL || (process.env.CI ? 'chrome' : undefined)
    try {
      browser = await playwright.chromium.launch({ channel, headless, args: launchArgs })
    } catch (error) {
      if (!channel) throw error
      console.warn(`could not launch "${channel}", falling back to the bundled Chromium: ${error.message}`)
      browser = await playwright.chromium.launch({ headless, args: launchArgs })
    }
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

    // --- glass veil: the player paints the darkening itself (one layer, no tokens)
    await open('preset=flow&fps=60&dim=1&tint=090c10&tintMix=0')
    await waitForFrames(8)
    const noVeilHash = await shotHash()
    const noVeilDiag = await diag()
    await open('preset=flow&fps=60&dim=1&tint=090c10&tintMix=0.7')
    await waitForFrames(8)
    const veilHash = await shotHash()
    const veilDiag = await diag()
    check('tintMix reaches the shader (look diag)', /look=1\.00\/0\.70/.test(veilDiag), veilDiag)
    check('tintMix changes the rendered pixels', veilHash !== noVeilHash)
    await open('preset=flow&fps=60&dim=1.6&tint=090c10&tintMix=0')
    await waitForFrames(8)
    const brightDiag = await diag()
    check('brightness above 1.0 is no longer clamped away', /look=1\.60\/0\.00/.test(brightDiag), brightDiag)
    await open('preset=flow&fps=60&dim=1&loop=1&loopSeconds=12')
    await waitForFrames(8)
    const loopDiag = await diag()
    check('loop mode is reported by the player', /loop=12s/.test(loopDiag), loopDiag)
    await open('preset=flow&fps=60&dim=1&loop=0')
    await waitForFrames(4)
    check('loop off by default', /loop=off/.test(await diag()), await diag())

    // --- settings panel (standalone mode, dev base)
    await page.goto(`${BASE}/panel.html?base=`, { waitUntil: 'load' })
    // boot() is async (defaults.json + manifest), so wait until the controls render.
    await page.waitForFunction(() => {
      const panel = document.getElementById('panel')
      const trigger = document.querySelector('#fps-dd .dd-trigger')
      return panel?.classList.contains('open') === true && (trigger?.textContent ?? '') !== ''
    }, null, { timeout: 20_000 })
    const panelState = () => page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      glass: document.getElementById('glass-out')?.textContent,
      brightness: document.getElementById('brightness-out')?.textContent,
      panels: document.getElementById('panels-out')?.textContent,
      loopChecked: document.getElementById('loop')?.checked,
      loopRowHidden: document.getElementById('loop-seconds-row')?.hidden,
      audioMode: document.getElementById('audio-mode-out')?.textContent,
      audioSecondsRowHidden: document.getElementById('audio-seconds-row')?.hidden,
      codeResize: (() => {
        const area = document.getElementById('code-image')
        return area ? getComputedStyle(area).resize : null
      })(),
      codeGrips: document.querySelectorAll('.code-grip').length,
      fps: document.querySelector('#fps-dd .dd-trigger')?.textContent,
      scale: document.querySelector('#scale-dd .dd-trigger')?.textContent,
      scaleChoices: [...document.querySelectorAll('#scale-dd .dd-item')].map(node => node.textContent),
      scaleHeader: document.getElementById('scale-out')?.textContent,
      scaleHint: document.getElementById('scale-hint')?.textContent,
      preset: document.querySelector('#preset-dd .dd-trigger')?.textContent,
      items: [...document.querySelectorAll('#lib-list .item .name')].map(node => node.textContent),
      presetChoices: [...document.querySelectorAll('#preset-dd .dd-item')].map(node => node.textContent),
      ncBadges: document.querySelectorAll('#lib-list .item .badge.nc:not([hidden])').length,
    }))
    const initial = await panelState()
    check('panel applies a theme (dark/light)', initial.theme === 'dark' || initial.theme === 'light', String(initial.theme))
    check('panel defaults to 30 fps', initial.fps === '30 fps', String(initial.fps))
    check('panel defaults to 1x render scale', /1×/.test(initial.scale ?? ''), String(initial.scale))
    // Viewport is 1024x640 at DPR 1 in this test run, so the labels are deterministic.
    check('scale menu shows concrete resolutions', (initial.scaleChoices ?? []).length === 11
      && /^1024 × 640（1×）$/.test(initial.scaleChoices[6] ?? ''), (initial.scaleChoices ?? []).join(' | '))
    check('scale menu covers 0.25x up to 2x',
      (initial.scaleChoices ?? []).includes('256 × 160（0.25× · 最省电）')
      && (initial.scaleChoices ?? []).includes('2048 × 1280（2× · 最吃显卡）')
      && (initial.scaleChoices ?? []).includes('512 × 320（0.5×）'),
      (initial.scaleChoices ?? []).join(' | '))
    check('resolution header shows the drawing-buffer size', /^1024 × 640$/.test(initial.scaleHeader ?? ''), String(initial.scaleHeader))
    check('resolution hint explains the DPR cap', /DPR 上限 1\.5/.test(initial.scaleHint ?? ''), String(initial.scaleHint))
    check('panel defaults to 60% glass', initial.glass === '60%', String(initial.glass))
    check('panel defaults to 100% brightness', initial.brightness === '100%', String(initial.brightness))
    check('panel defaults to opaque cards', initial.panels === '不透明', String(initial.panels))
    check('panel defaults to loop off', initial.loopChecked === false && initial.loopRowHidden === true)
    check('panel defaults to looping music', /循环重放/.test(initial.audioMode ?? ''), String(initial.audioMode))
    check('music duration row is hidden without a sound pass', initial.audioSecondsRowHidden === true)
    check('code boxes have a visible drag grip instead of the native resizer',
      initial.codeGrips === 2 && initial.codeResize === 'none', `${initial.codeGrips} grips / resize=${initial.codeResize}`)
    check('panel selects a built-in preset', /极光/.test(initial.preset ?? ''), String(initial.preset))

    // card/overlay transparency picker
    await page.click('#panels-dd .dd-trigger')
    await page.waitForSelector('#panels-dd .dd.open .dd-menu', { timeout: 5_000 })
    const panelChoices = await page.locator('#panels-dd .dd-item').count()
    check('card transparency picker has 3 levels', panelChoices === 3, String(panelChoices))
    await page.locator('#panels-dd .dd-item', { hasText: '半透明' }).click()
    check('choosing 半透明 applies it', (await panelState()).panels === '半透明', String((await panelState()).panels))
    await page.click('#panels-dd .dd-trigger')
    await page.locator('#panels-dd .dd-item', { hasText: '不透明' }).click()

    // resolution picker: concrete sizes, applying one moves the header + hint
    await page.click('#scale-dd .dd-trigger')
    await page.waitForSelector('#scale-dd .dd.open .dd-menu', { timeout: 5_000 })
    await page.locator('#scale-dd .dd-item', { hasText: '（0.25×' }).click()
    const quarterScale = await panelState()
    check('choosing 0.25× shows a quarter-size buffer', /^256 × 160$/.test(quarterScale.scaleHeader ?? ''), String(quarterScale.scaleHeader))
    await page.click('#scale-dd .dd-trigger')
    await page.locator('#scale-dd .dd-item', { hasText: '（0.5×）' }).click()
    const halfScale = await panelState()
    check('choosing 0.5× shows the smaller buffer', /^512 × 320$/.test(halfScale.scaleHeader ?? ''), String(halfScale.scaleHeader))
    check('scale trigger keeps the pixel size', /^512 × 320（0\.5×）$/.test(halfScale.scale ?? ''), String(halfScale.scale))
    await page.click('#scale-dd .dd-trigger')
    await page.locator('#scale-dd .dd-item', { hasText: '（1×）' }).click()
    await page.setViewportSize({ width: 800, height: 600 })
    await sleep(200)
    check('resizing the window rebuilds the scale labels',
      /^800 × 600（1×）$/.test((await panelState()).scale ?? ''), String((await panelState()).scale))
    await page.setViewportSize({ width: 1024, height: 640 })
    await sleep(200)

    // loop playback: toggle reveals the period slider
    await page.click('#loop')
    let loopState = await panelState()
    check('loop toggle turns on', loopState.loopChecked === true && loopState.loopRowHidden === false)
    await page.click('#loop')

    // Sound controls stay disabled when the selected work has no sound pass.
    check('silent works disable the music mode picker', await page.locator('#audio-mode-dd .dd-trigger').isDisabled())
    check('duration row stays hidden without a sound pass', (await panelState()).audioSecondsRowHidden === true)

    // custom dropdown: no native (light) popup — a themed list we control
    await page.click('#fps-dd .dd-trigger')
    await page.waitForSelector('#fps-dd .dd.open .dd-menu', { timeout: 5_000 })
    const fpsChoices = await page.locator('#fps-dd .dd-item').count()
    check('fps dropdown is a custom list with 4 choices', fpsChoices === 4, String(fpsChoices))
    const popup = await page.evaluate(() => {
      const menu = document.querySelector('#fps-dd .dd-menu')
      const item = menu?.querySelector('.dd-item')
      return menu && item ? { bg: getComputedStyle(menu).backgroundColor, fg: getComputedStyle(item).color } : null
    })
    check('dropdown popup is themed, not a white system list', Boolean(popup) && !(popup.bg === 'rgb(255, 255, 255)' && popup.fg === 'rgb(0, 0, 0)'), JSON.stringify(popup))
    await page.locator('#fps-dd .dd-item', { hasText: '60 fps' }).click()
    check('choosing 60 fps applies it', (await panelState()).fps === '60 fps')

    // library tab lists built-in presets
    await page.click('#tab-library')
    await page.waitForSelector('#view-library:not([hidden])')
    const library = await panelState()
    check('library lists the built-in presets',
      ['极光', '流体色带', '脉冲（带音乐）', '海面（Seascape）', '马里奥（带音乐）'].every((name) => library.items.includes(name)),
      library.items.join(','))
    check('third-party presets carry a CC licence badge', library.ncBadges === 2, String(library.ncBadges))
    check('preset picker shows the third-party licence', library.presetChoices.some((text) => /CC BY-NC-SA/.test(text)),
      library.presetChoices.join(' | '))

    await page.click('#tab-params')
    await page.click('#reset')
    await sleep(150)
    check('reset restores the default glass', (await panelState()).glass === '60%')
    // and the sliders actually move (this is the path that used to be dead because
    // the parent keyed panels by <iframe> while postMessage reports contentWindow)
    await page.locator('#glass').fill('35')
    await page.locator('#brightness').fill('140')
    const moved = await panelState()
    check('glass slider moves', moved.glass === '35%', String(moved.glass))
    check('brightness slider moves', moved.brightness === '140%', String(moved.brightness))

    // --- code tab: view the running skin's source, edit it, save & run
    await page.click('#tab-code')
    await page.waitForFunction(() => (document.getElementById('code-image')?.value ?? '').includes('mainImage'), null, { timeout: 10_000 })
    const codeState = () => page.evaluate(() => ({
      title: document.getElementById('code-title')?.textContent,
      image: document.getElementById('code-image')?.value ?? '',
      note: document.getElementById('code-note')?.textContent ?? '',
      preset: document.querySelector('#preset-dd .dd-trigger')?.textContent,
      presetChoices: [...document.querySelectorAll('#preset-dd .dd-item')].map(node => node.textContent),
      ncBadges: document.querySelectorAll('#lib-list .item .badge.nc:not([hidden])').length,
    }))
    const codeInitial = await codeState()
    check('code tab shows the running built-in shader', /极光/.test(codeInitial.title ?? '') && codeInitial.image.includes('mainImage'), codeInitial.title)
    check('code tab marks a built-in as read-only', /只读/.test(await page.textContent('#code-hint')))

    // --- code boxes: the visible grip drags the height, and it is remembered
    const codeHeight = () => page.evaluate(() => Math.round(document.getElementById('code-image').getBoundingClientRect().height))
    const beforeDrag = await codeHeight()
    const gripBox = await page.locator('.code-grip').first().boundingBox()
    await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2 + 140, { steps: 12 })
    await page.mouse.up()
    await sleep(150)
    const afterDrag = await codeHeight()
    check('dragging the code grip resizes the box', afterDrag >= beforeDrag + 100, `${beforeDrag} -> ${afterDrag}`)
    check('code box height is persisted in localStorage', await page.evaluate(() => {
      try {
        const saved = JSON.parse(localStorage.getItem('shadertoy-skin.codeHeights') ?? 'null')
        return Number.isFinite(saved?.image) && saved.image > 300
      } catch { return false }
    }))
    await page.locator('.code-grip').first().focus()
    const beforeKey = await codeHeight()
    await page.keyboard.press('ArrowDown')
    await sleep(100)
    const afterKey = await codeHeight()
    check('the code grip supports keyboard resizing', afterKey >= beforeKey + 10, `${beforeKey} -> ${afterKey}`)

    // invalid source is rejected without creating a fork
    await page.locator('#code-image').fill('not glsl at all')
    await page.click('#code-save')
    await sleep(120)
    check('code save rejects source without mainImage/main', /找不到/.test((await codeState()).note), (await codeState()).note)
    check('invalid source creates no fork', !/副本/.test((await codeState()).preset ?? ''), String((await codeState()).preset))

    // valid edit of a built-in forks into "我的" and marks it active
    await page.locator('#code-image').fill('void mainImage(out vec4 o, in vec2 p) { o = vec4(p / iResolution.xy, 0.5, 1.0); }')
    await page.click('#code-save')
    // save is async: fork -> save -> load the new source -> note; wait for all of it
    await page.waitForFunction(() => {
      const preset = document.querySelector('#preset-dd .dd-trigger')?.textContent ?? ''
      const note = document.getElementById('code-note')?.textContent ?? ''
      const hint = document.getElementById('code-hint')?.textContent ?? ''
      return /副本/.test(preset) && /副本/.test(note) && /正在编辑/.test(hint)
    }, null, { timeout: 15_000 })
    const forked = await codeState()
    check('saving an edited built-in forks a copy', /副本/.test(forked.preset ?? ''), String(forked.preset))
    check('fork note explains what happened', /副本/.test(forked.note), forked.note)
    check('fork is now editable', /正在编辑/.test(await page.textContent('#code-hint')))
    await page.click('#tab-library')
    await page.waitForSelector('#view-library:not([hidden])')
    const afterFork = await page.evaluate(() => [...document.querySelectorAll('#lib-list .item .name')].map(node => node.textContent))
    check('fork appears in the library list', afterFork.some(name => /副本/.test(name)), afterFork.join(','))

    // --- main mode must scroll inside the iframe (content is taller than 720p)
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto(`${BASE}/panel.html?mode=main&base=`, { waitUntil: 'load' })
    await page.waitForFunction(() => document.body.classList.contains('mode-main'))
    await page.waitForTimeout(400)
    const scrollable = await page.evaluate(() => {
      const body = document.body
      const height = getComputedStyle(body).height
      const before = body.scrollTop
      body.scrollTop = 99999
      const after = body.scrollTop
      return {
        height,
        overflowY: getComputedStyle(body).overflowY,
        scrollHeight: body.scrollHeight,
        innerHeight: window.innerHeight,
        before,
        after,
        htmlClass: document.documentElement.className,
      }
    })
    check('main-mode page has a fixed-height scrolling body', scrollable.overflowY === 'auto' && /px$/.test(scrollable.height), JSON.stringify(scrollable))
    check('main-mode content is taller than the viewport', scrollable.scrollHeight > scrollable.innerHeight, `${scrollable.scrollHeight} vs ${scrollable.innerHeight}`)
    check('main-mode page actually scrolls', scrollable.after > 0, `${scrollable.before} -> ${scrollable.after}`)

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
