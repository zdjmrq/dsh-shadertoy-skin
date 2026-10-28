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
  await page.evaluate(() => document.querySelector('#shadertoy-skin-bg').contentWindow.postMessage({ type: 'init', preset: { name: 'packed-state', code: {
    image: 'void mainImage(out vec4 c,in vec2 p){vec4 v=texelFetch(iChannel0,ivec2(0),0);bool ok=v.x==-2.&&v.y==4.&&v.w==-12345678.;c=ok?vec4(0,1,0,1):vec4(1,0,0,1);}',
    buffers: { A: 'void mainImage(out vec4 c,in vec2 p){c=vec4(-2,4,16,-12345678.);}' }, channels: { image: ['buffer:A'] },
  } }, params: { dim: 1, tintMix: 0 } }, location.origin))
  await player.waitForFunction(() => window.__player?.preset === 'packed-state' && window.__player.ready)
  const packedPixel = await player.evaluate(() => window.__player.inspect('pixel'))
  assert.ok(packedPixel[0] < 5 && packedPixel[1] > 250, `float state must retain signed/HDR/24-bit values: ${packedPixel}`)
  assert.deepEqual(errors, [])
  console.log('ok    grouped file import, Common/Buffer tabs, channel wiring, file creation and saving reach the real player and disk')
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
    console.log(`ok    ${item.name}: ${info.project.buffers.length} buffers, sound=${info.sound}, ${(info.project.bufferBytes / 1048576).toFixed(1)} MB, ${Math.round(info.render.submissionMs)} ms submission`)
    await p.close()
  }
  assert.deepEqual(errors, [])
  console.log('multipass regressions ok')
} finally { await browser?.close(); await h.close() }
