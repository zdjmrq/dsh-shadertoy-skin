#!/usr/bin/env node
// Use the production read-only routes, including realpath checks and import
// validation. Persistence is available only with an explicit disposable profile.
import { createServer } from 'node:http'
import { handler } from '../index.js'

const PORT = Number(process.argv[2] ?? 8730)
const HOST = '127.0.0.1'

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`)
    const path = url.pathname.startsWith('/shader-skin/') ? url.pathname : `/shader-skin${url.pathname}`
    if (decodeURIComponent(path) === '/shader-skin/state' && !(process.env.DSH_DEV_STATE === '1' && process.env.DSH_HOME?.trim())) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('preview persistence requires DSH_DEV_STATE=1 and a disposable DSH_HOME')
      return
    }
    req.url = path + url.search
    await handler(req, res)
  } catch {
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('preview request failed')
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[dev-server] http://${HOST}:${server.address().port}/shader-skin/player.html?preset=aurora`)
})
