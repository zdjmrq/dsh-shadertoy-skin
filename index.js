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
import { mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'shadertoy-skin'
export const inject = ['webServer']

const ROUTE = '/shader-skin'
const DIST = resolve(fileURLToPath(new URL('./native-dist/', import.meta.url)))
const MAX_STATE_BYTES = 2 * 1024 * 1024
let stateWrites = Promise.resolve()
const stateTag = body => `"${createHash('sha256').update(body).digest('hex')}"`
const DEFAULT_LIMITS = JSON.parse(readFileSync(new URL('./native-dist/defaults.json', import.meta.url), 'utf8')).limits

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
  version: 2,
  activeId: null,
  entries: [],
  overrides: {},
})

/**
 * Best-effort reader for ShaderToy's exported JSON (also accepts our own shape).
 * Returns undefined when the file is not a usable shader document.
 */
function parseShaderDocument(text) {
  let raw
  try {
    raw = JSON.parse(text)
  } catch {
    return undefined
  }
  const shader = raw?.Shader ?? raw?.shader ?? raw
  const passes = shader?.renderpass ?? shader?.passes
  let image = ''
  let sound = ''
  let common = ''
  if (Array.isArray(passes)) {
    if (passes.some(pass => /^(buffer|cubemap)$/i.test(pass?.type) || pass?.inputs?.length)) return undefined
    for (const pass of passes) {
      const type = String(pass?.type ?? 'image').toLowerCase()
      const source = typeof pass?.code === 'string' ? pass.code : ''
      if (source === '') continue
      if (type === 'common') common += `${source}\n`
      else if (type === 'sound') sound = source
      else if (type === 'image') image = source
    }
  }
  if (image === '' && typeof shader?.code?.image === 'string') image = shader.code.image
  if (image === '' && typeof shader?.image === 'string') image = shader.image
  if (image === '' && typeof raw?.image === 'string') image = raw.image
  if (sound === '' && typeof shader?.code?.sound === 'string') sound = shader.code.sound
  if (sound === '' && typeof shader?.sound === 'string') sound = shader.sound
  if (image === '') return undefined
  const name = String(shader?.info?.name ?? shader?.name ?? raw?.name ?? '').trim()
  return { image: common + image, sound: sound ? common + sound : undefined, name: name || undefined }
}

/** List the user-imported presets directory ($DSH_HOME/shader-skin/presets). */
async function listLocalPresets() {
  let names
  try {
    names = await readdir(localDir())
  } catch (error) {
    if (error && error.code === 'ENOENT') return []
    throw error
  }
  const out = []
  for (const name of names.sort()) {
    const isJson = /\.json$/i.test(name)
    const isSource = /\.(glsl|txt)$/i.test(name)
    if (!isJson && !isSource) continue
    const file = join(localDir(), name)
    try {
      if (!await realInside(localDir(), file)) continue
      const info = await stat(file)
      if (!info.isFile() || info.size > 1_500_000) continue
      const text = await readFile(file, 'utf8')
      if (isJson) {
        const parsed = parseShaderDocument(text)
        if (parsed === undefined) continue
        out.push({
          file: name,
          name: parsed.name ?? name.replace(/\.json$/i, ''),
          kind: 'shadertoy',
          hasSound: Boolean(parsed.sound),
          size: info.size,
        })
        continue
      }
      // a .glsl/.txt file only counts when it actually looks like a shader
      if (!/\b(?:mainImage|void\s+main)\s*\(/.test(text)) continue
      out.push({
        file: name,
        name: name.replace(/\.[^.]+$/, ''),
        kind: 'glsl',
        hasSound: /\bmainSound\s*\(/.test(text),
        size: info.size,
      })
    } catch {
      // unreadable / vanished: skip rather than fail the whole listing
    }
  }
  return out
}

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

async function realInside(root, target) {
  const [base, file] = await Promise.all([realpath(root), realpath(target)])
  const normalizeCase = value => process.platform === 'win32' ? value.toLowerCase() : value
  return normalizeCase(file).startsWith(`${normalizeCase(base)}${sep}`)
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
    if (!await realInside(root, target)) return fail(res, 403, 'symlink leaves the preset directory')
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
const GLOBAL_KEYS = new Set(['enabled', 'glass', 'panels', 'blur', 'scale', 'fps', 'volume', 'muted'])
const PARAM_KEYS = new Set([...GLOBAL_KEYS, 'brightness', 'speed', 'loop', 'loopMode', 'loopSeconds', 'audioMode', 'audioDurationMode', 'audioSeconds'])
const PANEL_LEVELS = new Set(['opaque', 'half', 'clear'])
const AUDIO_MODES = new Set(['loop', 'once'])

function sanitizeParams(raw) {
  const out = {}
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [key, value] of Object.entries(raw)) {
    if (!PARAM_KEYS.has(key)) continue
    if (key === 'enabled' || key === 'muted' || key === 'loop') {
      if (typeof value === 'boolean') out[key] = value
      continue
    }
    if (key === 'panels') {
      if (PANEL_LEVELS.has(value)) out[key] = value
      continue
    }
    if (key === 'audioMode') {
      if (AUDIO_MODES.has(value)) out[key] = value
      continue
    }
    if (key === 'loopMode' || key === 'audioDurationMode') {
      if (value === 'auto' || value === 'manual') out[key] = value
      continue
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      const limit = DEFAULT_LIMITS[key]
      if (limit?.values) { if (limit.values.includes(value)) out[key] = value }
      else out[key] = limit ? Math.min(limit.max, Math.max(limit.min, value)) : value
    }
  }
  return out
}

function sanitizeEntry(raw, index) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`entry #${index} must be an object`)
  if (typeof raw.id !== 'string' || raw.id.trim() === '') throw new Error(`entry #${index} needs a string id`)
  const code = raw.code !== null && typeof raw.code === 'object' && !Array.isArray(raw.code) ? raw.code : {}
  if (typeof code.image !== 'string' || code.image.trim() === '') throw new Error(`entry "${raw.id}" needs code.image`)
  const entry = {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name.slice(0, 120) : raw.id,
    source: ['paste', 'file', 'local', 'edit'].includes(raw.source) ? raw.source : 'paste',
    code: { image: code.image },
  }
  if (typeof code.sound === 'string' && code.sound.trim() !== '') entry.code.sound = code.sound
  if (typeof raw.license === 'string') entry.license = raw.license.slice(0, 80)
  if (typeof raw.origin === 'string') entry.origin = raw.origin.slice(0, 300)
  return entry
}

function sanitizeState(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('state must be an object')
  if (raw.entries !== undefined && !Array.isArray(raw.entries)) throw new Error('entries must be an array')
  const entries = (Array.isArray(raw.entries) ? raw.entries : []).map(sanitizeEntry)
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('duplicate entry ids')
  if (entries.length > 200) throw new Error('too many entries (max 200)')
  const codeBytes = entries.reduce((total, entry) => total + Buffer.byteLength(entry.code.image) + Buffer.byteLength(entry.code.sound ?? ''), 0)
  if (codeBytes > 1_500_000) throw new Error('shader code too large (max 1.5 MB in total)')

  const overrides = Object.create(null)
  if (raw.overrides !== null && typeof raw.overrides === 'object' && !Array.isArray(raw.overrides)) {
    for (const [id, value] of Object.entries(raw.overrides)) {
      const params = sanitizeParams(value)
      if (Object.keys(params).length > 0) overrides[id] = params
    }
  }
  const activeId = typeof raw.activeId === 'string' && raw.activeId !== '' ? raw.activeId : null

  // v1 kept one global `params` object; fold it into the active preset's override.
  if (raw.version !== 2 && activeId !== null) {
    const legacy = sanitizeParams(raw.params)
    if (Object.keys(legacy).length > 0) overrides[activeId] = { ...legacy, ...(overrides[activeId] ?? {}) }
  }

  // Migrate appearance from the active artwork once. Explicit saved choices,
  // including opaque, survive upgrades; changing artwork no longer changes them.
  const settings = Object.fromEntries(Object.entries(sanitizeParams(raw.settings ?? overrides[activeId])).filter(([key]) => GLOBAL_KEYS.has(key)))
  return { version: 2, activeId, settings, overrides, entries, updatedAt: Date.now() }
}

async function handleState(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    let body
    try {
      body = await readFile(statePath(), 'utf8')
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        const empty = JSON.stringify(EMPTY_STATE)
        finish(res, 200, { 'content-type': 'application/json; charset=utf-8', etag: stateTag(empty) }, req.method === 'HEAD' ? undefined : empty)
        return
      }
      fail(res, 500, 'state read failed')
      return
    }
    try {
      const parsed = JSON.parse(body)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('bad shape')
      sanitizeState(parsed)
    } catch { return fail(res, 500, 'state is corrupted; original file preserved') }
    finish(res, 200, { 'content-type': 'application/json; charset=utf-8', etag: stateTag(body) }, req.method === 'HEAD' ? undefined : body)
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
  const temp = `${target}.${randomUUID()}.tmp`
  const body = `${JSON.stringify(state, null, 2)}\n`
  // A shared .tmp file lets concurrent PUTs rename or overwrite each other's
  // data. Queue complete atomic replacements, and recover the queue on errors.
  const write = stateWrites.then(async () => {
    try {
      if (req.headers['if-match']) {
        const current = await readFile(target, 'utf8').catch(error => {
          if (error.code === 'ENOENT') return JSON.stringify(EMPTY_STATE)
          throw error
        })
        if (req.headers['if-match'] !== stateTag(current)) throw Object.assign(new Error('state conflict'), { code: 'E_CONFLICT' })
      }
      await mkdir(join(dirname(target), 'shader-skin'), { recursive: true })
      await writeFile(temp, body, 'utf8')
      await rename(temp, target)
    } finally {
      await rm(temp, { force: true }).catch(() => {})
    }
  })
  stateWrites = write.catch(() => {})
  try {
    await write
  } catch (error) {
    if (error.code === 'E_CONFLICT') return fail(res, 409, 'state changed in another window; reload before saving')
    fail(res, 500, 'state write failed')
    return
  }
  finish(res, 200, { 'content-type': 'application/json; charset=utf-8', etag: stateTag(body) }, JSON.stringify({ ok: true }))
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
  // Escape hatch for iterating on UI that lives inside #root: create
  // $DSH_HOME/shader-skin.safe and the client half skips the sidebar entry.
  if (suffix === '/safe-mode') {
    const on = existsSync(join(dshHome(), 'shader-skin.safe'))
    finish(res, 200, { 'content-type': 'application/json; charset=utf-8' }, JSON.stringify({ on }))
    return
  }
  if (suffix === '/local/index.json') {
    try {
      const presets = await listLocalPresets()
      finish(res, 200, { 'content-type': 'application/json; charset=utf-8' }, JSON.stringify(presets))
    } catch {
      fail(res, 500, 'local preset listing failed')
    }
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
