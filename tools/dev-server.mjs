#!/usr/bin/env node
// Local dev server for the shader skin.
//
//   node tools/dev-server.mjs [port]
//
// Serves two read-only mounts with no-cache:
//   /        -> native-dist/*            (what the Host serves under /shader-skin/*)
//   /local/  -> $DSH_HOME/shader-skin/presets/*   (user imports, for preview only)
//
// Then open:
//   http://127.0.0.1:8730/player.html?preset=aurora
//   http://127.0.0.1:8730/player.html?preset=local/seascape.glsl
import { createServer } from 'node:http'
import { readFile, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handler } from '../index.js'

const ROOT = resolve(fileURLToPath(new URL('../native-dist/', import.meta.url)))
const LOCAL_ROOT = resolve(process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'), 'shader-skin', 'presets')
const PORT = Number(process.argv[2] ?? 8730)
const HOST = '127.0.0.1'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glsl': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

function send(res, status, headers, body) {
  res.writeHead(status, { 'cache-control': 'no-cache, no-store, must-revalidate', ...headers })
  res.end(body)
}

function resolveInside(root, requestPath) {
  const target = resolve(join(root, normalize(requestPath)))
  if (target === root || !target.startsWith(`${root}${sep}`)) return undefined
  return target
}

async function serveFrom(root, requestPath, req, res) {
  const target = resolveInside(root, requestPath)
  if (target === undefined) return send(res, 403, { 'content-type': 'text/plain' }, 'forbidden')
  try {
    const info = await stat(target)
    if (!info.isFile()) throw Object.assign(new Error('not a file'), { code: 'ENOENT' })
    const body = await readFile(target)
    send(res, 200, {
      'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'content-length': String(body.byteLength),
    }, req.method === 'HEAD' ? undefined : body)
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'EISDIR' || error.code === 'ENOTDIR')) {
      return send(res, 404, { 'content-type': 'text/plain; charset=utf-8' }, `404 ${requestPath}`)
    }
    send(res, 500, { 'content-type': 'text/plain; charset=utf-8' }, String(error))
  }
}

/** Read-only listing so the panel's "import from local directory" can be tried in dev. */
async function listLocal() {
  let names = []
  try {
    names = await readdir(LOCAL_ROOT)
  } catch (error) {
    if (error && error.code === 'ENOENT') return []
    throw error
  }
  const out = []
  for (const name of names.sort()) {
    if (!/\.(glsl|txt|json)$/i.test(name)) continue
    try {
      const info = await stat(join(LOCAL_ROOT, name))
      if (!info.isFile()) continue
      if (/\.json$/i.test(name)) {
        const parsed = JSON.parse(await readFile(join(LOCAL_ROOT, name), 'utf8'))
        const shader = parsed?.Shader ?? parsed?.shader ?? parsed
        const passes = shader?.renderpass ?? shader?.passes
        const hasSound = Array.isArray(passes) && passes.some(pass => String(pass?.type).toLowerCase() === 'sound')
        out.push({ file: name, name: String(shader?.info?.name ?? name.replace(/\.json$/i, '')), kind: 'shadertoy', hasSound, size: info.size })
      } else {
        const text = await readFile(join(LOCAL_ROOT, name), 'utf8')
        if (!/\b(?:mainImage|mainSound|void\s+main)\s*\(/.test(text)) continue
        out.push({ file: name, name: name.replace(/\.[^.]+$/, ''), kind: 'glsl', hasSound: /\bmainSound\s*\(/.test(text), size: info.size })
      }
    } catch { /* skip unusable file */ }
  }
  return out
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`)
  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return send(res, 400, { 'content-type': 'text/plain' }, 'bad request')
  }
  // Tests opt into the real Host persistence route with a throwaway DSH_HOME.
  // Normal previews remain read-only and never write to the user's profile.
  if (pathname === '/state' && process.env.DSH_DEV_STATE === '1' && process.env.DSH_HOME) {
    req.url = '/shader-skin/state'
    return handler(req, res).catch(() => send(res, 500, {}, 'state failed'))
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { allow: 'GET, HEAD' })

  if (pathname === '/local/index.json') {
    try {
      return send(res, 200, { 'content-type': 'application/json; charset=utf-8' }, JSON.stringify(await listLocal()))
    } catch (error) {
      return send(res, 500, { 'content-type': 'text/plain; charset=utf-8' }, String(error))
    }
  }
  if (pathname.startsWith('/local/')) {
    return serveFrom(LOCAL_ROOT, pathname.slice('/local/'.length), req, res)
  }
  if (pathname.endsWith('/')) pathname += 'index.html'
  return serveFrom(ROOT, pathname.slice(1), req, res)
})

server.listen(PORT, HOST, () => {
  console.log(`[dev-server] dist=${ROOT}`)
  console.log(`[dev-server] local=${LOCAL_ROOT}`)
  console.log(`[dev-server] http://${HOST}:${PORT}/player.html?preset=aurora`)
})
