import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { startHarness } from './browser-harness.mjs'

const h = await startHarness()
let browser
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.env.CI ? 'chrome' : 'msedge'), args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'], headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  const getPanel = p => p.frames().find(f => f.url().includes('panel.html'))
  const getPlayer = () => page.frames().find(f => f.url().includes('player.html'))
  const stored = async () => JSON.parse(await readFile(join(h.home, 'shader-skin.json'), 'utf8'))
  // The iframe exists before its document is parsed, so poll for the panel frame
  // instead of assuming it is already in page.frames().
  const waitPanel = async p => {
    for (let i = 0; i < 120; i++) {
      const frame = getPanel(p)
      if (frame) return frame
      await p.waitForTimeout(100)
    }
    throw new Error('panel iframe never loaded')
  }
  const load = async p => {
    await p.goto(h.url)
    await p.waitForSelector('iframe[title="ShaderToy 背景设置"]')
    const frame = await waitPanel(p)
    await frame.waitForSelector('#preset-dd .dd-trigger')
    return frame
  }
  let panel = await load(page)
  await getPlayer().waitForFunction(() => document.querySelector('#diag').textContent.includes('running'))
  await panel.uncheck('#enabled')
  await page.waitForFunction(() => !document.querySelector('#shadertoy-skin-bg') && !document.querySelector('#shadertoy-skin-glass-style'))
  await panel.fill('#glass', '65')
  await page.waitForTimeout(400)
  assert.equal(await page.locator('#shadertoy-skin-glass-style').count(), 0)
  await panel.check('#enabled')
  await page.waitForSelector('#shadertoy-skin-bg')
  await page.frameLocator('#shadertoy-skin-bg').locator('canvas').waitFor()
  await getPlayer().waitForFunction(() => document.querySelector('#diag').textContent.includes('running'))
  console.log('ok    disabling the background restores native surfaces, including later parameter changes')

  await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))
  await getPlayer().waitForFunction(() => document.querySelector('#diag').textContent.includes('look=1.00/0.60'))
  const lightLook = await getPlayer().evaluate(() => window.__player.inspect('look'))
  assert.ok(lightLook[0] > .95 && lightLook[1] > .95)
  console.log('ok    switching to light mode updates the actual shader tint uniform')

  // Real client tokens against semantic DSH surface consumers. Full desktop
  // overlays are verified separately; these fixtures catch alpha and token drift.
  await page.evaluate(() => {
    const style = document.createElement('style')
    style.textContent = 'body{--dsw-alias-bg-layer-1:#fff;--dsw-specific-menu:#fafafa;--dsw-specific-input-major:#fff;--dsw-alias-markdown-code-block:#f9fafb}body[data-ds-dark-theme]{--dsw-alias-bg-layer-1:#232324;--dsw-specific-menu:#2c2c2e;--dsw-specific-input-major:#2c2c2e;--dsw-alias-markdown-code-block:#1b1b1c}.audit-fixture{position:fixed;left:240px;top:160px;z-index:10000;width:390px;padding:24px;background:var(--dsw-alias-bg-layer-1);color:#171717;font:14px/1.7 system-ui;border-radius:12px}.audit-fixture [role=menu],.audit-fixture [role=dialog],.audit-fixture input,.audit-fixture pre{padding:16px;margin:12px 0;border-radius:8px;border:1px solid #8884;color:inherit}.audit-fixture [role=menu]{background:var(--dsw-specific-menu)}.audit-fixture input{background:var(--dsw-specific-input-major)}.audit-fixture pre{background:var(--dsw-alias-markdown-code-block)}body[data-ds-dark-theme] .audit-fixture{color:#f9fafb}'
    document.head.append(style)
    const fixture = document.createElement('section')
    fixture.className = 'audit-fixture'
    fixture.innerHTML = '<b>卡片 / Card</b><input value="聊天输入框 / Composer"><pre>void mainImage(...) { ... }</pre><div role="menu">菜单 / Menu</div><div role="dialog">弹层 / Dialog<br>正文应清楚可读</div>'
    document.body.append(fixture)
  })
  const shots = new URL('../.tmp-validation/verify/surface-audit/', import.meta.url)
  await mkdir(shots, { recursive: true })
  for (const dark of [false, true]) {
    await page.evaluate(dark => document.body.toggleAttribute('data-ds-dark-theme', dark), dark)
    for (const [index, mode] of ['opaque', 'half', 'clear'].entries()) {
      await panel.click('#panels-dd .dd-trigger')
      await panel.locator('#panels-dd .dd-item').nth(index).click()
      await page.waitForTimeout(50)
      const tokens = await page.evaluate(() => window.__glassTokens)
      assert.ok(!Object.keys(tokens).some(k => k.startsWith('--dsw-static-')), 'static palette must never be overwritten')
      const values = await page.evaluate(() => Object.fromEntries(['--dsw-specific-menu', '--dsw-specific-input-major', '--dsw-alias-markdown-code-block', '--dsw-alias-markdown-code-block-banner', '--dsw-alias-button-elevated-fill'].map(k => [k, document.body.style.getPropertyValue(k)])))
      if (mode !== 'opaque') {
        for (const value of Object.values(values)) assert.equal(Number(value.match(/, ([0-9.]+)\)/)?.[1]), mode === 'clear' ? 0 : .65)
      }
      const dialog = await page.locator('.audit-fixture [role=dialog]').evaluate(node => getComputedStyle(node).backgroundColor)
      if (mode === 'opaque') assert.match(dialog, /^rgb\((255, 255, 255|35, 35, 36)\)$/)
      else assert.equal(Number(dialog.match(/, ([0-9.]+)\)/)?.[1]), mode === 'clear' ? 0 : .65)
      await page.screenshot({ path: join(shots.pathname.replace(/^\/([A-Za-z]:)/, '$1'), `${dark ? 'dark' : 'light'}-${mode}.png`) })
    }
  }
  await page.evaluate(() => document.querySelector('.audit-fixture').remove())
  await panel.fill('#glass', '20')
  await page.waitForFunction(() => Number(/, ([0-9.]+)\)/.exec(document.body.style.getPropertyValue('--dsw-alias-bg-layer-1'))?.[1]) === 0)
  await panel.fill('#glass', '65')
  console.log('ok    both themes × three transparency levels preserve palette, menu, dialog, input and code readability')

  await panel.click('#tab-code')
  await panel.waitForFunction(() => document.querySelector('#code-image').value.includes('mainImage'))
  const source = await panel.inputValue('#code-image')
  await panel.fill('#code-image', source + '\n// draft survives refresh')
  await page.reload()
  await page.waitForSelector('iframe[title="ShaderToy 背景设置"]')
  panel = await waitPanel(page)
  await panel.waitForSelector('#preset-dd .dd-trigger')
  await panel.click('#tab-code')
  await panel.waitForFunction(() => document.querySelector('#code-image').value.includes('draft survives refresh'))
  console.log('ok    unsaved source is recovered after a page reload')

  await panel.click('#tab-library')
  const image = 'void mainImage(out vec4 c,in vec2 p){c=vec4(.5);}'
  const sound = 'vec2 mainSound(float t){return vec2(sin(t));}'
  for (const [name, text] of [['own-format.json', JSON.stringify({ name:'own-format', code:{image,sound} })], ['combined.glsl', image + '\n' + sound]]) {
    const saved = page.waitForResponse(r => r.url().endsWith('/state') && r.request().method() === 'PUT' && r.status() === 200)
    await panel.setInputFiles('#file-input', { name, mimeType:'text/plain', buffer:Buffer.from(text) })
    await saved
    assert.ok((await stored()).entries.at(-1).code.sound.includes('mainSound'))
  }
  await panel.fill('#paste-name', 'invalid sound')
  await panel.fill('#paste-image', image)
  await panel.click('#paste-tabs [data-file=sound]')
  await panel.fill('#paste-sound', 'broken sound')
  await panel.click('#paste-add')
  assert.match(await panel.textContent('#paste-error'), /mainSound/)
  const beforeLargeImport = (await stored()).entries.length
  await panel.setInputFiles('#file-input', { name:'escaped-too-large.glsl', mimeType:'text/plain', buffer:Buffer.from(image + '\n//' + '\\'.repeat(1_100_000)) })
  await panel.waitForFunction(() => document.querySelector('#note').textContent.includes('配置大小超过'))
  assert.equal((await stored()).entries.length, beforeLargeImport)
  console.log('ok    own JSON and combined GLSL preserve sound; invalid sound is not silently discarded')

  await panel.click('#tab-params')
  const second = await browser.newPage()
  const secondPanel = await load(second)
  const saved = page.waitForResponse(r => r.url().endsWith('/state') && r.request().method() === 'PUT' && r.status() === 200)
  await panel.fill('#glass', '75')
  await saved
  const conflict = second.waitForResponse(r => r.url().endsWith('/state') && r.status() === 409)
  await secondPanel.fill('#glass', '44')
  await conflict
  assert.equal((await stored()).settings.glass, 75)
  assert.match(await secondPanel.textContent('#note'), /其他页面更新/)
  await second.close()
  console.log('ok    two settings windows cannot silently overwrite each other')

  const beforeFailure = await readFile(join(h.home, 'shader-skin.json'), 'utf8')
  const brokenPage = await browser.newPage()
  await brokenPage.route('**/shader-skin/state', route => route.request().method() === 'GET' ? route.fulfill({status:500,body:'read failed'}) : route.continue())
  const brokenPanel = await load(brokenPage)
  await brokenPanel.fill('#glass', '39')
  await brokenPage.waitForTimeout(450)
  assert.equal(await readFile(join(h.home, 'shader-skin.json'), 'utf8'), beforeFailure)
  assert.match(await brokenPanel.textContent('#note'), /配置读取失败/)
  await brokenPage.close()
  console.log('ok    a failed initial state read never replaces the saved background library')

  const activePlayer = getPlayer()
  const beforeGeneration = await activePlayer.evaluate(() => window.__player.workerGeneration)
  await activePlayer.evaluate(() => window.__player.inspect('lose-context'))
  await activePlayer.waitForFunction(previous => window.__player?.ready && window.__player.workerGeneration > previous, beforeGeneration)
  console.log('ok    simulated GPU context loss replaces and reinitializes the worker without navigating DSH')
  assert.deepEqual(errors, [])
  console.log('extended audit regressions ok')
} finally { await browser?.close(); await h.close() }
