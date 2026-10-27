// A minimal DSH service adapter for exercising the real client, panel and player.
// Every run uses a temporary profile; no installed DSH profile is touched.
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handler } from '../index.js'

const shell = `<!doctype html><html><head><meta charset="utf-8"><title>ShaderToy 本地预览</title>
<style>html,body{margin:0;height:100%;font-family:system-ui}#main{position:fixed;inset:0 0 0 180px}nav{position:fixed;inset:0 auto 0 0;width:180px;padding:26px 16px;box-sizing:border-box;color:#c9d7ef;background:#111722e8}nav b{display:block;color:#fff;margin-bottom:28px}nav span{display:block;padding:10px;border-radius:8px;background:#7aaaff22;color:#9dc0ff;font-size:13px}nav small{display:block;margin-top:16px;line-height:1.7;color:#a2b0c5;font-size:11px}@media(max-width:700px){nav{display:none}#main{left:0}}</style></head>
<body data-ds-dark-theme><nav><b>ShaderToy</b><span>◉ &nbsp; Shader 背景</span><small>本地预览 · 临时数据<br>修改不会影响 DSH 配置</small></nav><main id="main"></main><script>
window.__messages = [];
addEventListener('message', e => { if(e.origin === location.origin) window.__messages.push(e.data); });
const effects = [];
const React = {
  useRef: () => ({ current: null }),
  useEffect: fn => effects.push(fn),
  createElement(tag, props, ...children) {
    if (typeof tag === 'function') return tag(props || {});
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (key === 'style') Object.assign(node.style, value);
      else if (key === 'ref') value.current = node;
      else node.setAttribute(key, value);
    }
    for (const child of children.flat()) if (child != null) node.append(child);
    return node;
  }
};
const services = {
  theme: { overrideTokens: () => () => {} },
  slots: {
    inject: (_key, fn) => fn(),
    register(definition, component) {
      if (definition.name === 'main') {
        document.querySelector('#main').replaceChildren(component());
        effects.splice(0).forEach(fn => fn());
      }
      return () => {};
    }
  }
};
window.__ModuleLoader__ = { load({factory}) { factory(() => React).apply({ effect: fn => fn(), get: name => services[name] }); } };
</script><script src="/client.js"></script></body></html>`

export async function startHarness(port = 0) {
  const home = await mkdtemp(join(tmpdir(), 'shader-browser-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const server = createServer(async (req, res) => {
    try {
      if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(shell) }
      else if (req.url === '/client.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(await readFile(new URL('../client.js', import.meta.url))) }
      else await handler(req, res)
    } catch (error) { res.writeHead(500); res.end(String(error)) }
  })
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    home,
    async close() {
      await new Promise(resolve => server.close(resolve))
      await rm(home, { recursive: true, force: true })
      if (previousHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousHome
    },
  }
}

if (process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].replaceAll('\\', '/').split('/').pop())) {
  const preview = await startHarness(Number(process.argv[2]) || 8735)
  console.log(`Preview: ${preview.url} (temporary profile)`)
  process.on('SIGINT', async () => { await preview.close(); process.exit(0) })
}
