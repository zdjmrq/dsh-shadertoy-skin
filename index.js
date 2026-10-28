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
import { normalizeCode, codeBytes, parseDocument as parseShaderDocument } from './native-dist/project.js'

/** @typedef {import('node:http').IncomingMessage} Request */
/** @typedef {import('node:http').ServerResponse} Response */
/** @typedef {ReturnType<typeof normalizeCode>} ShaderCode */
/** @typedef {'paste' | 'file' | 'local' | 'edit'} EntrySource */
/** @typedef {{ id: string, name: string, source: EntrySource, code: ShaderCode, license?: string, origin?: string, author?: string, sourceUrl?: string, licenseUrl?: string }} Entry */
/** @typedef {Record<string, number | boolean | string>} Params */
/** @typedef {{ version: 2, activeId: string | null, settings: Params, overrides: Record<string, Params>, entries: Entry[], updatedAt?: number }} SkinState */
/** @typedef {{ file: string, name: string, kind: 'shadertoy' | 'glsl', hasSound: boolean, size: number }} LocalPreset */
/** @typedef {{ min?: number, max?: number, values?: readonly unknown[] }} ParamLimit */
/** @typedef {Record<string, ParamLimit>} Limits */
/** @typedef {{ limits: Limits }} Defaults */
/** @typedef {{ effect(fn: () => void | (() => void), label: string): void, webServer: { register(options: { kind: 'prefix', path: string, handler: Handler }): () => void } }} CordisContext */
/** @typedef {(req: Request, res: Response) => Promise<void>} Handler */

export const name = 'shadertoy-skin'
export const inject = ['webServer']

const ROUTE = '/shader-skin'
const DIST = resolve(fileURLToPath(new URL('./native-dist/', import.meta.url)))
const MAX_STATE_BYTES = 2 * 1024 * 1024
/** @type {Promise<unknown>} */
let stateWrites = Promise.resolve()
// A Desktop protocol proxy can lose the response after the atomic write.
// Replaying the same save must not turn a successful write into an ETag conflict.
/** @type {Map<string, { payloadTag: string, etag: string }>} */
const stateReceipts = new Map()
/** @param {string} body @returns {string} */
const stateTag = body => `"${createHash('sha256').update(body).digest('hex')}"`
const DEFAULT_LIMITS = /** @type {Limits} */ (JSON.parse(readFileSync(new URL('./native-dist/defaults.json', import.meta.url), 'utf8')).limits)

/** @param {unknown} error @returns {string | undefined} */
const errorCode = error => error !== null && typeof error === 'object' && 'code' in error
  ? String(/** @type {{ code: unknown }} */ (error).code)
  : undefined

/** @type {Readonly<Record<string, string>>} */
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
 * List the user-imported presets directory ($DSH_HOME/shader-skin/presets).
 * @returns {Promise<LocalPreset[]>}
 */
async function listLocalPresets() {
  let names
  try {
    names = await readdir(localDir())
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return []
    throw error
  }
  /** @type {LocalPreset[]} */
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

/** @returns {string} */
function dshHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv
  return join(homedir(), '.dsh')
}

/** @returns {string} */
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

/**
 * @param {Response} res
 * @param {number} status
 * @param {Record<string, string>} [headers]
 * @param {string | Uint8Array} [body]
 */
function finish(res, status, headers = {}, body) {
  res.writeHead(status, {
    'cache-control': 'no-cache, no-store, must-revalidate',
    'x-content-type-options': 'nosniff',
    ...headers,
  })
  res.end(body)
}

/** @param {Response} res @param {number} status @param {string} message */
function fail(res, status, message) {
  finish(res, status, { 'content-type': 'text/plain; charset=utf-8' }, message)
}

/**
 * Resolve `requestPath` inside `root`, rejecting anything that escapes it.
 * @param {string} root
 * @param {string} requestPath
 * @returns {string | undefined}
 */
function resolveInside(root, requestPath) {
  const target = resolve(join(root, normalize(requestPath)))
  if (target === root) return undefined
  if (!target.startsWith(`${root}${sep}`)) return undefined
  return target
}

/**
 * @param {string} root
 * @param {string} target
 * @returns {Promise<boolean>}
 */
async function realInside(root, target) {
  const [base, file] = await Promise.all([realpath(root), realpath(target)])
  /** @param {string} value @returns {string} */
  const normalizeCase = value => process.platform === 'win32' ? value.toLowerCase() : value
  return normalizeCase(file).startsWith(`${normalizeCase(base)}${sep}`)
}

/**
 * @param {string} root
 * @param {string} requestPath
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 */
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
  /** @type {Buffer} */
  let body
  try {
    if (!await realInside(root, target)) return fail(res, 403, 'symlink leaves the preset directory')
    body = await readFile(target)
  } catch (error) {
    const code = errorCode(error)
    if (code === 'ENOENT' || code === 'EISDIR' || code === 'ENOTDIR') {
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

/**
 * @param {Request} req
 * @param {number} [limit]
 * @returns {Promise<unknown>}
 */
async function readJsonBody(req, limit = MAX_STATE_BYTES) {
  /** @type {Buffer[]} */
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

const GLOBAL_KEYS = new Set(['enabled', 'glass', 'panels', 'blur', 'scale', 'fps', 'volume', 'muted'])
// Retain earlier saved choices without continuing to offer arbitrary tiers.
const LEGACY_SCALES = new Set([0.35, 0.4, 0.6, 1.75])
const PARAM_KEYS = new Set([...GLOBAL_KEYS, 'brightness', 'speed', 'loop', 'loopMode', 'loopSeconds', 'audioMode', 'audioDurationMode', 'audioSeconds'])
const PANEL_LEVELS = new Set(['opaque', 'half', 'clear'])
const AUDIO_MODES = new Set(['loop', 'once'])

/** @param {unknown} raw @returns {Record<string, unknown> | undefined} */
const asObject = raw => raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? /** @type {Record<string, unknown>} */ (raw) : undefined

/**
 * Accept only the shape the client half writes; unknown keys are dropped.
 * @param {unknown} raw
 * @returns {Params}
 */
function sanitizeParams(raw) {
  /** @type {Params} */
  const out = {}
  const input = asObject(raw)
  if (input === undefined) return out
  for (const [key, value] of Object.entries(input)) {
    if (!PARAM_KEYS.has(key)) continue
    if (key === 'enabled' || key === 'muted' || key === 'loop') {
      if (typeof value === 'boolean') out[key] = value
      continue
    }
    if (key === 'panels') {
      if (typeof value === 'string' && PANEL_LEVELS.has(value)) out[key] = value
      continue
    }
    if (key === 'audioMode') {
      if (typeof value === 'string' && AUDIO_MODES.has(value)) out[key] = value
      continue
    }
    if (key === 'loopMode' || key === 'audioDurationMode') {
      if (value === 'auto' || value === 'manual') out[key] = value
      continue
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (key === 'scale' && LEGACY_SCALES.has(value)) { out[key] = value; continue }
      const limit = DEFAULT_LIMITS[key]
      if (limit?.values) { if (limit.values.includes(value)) out[key] = value }
      else out[key] = limit ? Math.min(/** @type {number} */ (limit.max), Math.max(/** @type {number} */ (limit.min), value)) : value
    }
  }
  return out
}

/**
 * @param {unknown} raw
 * @param {number} index
 * @returns {Entry}
 */
function sanitizeEntry(raw, index) {
  const input = asObject(raw)
  if (input === undefined) throw new Error(`entry #${index} must be an object`)
  if (typeof input.id !== 'string') throw new Error(`entry #${index} needs a string id`)
  // Ids are small opaque keys, never paths or markup: bound them like names so a
  // hand-written state file cannot store unbounded strings.
  const id = input.id.trim().slice(0, 200)
  if (id === '') throw new Error(`entry #${index} needs a string id`)
  const code = asObject(input.code) ?? {}
  if (typeof code.image !== 'string' || code.image.trim() === '') throw new Error(`entry "${id}" needs code.image`)
  /** @type {Entry} */
  const entry = {
    id,
    name: typeof input.name === 'string' && input.name.trim() !== '' ? input.name.slice(0, 120) : id,
    source: input.source === 'file' || input.source === 'local' || input.source === 'edit' ? input.source : 'paste',
    code: normalizeCode(code),
  }
  if (typeof code.sound === 'string' && code.sound.trim() !== '') entry.code.sound = code.sound
  if (typeof input.license === 'string') entry.license = input.license.slice(0, 80)
  if (typeof input.origin === 'string') entry.origin = input.origin.slice(0, 300)
  for (const key of /** @type {const} */ (['author', 'sourceUrl', 'licenseUrl'])) {
    const value = input[key]
    if (typeof value === 'string') entry[key] = value.slice(0, 300)
  }
  return entry
}

/**
 * @param {unknown} raw
 * @returns {SkinState}
 */
function sanitizeState(raw) {
  const input = asObject(raw)
  if (input === undefined) throw new Error('state must be an object')
  if (input.entries !== undefined && !Array.isArray(input.entries)) throw new Error('entries must be an array')
  for (const key of ['settings', 'overrides', 'params']) {
    if (input[key] !== undefined && asObject(input[key]) === undefined) throw new Error(`${key} must be an object`)
  }
  const entries = (Array.isArray(input.entries) ? input.entries : []).map(sanitizeEntry)
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('duplicate entry ids')
  const entryIds = new Map((/** @type {Entry[]} */ (input.entries ?? [])).map((entry, index) => [entry.id, entries[index].id]))
  if (entries.length > 200) throw new Error('too many entries (max 200)')
  const totalCodeBytes = entries.reduce((total, entry) => total + codeBytes(entry.code), 0)
  if (totalCodeBytes > 1_500_000) throw new Error('shader code too large (max 1.5 MB in total)')

  /** @type {Record<string, Params>} */
  const overrides = Object.create(null)
  const rawOverrides = asObject(input.overrides)
  if (rawOverrides !== undefined) {
    for (const [id, value] of Object.entries(rawOverrides)) {
      const params = sanitizeParams(value)
      const key = entryIds.get(id) ?? id
      if (Object.hasOwn(overrides, key)) throw new Error('duplicate override ids after normalization')
      if (Object.keys(params).length > 0) overrides[key] = params
    }
  }
  const activeId = typeof input.activeId === 'string' && input.activeId !== '' ? entryIds.get(input.activeId) ?? input.activeId : null

  // v1 kept one global `params` object; fold it into the active preset's override.
  if (input.version !== 2 && activeId !== null) {
    const legacy = sanitizeParams(input.params)
    if (Object.keys(legacy).length > 0) overrides[activeId] = { ...legacy, ...(overrides[activeId] ?? {}) }
  }

  // Migrate appearance from the active artwork once. Explicit saved choices,
  // including opaque, survive upgrades; changing artwork no longer changes them.
  const settings = Object.fromEntries(Object.entries(sanitizeParams({ ...overrides[/** @type {string} */ (activeId)], ...asObject(input.settings) })).filter(([key]) => GLOBAL_KEYS.has(key)))
  return { version: 2, activeId, settings, overrides, entries, updatedAt: Date.now() }
}

/**
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 */
async function handleState(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    /** @type {string} */
    let body
    try {
      body = await readFile(statePath(), 'utf8')
    } catch (error) {
      if (errorCode(error) === 'ENOENT') {
        const empty = JSON.stringify(EMPTY_STATE)
        finish(res, 200, { 'content-type': 'application/json; charset=utf-8', etag: stateTag(empty) }, req.method === 'HEAD' ? undefined : empty)
        return
      }
      fail(res, 500, 'state read failed')
      return
    }
    try {
      const parsed = JSON.parse(body)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('bad shape')
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
  /** @type {SkinState} */
  let state
  try {
    state = sanitizeState(await readJsonBody(req))
  } catch (error) {
    if (errorCode(error) === 'E_TOO_LARGE') return fail(res, 413, 'state payload too large')
    return fail(res, 400, `invalid state: ${error instanceof Error ? error.message : String(error)}`)
  }
  const target = statePath()
  const saveId = String(req.headers['x-shader-save-id'] ?? '').slice(0, 128)
  const payloadTag = stateTag(JSON.stringify({ ...state, updatedAt: 0 }))
  const temp = `${target}.${randomUUID()}.tmp`
  const body = `${JSON.stringify(state, null, 2)}\n`
  // A shared .tmp file lets concurrent PUTs rename or overwrite each other's
  // data. Queue complete atomic replacements, and recover the queue on errors.
  const write = stateWrites.then(async () => {
    try {
      const receipt = saveId ? stateReceipts.get(saveId) : undefined
      if (receipt) {
        const current = await readFile(target, 'utf8')
        if (receipt.payloadTag !== payloadTag || receipt.etag !== stateTag(current)) throw Object.assign(new Error('state conflict'), { code: 'E_CONFLICT' })
        return receipt.etag
      }
      const ifMatch = req.headers['if-match']
      if (ifMatch) {
        const current = await readFile(target, 'utf8').catch(error => {
          if (errorCode(error) === 'ENOENT') return JSON.stringify(EMPTY_STATE)
          throw error
        })
        if (ifMatch !== stateTag(current)) throw Object.assign(new Error('state conflict'), { code: 'E_CONFLICT' })
      }
      await mkdir(join(dirname(target), 'shader-skin'), { recursive: true })
      await writeFile(temp, body, 'utf8')
      await rename(temp, target)
      const etag = stateTag(body)
      if (saveId) {
        stateReceipts.set(saveId, { payloadTag, etag })
        if (stateReceipts.size > 128) stateReceipts.delete(/** @type {string} */ (stateReceipts.keys().next().value))
      }
      return etag
    } finally {
      await rm(temp, { force: true }).catch(() => {})
    }
  })
  stateWrites = write.catch(() => {})
  /** @type {string} */
  let etag
  try {
    etag = /** @type {string} */ (await write)
  } catch (error) {
    if (errorCode(error) === 'E_CONFLICT') return fail(res, 409, 'state changed in another window; reload before saving')
    const storageCode = ['ENOSPC', 'EACCES', 'EPERM', 'EROFS', 'EBUSY'].includes(String(errorCode(error))) ? ` (${String(errorCode(error))})` : ''
    fail(res, 500, `state write failed${storageCode}`)
    return
  }
  finish(res, 200, { 'content-type': 'application/json; charset=utf-8', etag }, JSON.stringify({ ok: true }))
}

/** @type {Handler} */
export async function handler(req, res) {
  /** @type {string} */
  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://dsh.local').pathname)
  } catch {
    fail(res, 400, 'bad request')
    return
  }
  if (pathname === ROUTE) pathname = `${ROUTE}/`
  if (!pathname.startsWith(`${ROUTE}/`)) return fail(res, 404, 'not found')
  const suffix = pathname.slice(ROUTE.length)

  if (suffix === '/state') return handleState(req, res)
  if (req.method !== 'GET' && req.method !== 'HEAD') return finish(res, 405, { allow: 'GET, HEAD' })
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

/**
 * @param {CordisContext} ctx
 */
export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE,
    handler,
  }), 'shadertoy-skin: renderer, presets and state routes')
}
