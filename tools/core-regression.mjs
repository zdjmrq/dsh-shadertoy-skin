import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { startHarness } from './browser-harness.mjs'

const h = await startHarness()
let browser
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.env.CI ? 'chrome' : 'msedge'), headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] })
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  const load = async () => {
    await page.goto(h.url)
    await page.waitForSelector('iframe[title="ShaderToy 背景设置"]')
    const p = page.frames().find(f => f.url().includes('panel.html'))
    await p.waitForSelector('#preset-dd .dd-trigger')
    return p
  }
  let panel = await load()
  const player = () => page.frames().find(f => f.url().includes('player.html'))
  await player().waitForFunction(() => window.__player?.ready)
  const stored = async () => JSON.parse(await readFile(join(h.home, 'shader-skin.json'), 'utf8'))
  const save = () => page.waitForResponse(r => r.url().endsWith('/state') && r.request().method() === 'PUT' && r.status() === 200)
  let saved = save()
  await panel.fill('#glass', '47')
  await saved
  await panel.click('#preset-dd .dd-trigger')
  await panel.locator('#preset-dd .dd-item').nth(1).click()
  await panel.waitForFunction(() => document.querySelector('#note').textContent === '已保存')
  assert.equal(await panel.inputValue('#glass'), '47')
  assert.equal((await stored()).settings.glass, 47)
  assert.equal(await panel.evaluate(() => document.documentElement.dataset.panels), 'half')
  console.log('ok    appearance stays global when changing artwork, default surfaces are translucent')

  // An obsolete renderer init acknowledgement cannot change the panel owner.
  await page.evaluate(() => document.querySelector('iframe[title="ShaderToy 背景设置"]').contentWindow.postMessage({ type: 'preset', id: 'aurora' }, location.origin))
  await panel.waitForTimeout(80)
  assert.match(await panel.textContent('#preset-dd .dd-trigger'), /流体/)
  console.log('ok    a stale renderer acknowledgement cannot roll back active artwork')

  await page.evaluate(() => document.body.style.setProperty('--dsw-alias-bg-base', '#fff'))
  await page.waitForFunction(() => document.body.style.getPropertyValue('--dsw-alias-bg-base') === 'transparent')
  await page.evaluate(() => document.body.style.setProperty('--dsw-alias-bg-layer-1', '#fff'))
  await page.waitForFunction(() => document.body.style.getPropertyValue('--dsw-alias-bg-layer-1').includes('0.47'))
  console.log('ok    late shell/theme style resets are repaired by value')

  // A page can disappear before debounce dispatch. Abort the write, retain the
  // local journal, then remount the real panel and verify recovery reaches disk.
  await page.route('**/shader-skin/state', r => r.request().method() === 'PUT' ? r.abort() : r.continue())
  await panel.fill('#brightness', '135')
  await panel.waitForTimeout(400)
  await page.unroute('**/shader-skin/state')
  panel = await load()
  await panel.waitForFunction(() => document.querySelector('#brightness').value === '135')
  await panel.waitForFunction(() => !localStorage.getItem('shadertoy-skin.pending-state'))
  assert.equal((await stored()).overrides.flow.brightness, 135)
  console.log('ok    failed or interrupted saves recover on reopening without replacing a newer disk revision')

  await panel.click('#tab-code')
  await panel.waitForFunction(() => document.querySelector('#code-image').value.includes('mainImage'))
  await panel.selectOption('#code-font', '18')
  for (const dark of [true, false]) {
    await page.evaluate(d => document.body.toggleAttribute('data-ds-dark-theme', d), dark)
    await panel.waitForFunction(d => document.documentElement.dataset.theme === (d ? 'dark' : 'light'), dark)
    const palette = await panel.locator('#code-font option').first().evaluate(n => ({ fg: getComputedStyle(n).color, bg: getComputedStyle(n).backgroundColor, scheme: getComputedStyle(n).colorScheme }))
    assert.notEqual(palette.fg, palette.bg)
    assert.notEqual(palette.bg, 'rgba(0, 0, 0, 0)')
    assert.equal(palette.scheme, dark ? 'dark' : 'light')
  }
  console.log('ok    font options have explicit contrasting ink, solid backgrounds and matching native schemes')

  // Real browser pointer events, including user-select:auto text and an editable
  // descendant. No preventDefault/capture should disrupt the host's selection.
  await page.evaluate(() => {
    document.querySelector('#main').style.display = 'none'
    const fixture = document.createElement('div')
    fixture.id = 'pointer-fixture'
    fixture.innerHTML = '<div id="blank" style="position:fixed;inset:0 0 0 200px"></div><div id="reply" style="position:fixed;left:260px;top:170px;color:white">Text selection in a normal div must belong to DSH.</div><div contenteditable="plaintext-only" style="position:fixed;left:260px;top:240px;color:white"><span id="editable">Editable composer content</span></div><button id="button" style="position:fixed;left:260px;top:300px">Button</button>'
    document.body.append(fixture)
    window.__mouseEvents = []
    document.querySelector('#shadertoy-skin-bg').contentWindow.addEventListener('message', e => { if (e.data?.type === 'mouse') window.__mouseEvents.push(e.data.mouse) })
  })
  await page.mouse.move(500, 500)
  await page.mouse.down()
  await page.mouse.move(580, 540, { steps: 5 })
  await page.waitForFunction(() => window.__mouseEvents.some(m => m[2] > 0))
  await page.mouse.up()
  await page.waitForFunction(() => window.__mouseEvents.at(-1)?.[2] < 0, null, { timeout: 5000 })
  let events = await page.evaluate(() => window.__mouseEvents)
  assert.ok(events.some(m => m[2] > 0))
  assert.ok(events.at(-1)[2] < 0)
  const anchor = events.find(m => m[2] > 0).slice(2)
  assert.ok(events.filter(m => m[2] > 0).every(m => m[2] === anchor[0] && m[3] === anchor[1]))
  await page.evaluate(() => window.__mouseEvents = [])
  await page.mouse.move(265, 180)
  await page.mouse.down()
  await page.mouse.move(530, 180, { steps: 7 })
  await page.mouse.up()
  assert.ok(await page.evaluate(() => getSelection().toString().length > 0))
  assert.equal(await page.evaluate(() => window.__mouseEvents.length), 0)
  await page.evaluate(() => getSelection().removeAllRanges())
  await page.click('#editable')
  await page.keyboard.type(' test')
  await page.mouse.move(500, 500)
  await page.mouse.down()
  await page.mouse.move(530, 520, { steps: 3 })
  await page.mouse.up()
  assert.equal(await page.evaluate(() => window.__mouseEvents.length), 0)
  await page.evaluate(() => document.activeElement.blur())
  await page.mouse.move(500, 500)
  await page.mouse.down()
  await page.mouse.move(560, 530, { steps: 3 })
  await page.evaluate(() => {
    const r = document.createRange(); r.selectNodeContents(document.querySelector('#reply')); getSelection().removeAllRanges(); getSelection().addRange(r)
  })
  await page.waitForFunction(() => window.__mouseEvents.at(-1)?.[2] < 0, null, { timeout: 5000 })
  events = await page.evaluate(() => window.__mouseEvents)
  assert.ok(events.at(-1)?.[2] < 0, 'selection cancellation must release iMouse: ' + JSON.stringify(events))
  await page.mouse.up()
  await page.evaluate(() => { getSelection().removeAllRanges(); document.querySelector('#pointer-fixture').remove(); document.querySelector('#main').style.display = '' })
  console.log('ok    blank drags steer, normal text selects, composer input is isolated, cancellation always releases')

  const init = async (name, image, sound, params = {}) => {
    await page.evaluate(data => document.querySelector('#shadertoy-skin-bg').contentWindow.postMessage({ type: 'init', preset: { name: data.name, code: { image: data.image, sound: data.sound } }, params: { loop: true, loopMode: 'auto', audioDurationMode: 'auto', audioMode: 'loop', speed: 2, fps: 60, dim: 1, tintMix: 0, muted: true, ...data.params } }, location.origin), { name, image, sound, params })
    await player().waitForFunction(name => window.__player?.preset === name && window.__player?.ready, name)
  }
  const mario = await readFile(new URL('../native-dist/presets/mario.glsl', import.meta.url), 'utf8')
  const music = await readFile(new URL('../native-dist/presets/mario-sound.glsl', import.meta.url), 'utf8')
  await init('mario-duration', mario, music)
  assert.equal(await player().evaluate(() => window.__player.playback.duration), 60)
  assert.equal(await player().evaluate(() => window.__player.playback.musicDuration), 60)
  const fade = 'void mainImage(out vec4 c,in vec2 p){ c=vec4(vec3(1.0 - smoothstep(0.5,1.2,iTime)),1); }'
  await init('finite-fade', fade)
  await player().waitForFunction(() => window.__player.playback.repeats >= 2)
  assert.ok(await player().evaluate(() => window.__player.playback.time < 1.2))
  assert.ok(await player().evaluate(() => window.__player.playback.frame < 120))
  await init('finite-clamp', 'void mainImage(out vec4 c,in vec2 p){ c=vec4(vec3(min(iTime/3.0,1.0)),1); }')
  await player().waitForFunction(() => window.__player.playback.repeats >= 1, null, { timeout: 18000 })
  await init('continuous', 'void mainImage(out vec4 c,in vec2 p){ c=vec4(vec3(0.5+0.5*sin(iTime*2.0)),1); }')
  await player().waitForFunction(() => window.__player.playback.time > 13, null, { timeout: 18000 })
  assert.equal(await player().evaluate(() => window.__player.playback.repeats), 0)
  await init('static', 'void mainImage(out vec4 c,in vec2 p){ c=vec4(0.4,0.5,0.7,1); }')
  await player().waitForFunction(() => window.__player.playback.time > 9, null, { timeout: 12000 })
  assert.equal(await player().evaluate(() => window.__player.playback.repeats), 0)
  console.log('ok    actual fade/clamp animations replay automatically; static and continuous shaders keep playing')

  const finiteSound = 'vec2 mainSound(float time){return vec2(sin(time*400.0)*(1.0-smoothstep(0.5,1.0,time)));}'
  await init('sound-once', fade, finiteSound, { audioMode: 'once' })
  await player().waitForFunction(() => window.__player.audio.state === 'ended', null, { timeout: 7000 })
  assert.ok(await player().evaluate(() => window.__player.playback.repeats >= 1))
  await init('sound-loop', fade, finiteSound)
  await player().waitForFunction(() => window.__player.audio.chunks > 24)
  assert.equal(await player().evaluate(() => window.__player.audio.state), 'running')
  await init('silence-detection', fade, 'vec2 mainSound(float t){return vec2(sin(t*400.0)*step(t,0.7));}', { audioMode: 'once' })
  await player().waitForFunction(() => window.__player.audio.state === 'ended', null, { timeout: 9000 })
  assert.ok(await player().evaluate(() => window.__player.playback.musicDuration < 1))
  await init('silence-loop', fade, 'vec2 mainSound(float t){return vec2(sin(t*400.0)*step(t,0.7));}')
  await player().waitForFunction(() => window.__player.playback.musicDuration > 0 && window.__player.playback.musicDuration < 1 && window.__player.audio.chunks > 55, null, { timeout: 10000 })
  assert.equal(await player().evaluate(() => window.__player.audio.state), 'running')
  assert.ok(await player().evaluate(() => window.__player.playback.musicTime <= window.__player.playback.musicDuration + 0.0001))
  console.log('ok    automatic music duration, once/loop and trailing-silence detection work independently of image looping and mute')
  assert.deepEqual(errors, [])
  console.log('core regressions ok')
} finally { await browser?.close(); await h.close() }
