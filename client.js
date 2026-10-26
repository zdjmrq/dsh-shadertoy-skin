/**
 * dsh-shadertoy-skin — Client half.
 *
 * A thin browser shell (no React, no build step) that owns three things:
 *   1. the background iframe — first child of <body>, behind everything
 *      (`position:fixed; inset:0; z-index:-1; pointer-events:none`);
 *   2. the settings panel iframe — bottom-right, sized by the panel itself;
 *   3. the glass look — `theme.overrideTokens()` makes the app shell translucent
 *      so the shader shows through, while cards/popovers keep their own fills.
 *
 * All heavy code lives under `/shader-skin/*` and is served from disk by the Host
 * half, so editing the renderer or the panel only needs a page refresh.
 *
 * Loader contract: module id equals the package name; the factory returns
 * `{ inject, apply }` and every resource is released through ctx.effect.
 */
window.__ModuleLoader__.load({
  id: 'dsh-shadertoy-skin',
  factory() {
    const BASE = '/shader-skin'
    const BG_ID = 'shadertoy-skin-bg'
    const PANEL_ID = 'shadertoy-skin-panel'
    const FALLBACK_DEFAULTS = { glass: 72, blur: 0, scale: 1, fps: 30, speed: 1, volume: 60, muted: true }
    const FALLBACK_PRESET = 'aurora'

    const clamp = (value, lo, hi, fallback) => {
      const n = Number(value)
      return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback
    }

    async function fetchJson(url) {
      const response = await fetch(url, { cache: 'no-store' })
      if (!response.ok) throw new Error(`${response.status} ${url}`)
      return response.json()
    }

    async function fetchText(url) {
      const response = await fetch(url, { cache: 'no-store' })
      if (!response.ok) throw new Error(`${response.status} ${url}`)
      return response.text()
    }

    function isDark() {
      return document.body?.hasAttribute('data-ds-dark-theme') === true
    }

    return {
      inject: [],
      apply(ctx) {
        if (typeof document === 'undefined') return

        ctx.effect(() => {
          const listeners = []
          const timers = []
          const on = (target, event, handler, options) => {
            target.addEventListener(event, handler, options)
            listeners.push(() => target.removeEventListener(event, handler, options))
          }

          const state = { activeId: null, params: { ...FALLBACK_DEFAULTS } }
          const theme = ctx.get('theme')
          let glassDispose = null
          let background = null
          let panel = null
          let booted = false

          // ---------------------------------------------------------------- glass
          //
          // Two things happen together:
          //   1. `--dsw-alias-bg-base` / `--dsw-specific-sidebar-fill` become
          //      translucent, so every surface painted from those tokens lets the
          //      shader through while cards, menus and dialogs keep their own
          //      (untouched) fills;
          //   2. a style patch paints the desktop AppFrame once and makes its
          //      nested columns/phases transparent, so translucent paints do not
          //      stack up into a darker centre.
          //
          // If the patch matches (official shell on 0.2.x) the effective opacity is
          // exactly `glass`; if a future shell no longer matches, we compensate for
          // the two stacked token surfaces instead. The probe decides at runtime.
          const DARK_RGB = '9, 12, 16'
          const LIGHT_RGB = '255, 255, 255'
          const STYLE_ID = 'shadertoy-skin-glass-style'
          const GLASS_CSS = `
html, body { background: transparent !important; }
/* paint the shared frame once ... */
body #root div:has(> [data-shell-overlay]) { background: var(--dsw-alias-bg-base) !important; }
/* ... and never compound the nested columns / conversation phases / dock */
body #root div:has(> [data-shell-overlay]) > :is(:first-child, :nth-child(2), [data-rightbar-col]),
body #root div:has(> [data-shell-overlay]) > :nth-child(2) [data-phase],
body #root div:has(> [data-shell-overlay]) [data-rightbar-col] [data-dockkit-host="dock"] > [data-dockkit-content] {
  background: transparent !important;
}
`

          function shellDetected() {
            try {
              return document.querySelector('#root div:has(> [data-shell-overlay])') !== null
            } catch {
              return false
            }
          }

          function ensureGlassStyle() {
            if (document.getElementById(STYLE_ID)) return
            const style = document.createElement('style')
            style.id = STYLE_ID
            style.textContent = GLASS_CSS
            ;(document.head ?? document.documentElement).append(style)
          }

          function glassValue(alpha) {
            return {
              light: `rgba(${LIGHT_RGB}, ${alpha.toFixed(3)})`,
              dark: `rgba(${DARK_RGB}, ${alpha.toFixed(3)})`,
            }
          }

          function applyGlass() {
            if (theme === undefined) return
            const target = clamp(state.params.glass, 0.4, 0.9, 0.72)
            // one painted surface when the shell patch applies, otherwise two
            const layers = shellDetected() ? 1 : 2
            const alpha = 1 - Math.pow(1 - target, 1 / layers)
            ensureGlassStyle()
            const value = glassValue(alpha)
            glassDispose?.()
            glassDispose = theme.overrideTokens('shadertoy-skin', {
              '--dsw-alias-bg-base': value,
              '--dsw-specific-sidebar-fill': value,
            })
          }

          function clearGlass() {
            glassDispose?.()
            glassDispose = null
            document.getElementById(STYLE_ID)?.remove()
          }

          // ------------------------------------------------------------- renderer
          function createBackground() {
            if (document.getElementById(BG_ID)) return document.getElementById(BG_ID)
            const frame = document.createElement('iframe')
            frame.id = BG_ID
            frame.title = 'ShaderToy background'
            frame.setAttribute('aria-hidden', 'true')
            frame.setAttribute('tabindex', '-1')
            frame.setAttribute('allow', 'autoplay')
            frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:-1;pointer-events:none;background:transparent;display:block;'
            frame.src = `${BASE}/player.html`
            const host = document.body || document.documentElement
            host.insertBefore(frame, host.firstChild)
            const onLoad = () => {
              void sendInit(frame)
              const onMessage = event => {
                if (event.origin !== location.origin || event.source !== frame.contentWindow) return
                const message = event.data
                if (message && typeof message === 'object' && message.type === 'error') {
                  console.warn('[shadertoy-skin] renderer reported an error:', message.stage, message.log)
                  postTo(panel, { type: 'error', stage: message.stage, log: String(message.log ?? '').slice(0, 400) })
                }
              }
              window.addEventListener('message', onMessage)
              listeners.push(() => window.removeEventListener('message', onMessage))
            }
            frame.addEventListener('load', onLoad)
            listeners.push(() => frame.removeEventListener('load', onLoad))
            return frame
          }

          function removeBackground() {
            document.getElementById(BG_ID)?.remove()
            background = null
          }

          async function readPreset(id) {
            const manifest = await fetchJson(`${BASE}/presets/index.json`).catch(() => [])
            const entry = Array.isArray(manifest) ? manifest.find(item => item.id === id) : undefined
            if (entry) {
              return { id: entry.id, name: entry.name, image: await fetchText(`${BASE}/presets/${entry.file}`) }
            }
            return { id: FALLBACK_PRESET, name: FALLBACK_PRESET, image: await fetchText(`${BASE}/presets/aurora.glsl`) }
          }

          function postTo(frame, message) {
            try { frame?.contentWindow?.postMessage(message, location.origin) } catch { /* frame gone */ }
          }

          let pendingPreset = null
          async function sendInit(frame) {
            try {
              const preset = await readPreset(state.activeId ?? FALLBACK_PRESET)
              pendingPreset = preset.id
              postTo(frame, { type: 'init', preset, params: state.params })
              postTo(frame, { type: 'theme', dark: isDark() })
            } catch (error) {
              console.warn('[shadertoy-skin] could not start the renderer:', error)
            }
          }

          // ----------------------------------------------------------------- panel
          function createPanel() {
            if (document.getElementById(PANEL_ID)) return
            const frame = document.createElement('iframe')
            frame.id = PANEL_ID
            frame.title = 'ShaderToy background settings'
            frame.setAttribute('allow', 'autoplay')
            frame.style.cssText = 'position:fixed;right:16px;bottom:16px;width:44px;height:44px;border:0;background:transparent;z-index:6000;overflow:hidden;transition:width .18s ease,height .18s ease;'
            frame.src = `${BASE}/panel.html`
            document.body.append(frame)
            panel = frame
            const onMessage = event => {
              if (event.origin !== location.origin || event.source !== frame.contentWindow) return
              void handlePanelMessage(event.data)
            }
            window.addEventListener('message', onMessage)
            listeners.push(() => window.removeEventListener('message', onMessage))
          }

          async function handlePanelMessage(message) {
            if (!message || typeof message !== 'object') return
            if (message.type === 'resize') {
              const width = clamp(message.w, 44, 640, 44)
              const height = clamp(message.h, 44, 900, 44)
              if (panel) {
                panel.style.width = `${width}px`
                panel.style.height = `${height}px`
              }
              return
            }
            if (message.type === 'params') {
              state.params = { ...FALLBACK_DEFAULTS, ...(message.params ?? {}) }
              applyGlass()
              syncEnabled()
              postTo(background, { type: 'params', params: state.params })
              return
            }
            if (message.type === 'preset') {
              state.activeId = typeof message.id === 'string' ? message.id : state.activeId
              if (background) await sendInit(background)
              return
            }
          }

          function syncEnabled() {
            const enabled = state.params.enabled !== false
            if (enabled && !document.getElementById(BG_ID)) {
              background = createBackground()
              applyGlass()
            } else if (!enabled && document.getElementById(BG_ID)) {
              removeBackground()
              clearGlass()
            }
          }

          // ------------------------------------------------------------------ mouse
          let pointerDown = false
          let anchorX = 0
          let anchorY = 0
          let pending = null
          let scheduled = 0
          const flushPointer = () => {
            scheduled = 0
            if (pending === null) return
            postTo(background, { type: 'mouse', mouse: pending })
            pending = null
          }
          const queuePointer = (x, y) => {
            pending = pointerDown ? [x, y, anchorX, anchorY] : [x, y, -Math.abs(anchorX), -Math.abs(anchorY)]
            if (scheduled === 0) scheduled = requestAnimationFrame(flushPointer)
          }
          on(window, 'pointermove', event => {
            if (!document.hasFocus() || !background) return
            queuePointer(event.clientX, window.innerHeight - event.clientY)
          }, { passive: true })
          on(window, 'pointerdown', event => {
            pointerDown = true
            anchorX = event.clientX
            anchorY = window.innerHeight - event.clientY
            queuePointer(anchorX, anchorY)
          }, { passive: true })
          const release = () => {
            pointerDown = false
            if (scheduled === 0) scheduled = requestAnimationFrame(flushPointer)
          }
          on(window, 'pointerup', release, { passive: true })
          on(window, 'pointercancel', release, { passive: true })
          on(window, 'blur', release)

          // ------------------------------------------------------------------ theme
          const pushTheme = () => {
            if (background) postTo(background, { type: 'theme', dark: isDark() })
            applyGlass()
          }
          const themeObserver = new MutationObserver(pushTheme)
          if (document.body) themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
          listeners.push(() => themeObserver.disconnect())

          // ------------------------------------------------------------------- boot
          void (async () => {
            try {
              const defaults = await fetchJson(`${BASE}/defaults.json`).catch(() => ({ params: FALLBACK_DEFAULTS }))
              state.params = { ...FALLBACK_DEFAULTS, ...(defaults.params ?? {}) }
              const remote = await fetchJson(`${BASE}/state`).catch(() => null)
              if (remote) {
                if (typeof remote.activeId === 'string') state.activeId = remote.activeId
                if (remote.params && typeof remote.params === 'object') state.params = { ...state.params, ...remote.params }
              }
            } catch { /* keep fallbacks */ }
            booted = true
            syncEnabled()
            createPanel()
            // the React shell may mount (and re-mount) after us: re-probe the glass
            // geometry a few times so the layer compensation matches the live DOM
            for (const delay of [300, 1200, 3000]) {
              timers.push(setTimeout(() => { if (booted) applyGlass() }, delay))
            }
          })()

          return () => {
            booted = false
            if (scheduled !== 0) cancelAnimationFrame(scheduled)
            for (const id of timers) clearTimeout(id)
            clearGlass()
            removeBackground()
            document.getElementById(PANEL_ID)?.remove()
            for (const dispose of listeners) dispose()
            panel = null
          }
        }, 'shadertoy-skin: background surface, panel and glass')
      },
    }
  },
})
