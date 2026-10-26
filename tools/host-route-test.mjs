#!/usr/bin/env node
/**
 * Host-half route tests — dependency-free, runs in CI.
 *
 * Boots `index.js`'s webServer handler on a throwaway http server with a temporary
 * `$DSH_HOME`, then asserts the routes the browser half depends on:
 * static renderer, preset files, state GET/PUT (with validation), the user-imported
 * `local/` mount, traversal rejection and method handling.
 *
 * Usage: node tools/host-route-test.mjs
 */
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
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

try {
  // --- health
  const health = await get('/shader-skin/health')
  check('health returns 200', health.status === 200)
  const healthBody = await health.json()
  check('health reports name and version', healthBody.ok === true && healthBody.name === 'shadertoy-skin' && /\d+\.\d+\.\d+/.test(healthBody.version))

  // --- renderer + settings surface
  const player = await get('/shader-skin/player.html')
  check('player.html is served', player.status === 200 && String(player.headers.get('content-type')).includes('text/html'))
  const playerText = await player.text()
  check('player.html has the runtime', playerText.includes('ShaderSkin player'))
  check('player.html is not cached', /no-store/.test(String(player.headers.get('cache-control'))))
  const root = await get('/shader-skin/')
  check('route root serves the player', root.status === 200 && (await root.text()).includes('ShaderSkin player'))
  const panel = await get('/shader-skin/panel.html')
  check('panel.html is served', panel.status === 200 && (await panel.text()).includes('Shader 背景'))
  const defaults = await json('/shader-skin/defaults.json')
  check('defaults.json exposes fps + scale defaults', defaults.params?.fps === 30 && defaults.params?.scale === 1)
  check('defaults.json exposes selectable fps/scale values', Array.isArray(defaults.limits?.fps?.values) && Array.isArray(defaults.limits?.scale?.values))

  // --- presets
  const manifest = await json('/shader-skin/presets/index.json')
  check('preset manifest is served', Array.isArray(manifest) && manifest.length >= 2)
  const preset = await get('/shader-skin/presets/aurora.glsl')
  const presetText = await preset.text()
  check('preset source is served', preset.status === 200 && presetText.includes('mainImage'))
  check('preset source is not cached', /no-store/.test(String(preset.headers.get('cache-control'))))

  // --- state: default, then round-trip
  const empty = await json('/shader-skin/state')
  check('state defaults to an empty document', empty.version === 1 && empty.activeId === null && Array.isArray(empty.entries))
  const next = { version: 1, activeId: 'flow', entries: [{ id: 'mytoy', name: '我的背景', license: 'MIT' }], params: { glass: 0.62 } }
  const put = await fetch(`${origin}/shader-skin/state`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(next),
  })
  check('state PUT returns 200', put.status === 200)
  const stored = await json('/shader-skin/state')
  check('state round-trips activeId', stored.activeId === 'flow')
  check('state round-trips entries', stored.entries?.[0]?.id === 'mytoy')
  check('state round-trips params', stored.params?.glass === 0.62)
  check('state stamps updatedAt', typeof stored.updatedAt === 'number')
  const onDisk = JSON.parse(await readFile(join(home, 'shader-skin.json'), 'utf8'))
  check('state is written to $DSH_HOME/shader-skin.json', onDisk.activeId === 'flow')
  check('state file is not left behind as .tmp', !(await readFile(join(home, 'shader-skin.json.tmp'), 'utf8').then(() => true).catch(() => false)))

  // --- state validation
  const badJson = await fetch(`${origin}/shader-skin/state`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{oops' })
  check('malformed state is rejected', badJson.status === 400)
  const badShape = await fetch(`${origin}/shader-skin/state`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entries: [{}] }) })
  check('entries without an id are rejected', badShape.status === 400)
  const badType = await fetch(`${origin}/shader-skin/state`, { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: 'x' })
  check('non-JSON content type is rejected', badType.status === 415)
  const tooBig = await fetch(`${origin}/shader-skin/state`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pad: 'x'.repeat(2 * 1024 * 1024 + 10) }),
  })
  check('oversized state is rejected', tooBig.status === 413)

  // --- user-imported presets
  const localMissing = await get('/shader-skin/local/nope.json')
  check('missing local preset is a 404', localMissing.status === 404)

  // --- traversal / methods
  const traversal = await get('/shader-skin/%2e%2e%2fpackage.json')
  check('path traversal is rejected', traversal.status === 403 || traversal.status === 404, String(traversal.status))
  const post = await fetch(`${origin}/shader-skin/player.html`, { method: 'POST' })
  check('POST on a static file is a 405', post.status === 405)
  const putStatic = await fetch(`${origin}/shader-skin/state`, { method: 'DELETE' })
  check('DELETE on state is a 405', putStatic.status === 405)
} finally {
  await new Promise(resolve => server.close(resolve))
  await rm(home, { recursive: true, force: true })
}

if (failures.length > 0) {
  console.log(`\nhost route tests failed: ${failures.length}`)
  process.exit(1)
}
console.log('\nhost route tests ok')
