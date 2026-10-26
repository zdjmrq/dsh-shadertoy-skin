/**
 * Inspect the *live* DeepSeek Harness renderer from the outside.
 *
 * Debug instrument for the glass look: it answers "why doesn't the shader show
 * through the app shell?" by dumping (a) the background iframe state, (b) the
 * glass token values actually applied on <body>, and (c) the chain of painted
 * surfaces stacked on top of the iframe.
 *
 * Usage:
 *   node tools/inspect-live.mjs [url] [screenshot.png]
 * Defaults to http://127.0.0.1:6371/ (the running web GUI of the same profile).
 */
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://127.0.0.1:6371/'
const shot = process.argv[3] ?? ''

const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const logs = []
page.on('console', message => logs.push(`[${message.type()}] ${message.text()}`))
page.on('pageerror', error => logs.push(`[pageerror] ${error.message}`))
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
} catch (error) {
  console.log('GOTO FAILED:', error.message)
}
await page.waitForTimeout(7000)
if (shot) await page.screenshot({ path: shot })

const report = await page.evaluate(() => {
  const alpha = color => {
    if (!color) return 0
    if (color.startsWith('rgb(')) return 1
    const m = color.match(/rgba?\(([^)]+)\)/)
    if (!m) return /transparent/.test(color) ? 0 : 1
    const parts = m[1].split(',').map(s => Number.parseFloat(s))
    return parts.length >= 4 ? parts[3] : 1
  }
  const describe = element => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || '',
      cls: typeof element.className === 'string' ? element.className.slice(0, 90) : '',
      bg: style.backgroundColor,
      bgImage: style.backgroundImage.slice(0, 80),
      alpha: Number(alpha(style.backgroundColor).toFixed(3)),
      size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      pos: `${Math.round(rect.x)},${Math.round(rect.y)}`,
    }
  }
  const frame = document.getElementById('shadertoy-skin-bg')
  const body = document.body
  const inline = {}
  for (const name of ['--dsw-alias-bg-base', '--dsw-specific-sidebar-fill', '--dsw-alias-bg-elevated', '--dsw-alias-bg-card']) {
    inline[name] = {
      inline: body.style.getPropertyValue(name),
      computed: getComputedStyle(body).getPropertyValue(name).trim(),
    }
  }
  // painted surfaces stacked above the background iframe
  const painted = []
  const walk = (element, depth) => {
    if (depth > 8 || painted.length > 60) return
    for (const child of element.children) {
      if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE' || child.tagName === 'LINK') continue
      const rect = child.getBoundingClientRect()
      if (rect.width < 40 || rect.height < 20) continue
      const style = getComputedStyle(child)
      const a = alpha(style.backgroundColor)
      const coversViewport = rect.width > window.innerWidth * 0.6 && rect.height > window.innerHeight * 0.5
      if (a > 0.005 || style.backgroundImage !== 'none') {
        painted.push({ depth, coversViewport, ...describe(child) })
      }
      walk(child, depth + 1)
    }
  }
  walk(document.body, 0)
  let glassStyle = null
  for (const node of document.querySelectorAll('style')) {
    if (node.id === 'shadertoy-skin-glass-style') glassStyle = node.textContent
  }
  return {
    url: location.href,
    dark: body.hasAttribute('data-ds-dark-theme'),
    body: describe(body),
    html: describe(document.documentElement),
    root: document.getElementById('root') ? describe(document.getElementById('root')) : null,
    bgFrame: frame
      ? {
          ...describe(frame),
          zIndex: getComputedStyle(frame).zIndex,
          src: frame.getAttribute('src'),
          loaded: !!frame.contentDocument,
          innerCanvas: frame.contentDocument?.querySelector('canvas') ? 'canvas present' : 'no canvas',
        }
      : null,
    tokens: inline,
    glassStyle,
    painted,
    bodyChildren: [...document.body.children].slice(0, 12).map(c => describe(c)),
  }
})
console.log(JSON.stringify(report, null, 2))
console.log('\n--- console ---\n' + logs.slice(-40).join('\n'))
await browser.close()
