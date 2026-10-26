#!/usr/bin/env node
/**
 * Host-half route tests — dependency-free, runs in CI.
 *
 * Boots `index.js`'s webServer handler on a throwaway http server with a temporary
 * `$DSH_HOME`, then asserts the routes the settings surfaces depend on: static
 * renderer + settings page, built-in presets, local preset listing, state v2
 * (with v1 migration) and its validation, traversal rejection and methods.
 *
 * Usage: node tools/host-route-test.mjs
 */
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handler } from '../index.js'

const failures = []
function check(label, condition, detail = '') {
  if (condition) console.log(`ok    ${label}`)
  else {
    failures.push(label)
    console.log(`FAIL  ${label}${detail ? `  (${detail})` : ''}`)
  }
}

const home = await mkdtemp(join(tmpdir(), 'shadertoy-skin-home-'))
process.env.DSH_HOME = home
await mkdir(join(home, 'shader-skin', 'presets'), { recursive: true })

// fixtures for the local preset directory
const seascape = 'void mainImage(out vec4 c, in vec2 p) { c = vec4(p / iResolution.xy, 0.2, 1.0); }'
await writeFile(join(home, 'shader-skin', 'presets', 'my-shader.glsl'), seascape, 'utf8')
await writeFile(join(home, 'shader-skin', 'presets', 'exported.json'), JSON.stringify({
  Shader: {
    info: { name: 'Exported Toy' },
    renderpass: [
      { type: 'image', code: seascape },
      { type: 'sound', code: 'vec2 mainSound(float t) { return vec2(sin(t * 6.2831 * 440.0)) * 0.2; }' },
    ],
  },
}), 'utf8')
await writeFile(join(home, 'shader-skin', 'presets', 'broken.json'), '{"nope":true}', 'utf8')
await writeFile(join(home, 'shader-skin', 'presets', 'notes.txt'), 'not a shader', 'utf8')

const server = createServer((req, res) => {
  handler(req, res).catch(error => {
    res.writeHead(500)
    res.end(String(error))
  })
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`

const get = path => fetch(`${origin}${path}`, { cache: 'no-store' })
const json = async path => (await get(path)).json()
const putState = body => fetch(`${origin}/shader-skin/state`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

try {
  // --- health
  const health = await get('/shader-skin/health')
  check('health returns 200', health.status === 200)
  const healthBody = await health.json()
  check('health reports name and version', healthBody.ok === true && healthBody.name === 'shadertoy-skin' && /\d+\.\d+\.\d+/.test(healthBody.version))

  // --- safe-mode escape hatch (skips the sidebar entry when the flag file exists)
  check('safe mode defaults to off', (await json('/shader-skin/safe-mode')).on === false)
  await writeFile(join(home, 'shader-skin.safe'), '', 'utf8')
  check('safe mode honours the flag file', (await json('/shader-skin/safe-mode')).on === true)
  await rm(join(home, 'shader-skin.safe'))

  // --- renderer + settings page
  const player = await get('/shader-skin/player.html')
  check('player.html is served', player.status === 200 && String(player.headers.get('content-type')).includes('text/html'))
  check('player.html has the runtime', (await player.text()).includes('ShaderSkin player'))
  check('player.html is not cached', /no-store/.test(String(player.headers.get('cache-control'))))
  const root = await get('/shader-skin/')
  check('route root serves the player', root.status === 200 && (await root.text()).includes('ShaderSkin player'))
  const panel = await get('/shader-skin/panel.html')
  check('panel.html is served', panel.status === 200 && (await panel.text()).includes('Shader 背景'))
  const defaults = await json('/shader-skin/defaults.json')
  check('defaults.json exposes fps + scale defaults', defaults.params?.fps === 30 && defaults.params?.scale === 1)
  check('defaults.json exposes the glass and brightness look', defaults.params?.glass === 60 && defaults.params?.brightness === 100)
  check('defaults.json exposes the card transparency level', defaults.params?.panels === 'opaque')
  check('defaults.json exposes selectable fps/scale values', Array.isArray(defaults.limits?.fps?.values) && Array.isArray(defaults.limits?.scale?.values))

  // --- built-in presets
  const manifest = await json('/shader-skin/presets/index.json')
  check('preset manifest is served', Array.isArray(manifest) && manifest.length >= 2)
  check('manifest entries declare hasSound', manifest.every(item => typeof item.hasSound === 'boolean'))
  const preset = await get('/shader-skin/presets/aurora.glsl')
  check('preset source is served', preset.status === 200 && (await preset.text()).includes('mainImage'))
  check('preset source is not cached', /no-store/.test(String(preset.headers.get('cache-control'))))

  // --- local preset directory listing
  const local = await json('/shader-skin/local/index.json')
  check('local listing is an array', Array.isArray(local), JSON.stringify(local).slice(0, 200))
  check('local listing includes a glsl file', local.some(item => item.file === 'my-shader.glsl' && item.kind === 'glsl' && item.hasSound === false))
  const exported = local.find(item => item.file === 'exported.json')
  check('local listing parses a ShaderToy export', exported?.kind === 'shadertoy' && exported?.name === 'Exported Toy' && exported?.hasSound === true)
  check('local listing skips unusable json', !local.some(item => item.file === 'broken.json'))
  check('local listing skips unrelated files', !local.some(item => item.file === 'notes.txt'))
  const localFile = await get('/shader-skin/local/my-shader.glsl')
  check('local preset file is served', localFile.status === 200 && (await localFile.text()).includes('mainImage'))

  // --- state v2: default, round-trip, migration
  const empty = await json('/shader-skin/state')
  check('state defaults to v2 empty document', empty.version === 2 && empty.activeId === null && Array.isArray(empty.entries) && typeof empty.overrides === 'object')

  const entryCode = 'void mainImage(out vec4 c, in vec2 p) { c = vec4(0.1, 0.2, 0.3, 1.0); }'
  const next = {
    version: 2,
    activeId: 'user-1',
    entries: [{ id: 'user-1', name: '我的背景', source: 'paste', code: { image: entryCode } }],
    overrides: { 'user-1': { glass: 62, fps: 60, brightness: 135, panels: 'half' }, flow: { blur: 2 } },
  }
  const put = await putState(next)
  check('state PUT returns 200', put.status === 200)
  const stored = await json('/shader-skin/state')
  check('state round-trips activeId', stored.activeId === 'user-1')
  check('state round-trips entries', stored.entries?.[0]?.id === 'user-1' && stored.entries?.[0]?.code?.image === entryCode)
  check('state round-trips overrides', stored.overrides?.['user-1']?.glass === 62 && stored.overrides?.flow?.blur === 2)
  check('state persists brightness and card transparency', stored.overrides?.['user-1']?.brightness === 135 && stored.overrides?.['user-1']?.panels === 'half', JSON.stringify(stored.overrides?.['user-1']))
  check('state stamps updatedAt', typeof stored.updatedAt === 'number')
  check('state drops unknown override keys', stored.overrides?.['user-1']?.nonsense === undefined)
  const onDisk = JSON.parse(await readFile(join(home, 'shader-skin.json'), 'utf8'))
  check('state is written to $DSH_HOME/shader-skin.json', onDisk.version === 2 && onDisk.activeId === 'user-1')
  check('state file is not left behind as .tmp', !(await readFile(join(home, 'shader-skin.json.tmp'), 'utf8').then(() => true).catch(() => false)))
  const bogusLevel = await putState({ version: 2, entries: [], overrides: { x: { panels: 'nope', brightness: 'bright' } } })
  check('unknown card transparency / non-numeric brightness are dropped', bogusLevel.status === 200 && (await json('/shader-skin/state')).overrides?.x === undefined)

  const legacy = await putState({ version: 1, activeId: 'aurora', params: { glass: 50 }, entries: [] })
  check('legacy v1 state is accepted', legacy.status === 200)
  const migrated = await json('/shader-skin/state')
  check('v1 params migrate into an override', migrated.version === 2 && migrated.overrides?.aurora?.glass === 50)

  // --- state validation
  const badJson = await fetch(`${origin}/shader-skin/state`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{oops' })
  check('malformed state is rejected', badJson.status === 400)
  const noImage = await putState({ version: 2, entries: [{ id: 'x', code: {} }] })
  check('entries without code.image are rejected', noImage.status === 400)
  const badType = await fetch(`${origin}/shader-skin/state`, { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: 'x' })
  check('non-JSON content type is rejected', badType.status === 415)
  const hugeCode = await putState({ version: 2, entries: [{ id: 'big', code: { image: 'x'.repeat(1_600_000) } }] })
  check('oversized shader code is rejected', hugeCode.status === 400, String(hugeCode.status))
  const tooBig = await putState({ pad: 'x'.repeat(2 * 1024 * 1024 + 10) })
  check('oversized body is rejected', tooBig.status === 413)

  // --- traversal / methods
  const traversal = await get('/shader-skin/%2e%2e%2fpackage.json')
  check('path traversal is rejected', traversal.status === 403 || traversal.status === 404, String(traversal.status))
  const post = await fetch(`${origin}/shader-skin/player.html`, { method: 'POST' })
  check('POST on a static file is a 405', post.status === 405)
  const del = await fetch(`${origin}/shader-skin/state`, { method: 'DELETE' })
  check('DELETE on state is a 405', del.status === 405)
} finally {
  await new Promise(resolve => server.close(resolve))
  await rm(home, { recursive: true, force: true })
}

if (failures.length > 0) {
  console.log(`\nhost route tests failed: ${failures.length}`)
  process.exit(1)
}
console.log('\nhost route tests ok')
