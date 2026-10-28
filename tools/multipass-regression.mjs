import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { startHarness } from './browser-harness.mjs'
import { normalizeCode, sourceFor, parseDocument, codeBytes, loadBuiltin } from '../native-dist/project.js'

const image = 'void mainImage(out vec4 c,in vec2 p){c=vec4(sharedValue());}'
const common = 'float sharedValue(){return .5;}'
const parsed = parseDocument(JSON.stringify({ renderpass: [
  { type: 'common', code: common }, { type: 'buffer', code: image, outputs: [{ id: 99 }] },
  { type: 'image', code: image, inputs: [{ channel: 0, ctype: 'buffer', id: 99 }] },
] }))
assert.equal(parsed.buffers.A, image)
assert.equal(parsed.channels.image[0], 'buffer:A')
assert.ok(sourceFor(parsed, 'A').includes(common))
assert.throws(() => normalizeCode({ image, channels: { image: ['buffer:D'] } }), /通道/)
assert.throws(() => normalizeCode({ image, assets: { x: 'https://example.com/private.png' } }), /内嵌/)
assert.throws(() => normalizeCode({ image, includes: { '../escape': '' } }), /文件名/)
assert.throws(() => sourceFor({ image: '#include "a.glsl"', includes: { 'a.glsl': '#include "a.glsl"' } }, 'image'), /循环/)
assert.ok(codeBytes(parsed) > Buffer.byteLength(image))
assert.equal(normalizeCode({ image: '\uFEFF' + image + '\r\n', common: common + '\r\n' }).common, common + '\n')
console.log('ok    shared project format validates channels, file boundaries, include cycles and aggregate source bytes')

const h = await startHarness()
let browser
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.env.CI ? 'chrome' : 'msedge'), headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] })
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(h.url)
  await page.waitForSelector('iframe[title="ShaderToy 背景设置"]')
  const panel = page.frames().find(frame => frame.url().includes('panel.html'))
  await panel.waitForSelector('#preset-dd .dd-trigger')
  await panel.click('#tab-library')
  await panel.setInputFiles('#project-input', [
    { name: 'Common.glsl', mimeType: 'text/plain', buffer: Buffer.from(common) },
    { name: 'Buffer A.glsl', mimeType: 'text/plain', buffer: Buffer.from(image) },
    { name: 'Image.glsl', mimeType: 'text/plain', buffer: Buffer.from('void mainImage(out vec4 c,in vec2 p){c=texture(iChannel0,p/iResolution.xy);}') },
  ])
  await panel.fill('#project-name', 'Multi-file test')
  await panel.click('#project-import')
  await panel.waitForSelector('#project-tabs button[data-file="buffers:A"]')
  assert.ok(!(await panel.textContent('#code-image-info')).includes('未保存'), 'freshly imported projects must start clean')
  await panel.click('#project-tabs button[data-file="common"]')
  await panel.locator('[data-project-file="common"]').fill('float sharedValue(){return .75;}')
  await panel.click('#project-tabs button[data-file="buffers:A"]')
  assert.equal(await panel.locator('[data-project-file="buffers:A"]').isVisible(), true)
  assert.equal(await panel.locator('#code-image').isVisible(), false)
  await panel.click('#code-save')
  await panel.waitForFunction(() => document.querySelector('#code-note').textContent.includes('已保存'))
  const disk = JSON.parse(await readFile(join(h.home, 'shader-skin.json'), 'utf8'))
  const entry = disk.entries.find(entry => entry.id === disk.activeId)
  assert.ok(entry.code.common.includes('.75'))
  assert.equal(entry.code.channels.image[0], 'buffer:A')
  const player = page.frames().find(frame => frame.url().includes('player.html'))
  await player.waitForFunction(() => window.__player?.ready && window.__player.project?.buffers.length === 1)
  await panel.click('#project-new')
  await panel.fill('#project-filename', 'helper.glsl')
  await panel.click('#project-create')
  await panel.locator('[data-project-file="includes:helper.glsl"]').fill('float extraValue(){return .2;}')
  await panel.click('#code-save')
  await panel.waitForFunction(() => document.querySelector('#code-note').textContent.includes('已保存'))
  const updated = JSON.parse(await readFile(join(h.home, 'shader-skin.json'), 'utf8')).entries[0]
  assert.ok(updated.code.includes['helper.glsl'].includes('extraValue'))
  // The client half may still deliver its own queued `init` (panel save ->
  // preset -> sendInit) after an injected one; that is legitimate market
  // behaviour, so wait until the injected preset has actually settled instead
  // of accepting a single observable blip.
  const injectPreset = async (preset, params) => {
    for (let attempt = 0; attempt < 15; attempt++) {
      if (attempt) await panel.waitForTimeout(100)
      await page.evaluate(
        ({ preset, params }) => document.querySelector('#shadertoy-skin-bg').contentWindow.postMessage({ type: 'init', preset, params }, location.origin),
        { preset, params },
      )
      let stable = 0
      while (stable < 3) {
        await panel.waitForTimeout(150)
        const state = await player.evaluate(() => ({ preset: window.__player?.preset, ready: window.__player?.ready }))
        if (state.preset !== preset.name || !state.ready) break
        stable++
      }
      if (stable === 3) return true
    }
    return false
  }
  /** Read back the centre-ish pixel, retrying while a frame is still in flight. */
  const pixelMatches = async (matches, timeoutMs = 5000) => {
    const started = Date.now()
    let last = []
    while (Date.now() - started < timeoutMs) {
      last = await player.evaluate(() => window.__player.inspect('pixel')).catch(() => [])
      if (matches(last)) return last
      await panel.waitForTimeout(100)
    }
    return last
  }
  const adopted = await injectPreset({ name: 'packed-state', code: {
    image: 'void mainImage(out vec4 c,in vec2 p){vec4 v=texelFetch(iChannel0,ivec2(0),0);bool ok=v.x==-2.&&v.y==4.&&v.w==-12345678.;c=ok?vec4(0,1,0,1):vec4(1,0,0,1);}',
    buffers: { A: 'void mainImage(out vec4 c,in vec2 p){c=vec4(-2,4,16,-12345678.);}' }, channels: { image: ['buffer:A'] },
  } }, { dim: 1, tintMix: 0 })
  assert.ok(adopted, 'the injected packed-state preset must settle in the player')
  const packedPixel = await pixelMatches(pixel => pixel[0] < 5 && pixel[1] > 250)
  assert.ok(packedPixel[0] < 5 && packedPixel[1] > 250,
    `float state must retain signed/HDR/24-bit values: ${packedPixel}`)

  // ShaderToy iChannelTime is the buffer pass time and 0 for textures. The
  // player used to report the running frame time for font/noise as well.
  const channelTime = await injectPreset({
    name: 'channel-time',
    code: {
      image: 'void mainImage(out vec4 c,in vec2 p){bool ok=iChannelTime[0]==0.0&&iChannelTime[1]==0.0;c=ok?vec4(0.,1.,0.,1.):vec4(1.,0.,0.,1.);}',
      channels: { image: ['font', 'noise'] },
    },
  }, { dim: 1, tintMix: 0 })
  assert.ok(channelTime, 'the channel-time preset must settle in the player')
  // Inspect after the clock moved: at frame 1 iTime is still 0 and both the old
  // and new behaviour look identical.
  await player.waitForFunction(() => window.__player.frames > 10)
  const channelPixel = await pixelMatches(pixel => pixel[1] > 250 && pixel[0] < 5)
  assert.ok(channelPixel[1] > 250 && channelPixel[0] < 5, `texture channels must report iChannelTime 0: ${channelPixel}`)

  for (const mime of ['image/png', 'image/jpeg', 'image/webp']) {
    const asset = await page.evaluate(mime => {
      const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16
      const ctx = canvas.getContext('2d'); ctx.fillStyle = 'red'; ctx.fillRect(0, 0, 16, 8); ctx.fillStyle = 'blue'; ctx.fillRect(0, 8, 16, 8)
      return canvas.toDataURL(mime, 1)
    }, mime)
    assert.ok(await injectPreset({ name: `orientation-${mime}`, code: {
      image: 'void mainImage(out vec4 c,in vec2 p){c=texture(iChannel0,vec2(.5,.25));}',
      assets: { 'test-image': asset }, channels: { image: ['asset:test-image'] },
    } }, { dim: 1, tintMix: 0 }), `${mime} texture loads`)
    const sample = await pixelMatches(pixel => pixel[2] > 230 && pixel[0] < 15)
    assert.ok(sample[2] > 230 && sample[0] < 15, `${mime} bottom-left UVs must sample the blue lower half: ${sample}`)
  }
  console.log('ok    imported PNG, JPEG and WebP retain bottom-left texture coordinates without vertical inversion')

  // A piece with both timelines finite loops on the later one, so music and
  // picture cannot drift apart (the bundled take-on-me has image 209 s / music
  // 180 s; wrapping the music at 180 s would restart it under the visual ending).
  for (const testCase of [
    { name: 'joint-image-later', duration: { image: 3, sound: 2 }, expect: 3 },
    { name: 'joint-music-later', duration: { image: 2, sound: 3 }, expect: 3 },
  ]) {
    const settled = await injectPreset({
      name: testCase.name,
      code: {
        image: 'void mainImage(out vec4 c,in vec2 p){c=vec4(0.,1.,0.,1.);}',
        sound: 'vec2 mainSound(float t){return vec2(0.0);}',
        duration: testCase.duration,
      },
    }, { dim: 1, tintMix: 0 })
    assert.ok(settled, `${testCase.name} must settle in the player`)
    /** @type {{loopPeriod?: number, imageDuration?: number|null, musicDuration?: number|null}} */
    let playback = {}
    for (let attempt = 0; attempt < 10; attempt++) {
      playback = await player.evaluate(() => window.__player.playback)
      if (playback.loopPeriod === testCase.expect && playback.musicDuration === testCase.duration.sound) break
      await panel.waitForTimeout(150)
    }
    assert.equal(playback.loopPeriod, testCase.expect, `${testCase.name}: ${JSON.stringify(playback)}`)
    assert.equal(playback.imageDuration, testCase.duration.image, `${testCase.name} image duration: ${JSON.stringify(playback)}`)
    assert.equal(playback.musicDuration, testCase.duration.sound, `${testCase.name} music duration: ${JSON.stringify(playback)}`)
  }
  console.log('ok    when image and music both end, the pair loops on the later timeline')

  // The joint period is only meaningful at 1x: the image clock is speed-scaled,
  // the music runs on realtime. Off 1x each timeline keeps its own period.
  const fastSettled = await injectPreset({
    name: 'joint-speed2',
    code: {
      image: 'void mainImage(out vec4 c,in vec2 p){c=vec4(0.,1.,0.,1.);}',
      sound: 'vec2 mainSound(float t){return vec2(0.0);}',
      duration: { image: 3, sound: 2 },
    },
  }, { dim: 1, tintMix: 0, speed: 2 })
  assert.ok(fastSettled, 'joint-speed2 must settle in the player')
  let fastPlayback = {}
  for (let attempt = 0; attempt < 10; attempt++) {
    fastPlayback = await player.evaluate(() => window.__player.playback)
    if (fastPlayback.jointPeriod === 0 && fastPlayback.musicDuration === 2) break
    await panel.waitForTimeout(150)
  }
  assert.equal(fastPlayback.jointPeriod, 0, `joint loop must not engage off 1x: ${JSON.stringify(fastPlayback)}`)
  assert.equal(fastPlayback.loopPeriod, 3, 'independent image looping still uses its own duration off 1x')
  console.log('ok    joint looping stays off when the picture speed is not 1x')

  assert.deepEqual(errors, [])
  console.log('ok    grouped file import, Common/Buffer tabs and channels reach the real player; texture channels report iChannelTime 0')
  await page.close()

  const shots = fileURLToPath(new URL('../.tmp-validation/new-presets/', import.meta.url))
  await mkdir(shots, { recursive: true })
  const manifest = JSON.parse(await readFile(new URL('../native-dist/presets/index.json', import.meta.url), 'utf8'))
  const rain = manifest.find(item => item.id === 'rain-window')
  const rainNoLightning = manifest.find(item => item.id === 'rain-window-no-lightning')
  assert.deepEqual({ ...rainNoLightning, id: rain.id, name: rain.name, file: rain.file }, rain, 'rain variant must preserve all original metadata, channels and duration')
  const rainSource = (await readFile(new URL(`../native-dist/presets/${rain.file}`, import.meta.url), 'utf8')).replaceAll('\r\n', '\n')
  const rainVariantSource = (await readFile(new URL(`../native-dist/presets/${rainNoLightning.file}`, import.meta.url), 'utf8')).replaceAll('\r\n', '\n')
  const rainLines = rainSource.split('\n')
  const withoutLightning = rainLines.filter(line => !/^\s*(?:float lightning =|lightning \*=|col \*= 1\.\+lightning)/.test(line))
  assert.equal(rainLines.length - withoutLightning.length, 3)
  assert.equal(rainVariantSource.split('\n').slice(1).join('\n'), withoutLightning.join('\n'), 'only the lightning statements change; all other shader code is identical')
  assert.equal(rain.duration, undefined, 'continuous rain must not replay the old 102-second story')
  assert.ok(!/^\s*#define HAS_HEART\s*$/m.test(rainSource), 'the story ending must stay disabled')
  console.log('ok    no-lightning rain variant differs only in its change notice and three removed lightning statements')
  for (const id of ['take-on-me', 'never-gonna-give-you-up', 'rain-window', 'rain-window-no-lightning', 'racing', 'voxel-world', 'tree-in-wind']) {
    const item = manifest.find(item => item.id === id)
    const p = await browser.newPage({ viewport: { width: 640, height: 360 } })
    p.on('pageerror', error => errors.push(`${id}: ${error.message}`))
    p.on('console', message => { if (message.type() === 'warning' && /INVALID|feedback loop/.test(message.text())) errors.push(`${id}: ${message.text()}`) })
    await p.goto(`${h.url}/shader-skin/player.html?preset=${id}&scale=${id === 'voxel-world' ? 1 : .5}&fps=15&muted=1&time=12`)
    await p.waitForFunction(() => window.__player?.ready || document.querySelector('#err').classList.contains('open'), null, { timeout: 120000 })
    assert.equal(await p.textContent('#err'), '', id)
    await p.waitForFunction(minimum => window.__player.frames >= minimum, id === 'voxel-world' ? 80 : 4, { timeout: 30000 })
    const info = await p.evaluate(() => window.__player)
    assert.equal(info.sound, item.hasSound, id)
    assert.equal(info.project.buffers.length, Object.keys(item.bufferFiles ?? {}).length, id)
    if (id === 'take-on-me') assert.equal(info.project.passes[0].format, 'float32', 'packed depth needs all 24 mantissa bits')
    assert.ok(info.project.bufferBytes <= 96 * 1024 * 1024 + 1024, id)
    if (item.hasSound) assert.equal(info.audio.state, 'running', id)
    await p.screenshot({ path: join(shots, `${id}.png`) })
    if (id === 'voxel-world') {
      // Check the actual persistent player position, rather than accepting a
      // ready flag over an empty sky. Exposes the source's zero-speed NaN bug.
      const code = await loadBuiltin(item, file => fetch(`${h.url}/shader-skin/presets/${file}`).then(r => r.text()))
      code.image = 'void mainImage(out vec4 c,in vec2 p){vec3 v=texelFetch(iChannel0,ivec2(0,0),0).rgb;c=vec4(any(isnan(v))?1.:0.,v.z>2.?1.:0.,0.,1.);}'
      code.channels.image = ['buffer:A']
      await p.evaluate(code => window.postMessage({ type: 'init', preset: { name: 'voxel-state-check', code }, params: { speed: 1, dim: 1, tintMix: 0 } }, location.origin), code)
      await p.waitForFunction(() => window.__player.preset === 'voxel-state-check' && window.__player.frames > 10)
      const value = await p.evaluate(() => window.__player.inspect('pixel'))
      assert.ok(value[0] < 5 && value[1] > 250, `persistent position must stay finite and unclamped: ${value}`)
    }
    if (id.startsWith('rain-window')) {
      const late = await browser.newPage({ viewport: { width: 640, height: 360 } })
      late.on('pageerror', error => errors.push(error.message))
      await late.goto(`${h.url}/shader-skin/player.html?preset=${id}&time=85&speed=0&scale=1&fps=15&muted=1&dim=1&tintMix=0`)
      await late.waitForFunction(() => window.__player?.ready && window.__player.frames >= 3)
      await late.addStyleTag({ content: '#diag { display: none !important; }' })
      const detail = async () => {
        const png = (await late.screenshot()).toString('base64')
        return late.evaluate(async png => {
          const image = new Image(); image.src = 'data:image/png;base64,' + png; await image.decode()
          const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
          const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0)
          const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
          let edges = 0, luminance = 0
          const gray = i => (data[i] + data[i + 1] + data[i + 2]) / 3
          for (let y = 20; y < canvas.height - 20; y++) for (let x = 20; x < canvas.width - 20; x++) {
            const i = (y * canvas.width + x) * 4, value = gray(i)
            luminance += value
            edges += Math.abs(value - gray(i - 4)) + Math.abs(value - gray(i - canvas.width * 4))
          }
          return edges / Math.max(1, luminance)
        }, png)
      }
      const currentDetail = await detail()
      await late.screenshot({ path: join(shots, `${id}-85s.png`) })
      // Reproduce the old ending at the identical shader time with the same
      // offline city texture, renderer and viewport, rather than just checking
      // whether new code contains a commented-out define.
      const oldSource = (id === 'rain-window' ? rainSource : rainVariantSource).replace(/^\/\/#define HAS_HEART\s*$/m, '#define HAS_HEART')
      await late.evaluate(({ oldSource, channels }) => window.postMessage({ type: 'init', preset: { name: 'old-rain-ending', code: { image: oldSource, channels } }, params: { speed: 0, dim: 1, tintMix: 0 } }, location.origin), { oldSource, channels: item.channels })
      await late.waitForFunction(() => window.__player?.preset === 'old-rain-ending' && window.__player.frames >= 3)
      const oldDetail = await detail()
      await late.screenshot({ path: join(shots, `${id}-old-85s.png`) })
      assert.ok(currentDetail > oldDetail * 1.5, `${id}: rain detail must survive beyond the old ending (${currentDetail} vs ${oldDetail})`)
      await late.goto(`${h.url}/shader-skin/player.html?preset=${id}&time=3600&speed=1&scale=1&fps=15&muted=1&dim=1&tintMix=0`)
      await late.waitForFunction(() => window.__player?.ready && window.__player.frames >= 3)
      await late.waitForFunction(() => window.__player.playback?.time >= 3600)
      assert.equal(await late.evaluate(() => window.__player.playback.duration), 0, 'auto playback must not rewind to the old story start')
      await late.addStyleTag({ content: '#diag { display: none !important; }' })
      const moving = await late.screenshot()
      await late.waitForFunction(() => window.__player.frames >= 18)
      assert.notDeepEqual(await late.screenshot(), moving, 'rain must keep animating after a simulated hour')
      await late.screenshot({ path: join(shots, `${id}-3600s.png`) })
      await late.close()
      console.log(`ok    ${id}: 85 s rain detail ${(currentDetail / oldDetail).toFixed(1)}× old ending, still animating at 1 hour without a 102 s replay`)
    }
    console.log(`ok    ${item.name}: ${info.project.buffers.length} buffers, sound=${info.sound}, ${(info.project.bufferBytes / 1048576).toFixed(1)} MB, ${Math.round(info.render.submissionMs)} ms submission`)
    await p.close()
  }
  assert.deepEqual(errors, [])
  console.log('multipass regressions ok')
} finally { await browser?.close(); await h.close() }
