import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { startHarness } from './browser-harness.mjs'

const h = await startHarness()
let browser
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.env.CI ? 'chrome' : 'msedge'), headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const shader = 'void mainImage(out vec4 c,in vec2 p){float a=texelFetch(iChannel0,ivec2(65,0),0).r;float w=texelFetch(iChannel0,ivec2(87,0),0).r;c=vec4(a,1.-a,max(w,step(.001,iMouse.z)),1.);}'
  const response = await page.request.put(`${h.url}/shader-skin/state`, { data: { version: 2, activeId: 'keyboard-test', settings: { scale: .4, fps: 30 }, entries: [{ id: 'keyboard-test', name: 'Keyboard Test', code: { image: shader, channels: { image: ['keyboard'] } } }] } })
  assert.equal(response.status(), 200)
  await page.goto(h.url)
  await page.waitForSelector('iframe[title="ShaderToy 背景设置"]')
  let panel = page.frames().find(frame => frame.url().includes('panel.html'))
  const player = page.frames().find(frame => frame.url().includes('player.html'))
  await panel.waitForSelector('.wallpaper-preview')
  assert.equal(await panel.locator('.preview-tools button').count(), 1)
  await player.waitForFunction(() => window.__player?.ready)
  assert.match(await panel.textContent('#scale-dd .dd-trigger'), /保留原设置.*40%/)
  assert.equal(await panel.locator('#scale-dd .dd-item').count(), 11)
  assert.equal(await panel.textContent('#fps-dd .dd-trigger'), '30 fps')
  console.log('ok    legacy render quality is visible and retained, without exposing every historical scale')

  const pixel = () => player.evaluate(() => window.__player.inspect('pixel'))
  const waitPixel = async test => {
    let value
    for (let i = 0; i < 25; i++) { value = await pixel(); if (test(value)) return value; await page.waitForTimeout(40) }
    assert.fail(`Unexpected keyboard/mouse pixels: ${value}`)
  }
  const released = () => waitPixel(p => p[1] > p[0] + 60 && p[1] > p[2] + 60)
  const aDown = () => waitPixel(p => p[0] > p[1] + 60)
  await released()
  await panel.press('.wallpaper-preview', 'a')
  await released()
  await panel.click('#tab-code')
  await panel.waitForFunction(() => document.querySelector('#code-image').value.includes('mainImage'))
  await panel.focus('#code-image')
  await page.keyboard.press('a')
  await released()
  await panel.click('#tab-params')
  console.log('ok    ordinary settings and editor typing never forward keys to the background')

  const enter = async () => {
    await panel.click('.wallpaper-preview')
    await panel.waitForFunction(() => document.activeElement?.classList.contains('interaction-surface'))
    assert.equal(await panel.getAttribute('.wallpaper-preview', 'aria-pressed'), 'true')
  }
  await panel.evaluate(() => { const button = document.querySelector('.wallpaper-preview'); button.click(); button.click(); button.click() })
  await page.waitForTimeout(200)
  assert.equal(await panel.getAttribute('.wallpaper-preview', 'aria-pressed'), 'true', 'an older exit acknowledgement must not close a newer preview session')
  await page.keyboard.press('Escape')
  await enter()
  await page.keyboard.down('a')
  await aDown()
  await page.keyboard.up('a')
  await released()
  await page.keyboard.down('w')
  await waitPixel(p => p[2] > p[0] + 60)
  await page.keyboard.up('w')
  await released()
  const bounds = await panel.locator('.interaction-surface').boundingBox()
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await waitPixel(p => p[2] > p[0] + 60)
  await page.mouse.up()
  await released()
  console.log('ok    explicit interaction forwards real keyboard and mouse input through the client into the rendering worker')

  await page.keyboard.down('a'); await aDown()
  await page.keyboard.press('Escape')
  await released(); await page.keyboard.up('a')
  assert.equal(await panel.getAttribute('.wallpaper-preview', 'aria-pressed'), 'false')
  await enter(); await page.keyboard.down('a'); await aDown()
  await page.keyboard.press('Tab'); await released(); await page.keyboard.up('a')
  assert.equal(await panel.getAttribute('.wallpaper-preview', 'aria-pressed'), 'false')
  await enter(); await page.keyboard.down('a'); await aDown()
  await page.keyboard.down('Control'); await released(); await page.keyboard.up('Control'); await page.keyboard.up('a')
  assert.equal(await panel.getAttribute('.wallpaper-preview', 'aria-pressed'), 'false')
  console.log('ok    Escape, Tab and system modifier shortcuts release held keys and leave keyboard interaction')

  await enter(); await page.keyboard.down('a'); await aDown()
  await page.evaluate(() => {
    const input = document.createElement('input'); input.id = 'dsh-composer-test'; input.style = 'position:fixed;top:5px;left:5px;z-index:1000'
    document.body.append(input); input.focus()
  })
  await released(); await page.keyboard.up('a')
  await page.keyboard.type('aW')
  assert.equal(await page.inputValue('#dsh-composer-test'), 'aW')
  await released()
  assert.equal(await panel.getAttribute('.wallpaper-preview', 'aria-pressed'), 'false')
  console.log('ok    moving focus to a DSH input exits interaction and typing affects only that input')

  await enter(); await page.keyboard.down('a'); await aDown()
  await page.evaluate(() => { const frame = document.querySelector('iframe[title="ShaderToy 背景设置"]'); frame.src = frame.src })
  await released(); await page.keyboard.up('a')
  panel = page.frames().find(frame => frame.url().includes('panel.html'))
  await panel.waitForSelector('.wallpaper-preview')
  assert.equal(await panel.getAttribute('.wallpaper-preview', 'aria-pressed'), 'false')
  await panel.evaluate(() => parent.postMessage({ type: 'interaction-key', keyCode: 65, down: true }, location.origin))
  await released()
  await panel.click('#tab-code')
  await panel.waitForFunction(() => document.querySelector('#code-image').value.includes('mainImage'))
  assert.equal(await panel.locator('#project-channels select').first().inputValue(), 'keyboard')
  assert.deepEqual(await panel.locator('#project-channels select').first().locator('optgroup').evaluateAll(nodes => nodes.map(node => node.label)), ['内置纹理', '交互输入'])
  await panel.click('#tab-library')
  await panel.fill('#paste-name', 'Keyboard From UI')
  await panel.fill('#paste-image', shader)
  await panel.click('#paste-channel-details summary')
  await panel.locator('#paste-channels select').first().selectOption('keyboard')
  assert.match(await panel.textContent('#paste-channel-details summary'), /1\/4 已连接/)
  await panel.click('#paste-add')
  await panel.waitForFunction(() => document.querySelector('#preset-dd .dd-trigger').textContent.includes('Keyboard From UI'))
  await player.waitForFunction(() => window.__player.ready && window.__player.preset === 'Keyboard From UI')
  await enter(); await page.keyboard.down('a'); await aDown(); await page.keyboard.up('a'); await released()
  await page.keyboard.press('Escape')
  const keyboardWork = await page.evaluate(async () => {
    const { createPipeline } = await import('/shader-skin/pipeline.js')
    const gl = new OffscreenCanvas(16, 16).getContext('webgl2')
    const pipeline = await createPipeline(gl, { image: 'unused', channels: { image: ['keyboard'] } }, () => ({}))
    const data = pipeline.textures.get('keyboard').data
    let clears = 0, uploads = 0
    const fill = data.fill.bind(data), upload = gl.texSubImage2D.bind(gl)
    data.fill = (...args) => { clears++; return fill(...args) }
    gl.texSubImage2D = (...args) => { uploads++; return upload(...args) }
    const frame = () => { pipeline.channels('image', {}, 1); pipeline.endFrame() }
    for (let i = 0; i < 120; i++) frame()
    const idle = { clears, uploads }
    pipeline.key(65, true)
    const pressed = [data[65 * 4], data[(65 + 256) * 4], data[(65 + 512) * 4]]
    frame(); frame()
    for (let i = 0; i < 120; i++) { pipeline.key(65, true); frame() }
    const held = { clears, uploads, pulse: data[(65 + 256) * 4] }
    pipeline.key(65, false); pipeline.key(65, true)
    const toggled = data[(65 + 512) * 4]
    pipeline.releaseKeys()
    const released = [data[65 * 4], data[(65 + 256) * 4]]
    pipeline.dispose()
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return { idle, pressed, held, toggled, released }
  })
  assert.deepEqual(keyboardWork, { idle: { clears: 0, uploads: 0 }, pressed: [255, 255, 255], held: { clears: 1, uploads: 2, pulse: 0 }, toggled: 0, released: [0, 0] })
  assert.deepEqual(errors, [])
  console.log('ok    panel reloads release held keys; interaction is not remembered and unarmed key messages are ignored')
  console.log('ok    grouped channel controls retain current connections; keyboard imports without Buffer passes reach the real renderer')
  console.log('ok    idle/held keyboard channels do zero per-frame clearing or uploads, while press/toggle/release semantics remain intact')
} finally { await browser?.close(); await h.close() }
