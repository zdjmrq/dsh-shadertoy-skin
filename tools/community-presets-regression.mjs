// Real WebGL checks for the three multi-pass projects added after 0.4.4.
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { startHarness } from './browser-harness.mjs'
import { loadBuiltin } from '../native-dist/project.js'
import { fileURLToPath } from 'node:url'

const h = await startHarness()
const shots = new URL('../.tmp-validation/new-presets/', import.meta.url)
await mkdir(shots, { recursive: true })
let browser
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.env.CI ? 'chrome' : 'msedge'),
    headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
  const manifest = JSON.parse(await readFile(new URL('../native-dist/presets/index.json', import.meta.url), 'utf8'))
  const errors = []
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } })
  page.on('pageerror', error => errors.push(error.message))
  const codes = new Map()
  for (const [id, name, count] of [['strange-lines', '诡异的线条', 4], ['mountain-paint', '造山', 3], ['dungeon-game', '地牢游戏', 4]]) {
    const item = manifest.find(item => item.id === id)
    assert.equal(item.name, name)
    const code = await loadBuiltin(item, async file => {
      const response = await fetch(`${h.url}/shader-skin/presets/${file}`)
      assert.equal(response.status, 200)
      return response.text()
    })
    codes.set(id, code)
    await page.goto(`${h.url}/shader-skin/player.html?preset=${id}&scale=1&fps=30&muted=1&dim=1&tintMix=0`)
    await page.waitForFunction(() => window.__player?.ready && window.__player.frames >= 20, null, { timeout: 90000 })
    const state = await page.evaluate(() => window.__player)
    assert.equal(state.project.buffers.length, count)
    assert.ok(state.project.bufferBytes <= 96 * 1024 * 1024)
    assert.ok(!await page.locator('#err.open').count())
    await page.screenshot({ path: fileURLToPath(new URL(`${id}.png`, shots)) })
    // Decode the screenshot instead of reading a transferred worker canvas.
    const png = (await page.screenshot()).toString('base64')
    const detail = await page.evaluate(async png => {
      const image = new Image(); image.src = `data:image/png;base64,${png}`; await image.decode()
      const c = document.createElement('canvas'); c.width = image.width; c.height = image.height
      const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0)
      const data = ctx.getImageData(0, 0, c.width, c.height).data
      let min = 255, max = 0, lit = 0
      for (let i = 0; i < data.length; i += 4) {
        const v = (data[i] + data[i + 1] + data[i + 2]) / 3
        min = Math.min(min, v); max = Math.max(max, v); if (v > 6) lit++
      }
      return { range: max - min, lit: lit / (data.length / 4) }
    }, png)
    assert.ok(detail.range > 20 && detail.lit > .01, `${id} must draw actual content: ${JSON.stringify(detail)}`)
    console.log(`ok    ${name}: ${count} buffers, real pixels, memory bound, no renderer error`)
  }

  // Sample a known height/detail ramp through the real terrain lookup helpers.
  // The image canvas and capped float buffers differ at desktop resolutions.
  const sampling = structuredClone(codes.get('mountain-paint'))
  sampling.buffers.B = 'void mainImage(out vec4 c,in vec2 p){c=vec4(.4+.2*p.x/BUFFER_SIZE.x,pack4(vec4(127.,255.,64.,192.)/255.),0.);}'
  sampling.buffers.C = 'void mainImage(out vec4 c,in vec2 p){c=vec4(.3*p.y/BUFFER_SIZE.y,0.,0.,1.);}'
  sampling.image = sampling.image.slice(0, sampling.image.indexOf('void mainImage(')) + `
    void mainImage(out vec4 c,in vec2 p){
      vec2 uv=vec2(.4,.6); vec4 data;
      vec3 v=GetChannel0Data(uv,data);
      float h=GetChannel0(uv).x;
      float n=GetChannel1(uv).x;
      vec4 expected=vec4(127.,255.,64.,192.)/255.;
      float materialError=length(data-expected);
      c=vec4(abs(h-.48)*10.,abs(n-.18)*10.,materialError*10.,1.);
    }`
  for (const [width,height] of [[1920,1080],[720,1280],[320,200]]) {
    await page.setViewportSize({ width,height })
    await page.goto(`${h.url}/shader-skin/player.html?preset=aurora&muted=1&dim=1&tintMix=0`)
    await page.waitForFunction(() => window.__player?.ready)
    await page.evaluate(code => window.postMessage({type:'init',preset:{name:'terrain-sampling',code},params:{dim:1,tintMix:0,fps:15}},location.origin),sampling)
    await page.waitForFunction(() => window.__player?.preset==='terrain-sampling' && window.__player.frames>4)
    const pixel=await page.evaluate(() => window.__player.inspect('pixel'))
    assert.ok(pixel.slice(0,3).every(v=>v<=2), `height/detail/material lookups at ${width}x${height}: ${pixel}`)
    assert.ok((await page.evaluate(() => window.__player.project.bufferBytes))<=96*1024*1024)
  }
  console.log('ok    terrain height/detail/material sampling agrees at capped desktop, portrait and small resolutions')

  // Force the actual reset path to hold a circle, then check that neither the
  // first nor last segment escapes it. Inspect output pixels, not ready flags.
  await page.setViewportSize({width:1920,height:1080})
  await page.goto(`${h.url}/shader-skin/player.html?preset=strange-lines&scale=1&fps=30&muted=1&dim=1&tintMix=0`)
  await page.waitForFunction(() => window.__player?.ready && window.__player.frames>5)
  await page.keyboard.down('Space')
  const resetFrame=await page.evaluate(() => window.__player.frames)
  await page.waitForFunction(frame => window.__player.frames>frame+26,resetFrame,{timeout:90000})
  const circleSize=await page.evaluate(() => window.__player.project)
  assert.ok(circleSize.width<1920,'line test must hit buffer cap')
  const circlePng=(await page.screenshot()).toString('base64')
  await page.keyboard.up('Space')
  const circle=await page.evaluate(async ({png,w,h})=>{
    const image=new Image();image.src=`data:image/png;base64,${png}`;await image.decode()
    const c=document.createElement('canvas');c.width=image.width;c.height=image.height
    const ctx=c.getContext('2d');ctx.drawImage(image,0,0)
    const data=ctx.getImageData(0,0,c.width,c.height).data
    let lit=0,outside=0
    for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
      if(data[(y*c.width+x)*4]<32)continue
      lit++
      const radius=Math.hypot((x+.5)/c.width*w-w*.5,(y+.5)/c.height*h-h*.5)
      if(Math.abs(radius-h*.25)>4)outside++
    }
    return {lit,outside}
  },{png:circlePng,w:circleSize.width,h:circleSize.height})
  assert.ok(circle.lit>1000 && circle.outside===0,`closed ring without stray spikes: ${JSON.stringify(circle)}`)
  await page.screenshot({path:fileURLToPath(new URL('strange-lines-1080p.png',shots))})
  console.log('ok    line ring stays closed without stray segments under the memory cap; output segments are antialiased')
  await page.setViewportSize({width:640,height:400})

  // Also exercise free simulation: resetting every frame would hide a broken
  // first/last neighbour inside Buffer A's velocity/position averaging.
  const endpoints=structuredClone(codes.get('strange-lines'))
  endpoints.image=`void mainImage(out vec4 c,in vec2 p){
    R=iChannelResolution[0].xy;
    vec4 a=particle(0.),b=particle(particleCount()-1.);
    c=vec4(length(a.xy-b.xy)/R.y,any(isnan(a))||any(isnan(b))?1.:0.,any(isinf(a))||any(isinf(b))?1.:0.,1.);
  }`
  await page.evaluate(code=>window.postMessage({type:'init',preset:{name:'line-endpoints',code},params:{dim:1,tintMix:0,fps:30}},location.origin),endpoints)
  await page.waitForFunction(()=>window.__player?.preset==='line-endpoints'&&window.__player.frames>40,null,{timeout:90000})
  const gap=await page.evaluate(()=>window.__player.inspect('pixel'))
  assert.ok(gap[0]<8 && gap[1]===0 && gap[2]===0,`simulated endpoints stay adjacent and finite: ${gap}`)
  console.log('ok    line first/last particles remain adjacent during free simulation')

  // Missing iFrameRate previously made the terrain brush fail to compile. Check
  // every pass receives a finite positive rate, including speed=0.
  await page.goto(`${h.url}/shader-skin/player.html?preset=aurora&muted=1`)
  await page.waitForFunction(() => window.__player?.ready)
  const rate = 'void mainImage(out vec4 c,in vec2 p){c=vec4(iFrameRate>0.&&!isinf(iFrameRate)&&!isnan(iFrameRate)?0.:1.,iFrameRate/120.,0.,1.);}'
  for (const speed of [0, .5, 2]) {
    await page.evaluate(({ rate, speed }) => window.postMessage({ type: 'init', preset: { name: `rate-${speed}`, code: { image: rate, buffers: { A: rate } } }, params: { speed, dim: 1, tintMix: 0, fps: 30 } }, location.origin), { rate, speed })
    await page.waitForFunction(name => window.__player?.preset === name && window.__player.ready && window.__player.frames > 4, `rate-${speed}`)
    const pixel = await page.evaluate(() => window.__player.inspect('pixel'))
    assert.ok(pixel[0] < 5 && pixel[1] > 0, `finite positive iFrameRate at speed ${speed}: ${pixel}`)
  }
  console.log('ok    iFrameRate is positive and finite at initial/frozen/scaled image clocks')

  // The terrain brush should grow, invert with Shift, reset with Backspace,
  // and never poison its derivative state at the centre of the initial bump.
  const terrain = structuredClone(codes.get('mountain-paint'))
  terrain.buffers = { A: terrain.buffers.A }
  terrain.bufferSettings = { A: terrain.bufferSettings.A }
  terrain.channels = { A: ['buffer:A', 'keyboard'], image: ['buffer:A'] }
  terrain.image = 'void mainImage(out vec4 c,in vec2 p){vec3 v=texelFetch(iChannel0,ivec2(iChannelResolution[0].xy*.5),0).xyz;c=vec4(v.x,any(isnan(v))?1.:0.,any(isinf(v))?1.:0.,1.);}'
  await page.evaluate(code => window.postMessage({ type: 'init', preset: { name: 'terrain-brush-test', code }, params: { speed: 0, dim: 1, tintMix: 0, fps: 30 } }, location.origin), terrain)
  await page.waitForFunction(() => window.__player?.preset === 'terrain-brush-test' && window.__player.frames > 5)
  const read = () => page.evaluate(() => window.__player.inspect('pixel'))
  const initial = await read()
  assert.ok(initial[0] > 130 && initial[1] === 0 && initial[2] === 0, `finite initial height and derivatives: ${initial}`)
  await page.mouse.move(320, 200); await page.mouse.down(); await page.waitForTimeout(1300); await page.mouse.up()
  const raised = await read()
  assert.ok(raised[0] > initial[0] && raised[1] === 0 && raised[2] === 0, `paint raises terrain: ${initial} -> ${raised}`)
  await page.keyboard.down('Shift'); await page.mouse.down(); await page.waitForTimeout(1300); await page.mouse.up(); await page.keyboard.up('Shift')
  const lowered = await read()
  assert.ok(lowered[0] < raised[0] && lowered[1] === 0 && lowered[2] === 0, `Shift inverts brush: ${raised} -> ${lowered}`)
  await page.keyboard.down('Backspace'); await page.waitForTimeout(200); await page.keyboard.up('Backspace')
  assert.ok(Math.abs((await read())[0] - initial[0]) <= 1, 'Backspace restores initial terrain')
  console.log('ok    terrain paint / Shift / Backspace really change persistent height; derivatives remain finite')

  // At 1080p the four float32 buffers hit the memory cap. The final compositor
  // must still cover the full window rather than texelFetch outside Buffer D.
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(`${h.url}/shader-skin/player.html?preset=dungeon-game&scale=1&fps=15&muted=1&dim=1&tintMix=0`)
  await page.waitForFunction(() => window.__player?.ready && window.__player.frames > 5, null, { timeout: 60000 })
  const large = await page.evaluate(() => window.__player.project)
  assert.ok(large.width < 1920 && large.bufferBytes <= 96 * 1024 * 1024)
  const largePng = (await page.screenshot()).toString('base64')
  const edge = await page.evaluate(async png => {
    const image = new Image(); image.src = `data:image/png;base64,${png}`; await image.decode()
    const c = document.createElement('canvas'); c.width = image.width; c.height = image.height
    const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0)
    return [...ctx.getImageData(image.width - 2, 1, 1, 1).data]
  }, largePng)
  assert.ok(edge[0] > 20 && edge[1] > 20, `HUD reaches the far edge under memory cap: ${edge}`)
  await page.screenshot({ path: fileURLToPath(new URL('dungeon-game-1080p.png', shots)) })
  console.log('ok    dungeon compositor covers 1080p even when float32 buffers are memory-limited')
  await page.setViewportSize({ width: 640, height: 400 })

  // Test the actual game state through the existing explicit interaction UI,
  // rather than accepting an animation or a ready flag as proof of playability.
  const dungeon = structuredClone(codes.get('dungeon-game'))
  dungeon.image = 'void mainImage(out vec4 c,in vec2 p){vec4 a=texelFetch(iChannel0,ivec2(1,0),0);c=vec4(floor(a.x)/32.,fract(a.x)*8.,any(isnan(a))?1.:0.,1.);}'
  dungeon.channels.image = ['buffer:A']
  await page.request.put(`${h.url}/shader-skin/state`, { data: { version: 2, activeId: 'dungeon-test', settings: { scale: 1, fps: 30 }, entries: [{ id: 'dungeon-test', name: 'Dungeon state', code: dungeon }] } })
  await page.goto(h.url)
  const panel = page.frameLocator('iframe[title="ShaderToy 背景设置"]')
  const player = () => page.frames().find(frame => frame.url().includes('player.html'))
  await panel.locator('.wallpaper-preview').waitFor()
  await player().waitForFunction(() => window.__player?.ready && window.__player.frames > 8)
  await page.evaluate(() => document.querySelector('#shadertoy-skin-bg').contentWindow.postMessage({ type: 'params', params: { dim: 1, tintMix: 0 } }, location.origin))
  await page.waitForTimeout(200)
  const pixel = () => player().evaluate(() => window.__player.inspect('pixel'))
  const before = await pixel()
  assert.ok(Math.abs(before[0] - 24) <= 1 && Math.abs(before[1] - 16) <= 1 && before[2] < 5, `game initializes at (3,2): ${before}`)
  await panel.locator('.wallpaper-preview').click()
  await panel.locator('.wallpaper-preview[aria-pressed="true"]').waitFor()
  const waitGameFrames=async count=>{
    const frame=await player().evaluate(()=>window.__player.frames)
    await player().waitForFunction(({frame,count})=>window.__player.frames>=frame+count,{frame,count},{timeout:30000})
  }
  let moved = false
  for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
    // A slow software renderer may not finish even one game frame in 450 ms.
    // Sample the held state, then let keyLock release on real game frames too.
    await page.keyboard.down(key)
    try { await waitGameFrames(3) } finally { await page.keyboard.up(key) }
    await waitGameFrames(3)
    const after = await pixel()
    assert.ok(after[2] < 5, 'game state stays finite')
    if (after[0] !== before[0] || after[1] !== before[1]) { moved = true; break }
  }
  assert.ok(moved, 'direction keys must move the actual dungeon player')
  await page.keyboard.press('Escape')
  assert.equal(await panel.locator('.wallpaper-preview').getAttribute('aria-pressed'), 'false')
  console.log('ok    dungeon arrow keys move persistent game state only inside explicit interaction')
  assert.deepEqual(errors, [])
} finally {
  await browser?.close()
  await h.close()
}
