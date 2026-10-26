#!/usr/bin/env node
// Local dev server for the shader skin renderer.
// Serves `native-dist` at `/` with no-cache, mimicking the Host route
// (`/shader-skin/*` -> native-dist/*) that index.js registers.
//
//   node tools/dev-server.mjs [port]
//
// Then open http://127.0.0.1:8730/player.html?preset=aurora
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('../native-dist/', import.meta.url)))
const PORT = Number(process.argv[2] ?? 8730)
const HOST = '127.0.0.1'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glsl': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

function send(res, status, headers, body) {
  res.writeHead(status, { 'cache-control': 'no-cache, no-store, must-revalidate', ...headers })
  res.end(body)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`)
  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    send(res, 400, { 'content-type': 'text/plain' }, 'bad request')
    return
  }
  if (pathname.endsWith('/')) pathname += 'index.html'
  const target = resolve(join(ROOT, normalize(pathname)))
  if (target !== ROOT && !target.startsWith(`${ROOT}${sep}`)) {
    send(res, 403, { 'content-type': 'text/plain' }, 'forbidden')
    return
  }
  try {
    const info = await stat(target)
    if (!info.isFile()) throw Object.assign(new Error('not a file'), { code: 'ENOENT' })
    const body = await readFile(target)
    send(res, 200, {
      'content-type': MIME[extname(target)] ?? 'application/octet-stream',
      'content-length': String(body.byteLength),
    }, req.method === 'HEAD' ? undefined : body)
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'EISDIR')) {
      send(res, 404, { 'content-type': 'text/plain; charset=utf-8' }, `404 ${pathname}`)
      return
    }
    send(res, 500, { 'content-type': 'text/plain; charset=utf-8' }, String(error))
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[dev-server] root=${ROOT}`)
  console.log(`[dev-server] http://${HOST}:${PORT}/player.html?preset=aurora`)
})
