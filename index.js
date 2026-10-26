/**
 * dsh-shadertoy-skin — Host half.
 *
 * Responsibilities (deliberately small and stable):
 *   1. serve the renderer under `/shader-skin/*` from `native-dist/` (read from disk
 *      on every request with `no-cache`, so editing the player needs no restart);
 *   2. serve user-imported presets under `/shader-skin/local/*` from
 *      `$DSH_HOME/shader-skin/presets/` (outside the package, survives updates);
 *   3. persist the skin state (`$DSH_HOME/shader-skin.json`) over
 *      `GET|PUT /shader-skin/state`, atomically.
 *
 * The browser half (client.js) is the only consumer; it talks to these routes over
 * the page origin, which the desktop shell forwards to this server.
 *
 * @module dsh-shadertoy-skin
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'shadertoy-skin'
export const inject = ['webServer']

const ROUTE = '/shader-skin'
const DIST = resolve(fileURLToPath(new URL('./native-dist/', import.meta.url)))
const MAX_STATE_BYTES = 2 * 1024 * 1024

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glsl': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2',
})

const EMPTY_STATE = Object.freeze({
  version: 1,
  activeId: null,
  entries: [],
  params: {},
})

function dshHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv
  return join(homedir(), '.dsh')
}

function packageVersion() {
  try {
    return JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

const VERSION = packageVersion()
/** $DSH_HOME/shader-skin.json */
const statePath = () => join(dshHome(), 'shader-skin.json')
/** $DSH_HOME/shader-skin/presets — user imports live here, never in the package. */
const localDir = () => join(dshHome(), 'shader-skin', 'presets')

function finish(res, status, headers = {}, body) {
  res.writeHead(status, {
    'cache-control': 'no-cache, no-store, must-revalidate',
    'x-content-type-options': 'nosniff',
    ...headers,
  })
  res.end(body)
}

function fail(res, status, message) {
  finish(res, status, { 'content-type': 'text/plain; charset=utf-8' }, message)
}

/** Resolve `requestPath` inside `root`, rejecting anything that escapes it. */
function resolveInside(root, requestPath) {
  const target = resolve(join(root, normalize(requestPath)))
  if (target === root) return undefined
  if (!target.startsWith(`${root}${sep}`)) return undefined
  return target
}

async function serveFile(root, requestPath, req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    finish(res, 405, { allow: 'GET, HEAD' })
    return
  }
  const target = resolveInside(root, requestPath)
  if (target === undefined) {
    fail(res, 403, 'forbidden')
    return
  }
  let body
  try {
    body = await readFile(target)
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'EISDIR' || error.code === 'ENOTDIR')) {
      fail(res, 404, `404 ${requestPath}`)
      return
    }
    fail(res, 500, 'read failed')
    return
  }
  finish(res, 200, {
    'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
    'content-length': String(body.byteLength),
  }, req.method === 'HEAD' ? undefined : body)
}

async function readJsonBody(req, limit = MAX_STATE_BYTES) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > limit) throw Object.assign(new Error('payload too large'), { code: 'E_TOO_LARGE' })
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') throw Object.assign(new Error('empty body'), { code: 'E_EMPTY' })
  return JSON.parse(text)
}

/** Accept only the shape the client half writes; unknown keys are dropped. */
function sanitizeState(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('state must be an object')
  const entries = Array.isArray(raw.entries) ? raw.entries : []
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object' || typeof entry.id !== 'string') throw new Error('each entry needs a string id')
  }
  return {
    version: 1,
    activeId: typeof raw.activeId === 'string' ? raw.activeId : null,
    entries,
    params: raw.params !== null && typeof raw.params === 'object' && !Array.isArray(raw.params) ? raw.params : {},
    updatedAt: Date.now(),
  }
}

async function handleState(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    let body
    try {
      body = await readFile(statePath(), 'utf8')
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        finish(res, 200, { 'content-type': 'application/json; charset=utf-8' }, JSON.stringify(EMPTY_STATE))
        return
      }
      fail(res, 500, 'state read failed')
      return
    }
    finish(res, 200, { 'content-type': 'application/json; charset=utf-8' }, req.method === 'HEAD' ? undefined : body)
    return
  }
  if (req.method !== 'PUT') {
    finish(res, 405, { allow: 'GET, HEAD, PUT' })
    return
  }
  const contentType = String(req.headers['content-type'] ?? '')
  if (!contentType.toLowerCase().includes('application/json')) {
    fail(res, 415, 'state PUT requires application/json')
    return
  }
  let state
  try {
    state = sanitizeState(await readJsonBody(req))
  } catch (error) {
    if (error && error.code === 'E_TOO_LARGE') return fail(res, 413, 'state payload too large')
    return fail(res, 400, `invalid state: ${error instanceof Error ? error.message : String(error)}`)
  }
  const target = statePath()
  const temp = `${target}.tmp`
  try {
    await mkdir(join(dshHome(), 'shader-skin'), { recursive: true })
    await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    await rename(temp, target)
  } catch {
    fail(res, 500, 'state write failed')
    return
  }
  finish(res, 200, { 'content-type': 'application/json; charset=utf-8' }, JSON.stringify({ ok: true }))
}

export async function handler(req, res) {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://dsh.local').pathname)
  } catch {
    fail(res, 400, 'bad request')
    return
  }
  if (pathname === ROUTE) pathname = `${ROUTE}/`
  const suffix = pathname.slice(ROUTE.length)

  if (suffix === '/state') return handleState(req, res)
  if (suffix === '/health') {
    finish(res, 200, { 'content-type': 'application/json; charset=utf-8' }, JSON.stringify({ ok: true, name, version: VERSION }))
    return
  }
  if (suffix.startsWith('/local/')) {
    return serveFile(localDir(), suffix.slice('/local/'.length), req, res)
  }
  const relative = suffix === '/' || suffix === '' ? 'player.html' : suffix.slice(1)
  return serveFile(DIST, relative, req, res)
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE,
    handler,
  }), 'shadertoy-skin: renderer, presets and state routes')
}
