/**
 * dsh-shadertoy-skin — Client half.
 *
 * Thin browser shell (no React app, no build step) that owns:
 *   1. the background iframe — first child of <body>, behind everything
 *      (`position:fixed; inset:0; z-index:-1; pointer-events:none`);
 *   2. two settings surfaces, both served from disk:
 *      - a sidebar entry (`sidebar.panellist`) whose `main` panel page is the
 *        full settings UI (`/shader-skin/panel.html?mode=main`);
 *      - a small floating quick panel (`/shader-skin/panel.html`) in the corner;
 *   3. the glass look — `theme.overrideTokens()` makes the app shell translucent
 *      so the shader shows through, while cards/popovers keep their own fills.
 *
 * State (`$DSH_HOME/shader-skin.json`, v2) is owned by the settings surfaces;
 * this half only reads it to boot and follows their messages.
 */
window.__ModuleLoader__.load({
  id: 'dsh-shadertoy-skin',
  factory(require) {
    const BASE = '/shader-skin'
    const BG_ID = 'shadertoy-skin-bg'
    const PANEL_ID = 'shadertoy-skin-panel'
    const FALLBACK_DEFAULTS = { enabled: true, glass: 72, blur: 0, scale: 1, fps: 30, speed: 1, volume: 60, muted: false }
    const FALLBACK_PRESET = 'aurora'
    // ⚠️ Keep off while the sidebar route is unstable: registering into
    // `sidebar.panellist` + `main` has frozen the frontend on panel switch.
    // Flip to true only after the cause is isolated (see docs/renderer-notes.md).
    const ENABLE_SIDEBAR_ENTRY = false

    let React = null
    try { React = require('react') } catch { React = null }

    /** Every settings iframe currently mounted (quick panel + main page). */
    const panelFrames = new Set()
    function registerPanelFrame(frame) {
      panelFrames.add(frame)
      return () => { panelFrames.delete(frame) }
    }

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

    // ---------------------------------------------------------------- UI parts
    function PanelIcon({ size = 20 } = {}) {
      const h = React.createElement
      return h('svg', {
        width: size, height: size, viewBox: '0 0 20 20', fill: 'none',
        'aria-hidden': true, style: { display: 'block' },
      },
      h('path', {
        d: 'M2 12.8c1.6-3 3.2-3 4.8 0s3.2 3 4.8 0 2.6-2.1 4.4-1',
        stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round',
      }),
      h('path', {
        d: 'M2 15.8c1.6-2.4 3.2-2.4 4.8 0s3.2 2.4 4.8 0 2.6-1.7 4.4-.8',
        stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', opacity: 0.5,
      }),
      h('circle', { cx: 14.5, cy: 5.2, r: 1.5, fill: 'currentColor', opacity: 0.85 }))
    }

    function MainSettingsPage() {
      const h = React.createElement
      const ref = React.useRef(null)
      React.useEffect(() => {
        const frame = ref.current
        if (!frame) return undefined
        return registerPanelFrame(frame)
      }, [])
      return h('iframe', {
        ref,
        title: 'ShaderToy 背景设置',
        src: `${BASE}/panel.html?mode=main`,
        style: { width: '100%', height: '100%', border: 0, display: 'block', background: 'transparent' },
      })
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

          const store = { activeId: null, entries: [], overrides: {}, defaults: FALLBACK_DEFAULTS }
          const theme = ctx.get('theme')
          const slots = ctx.get('slots')
          let glassDispose = null
          let background = null
          let panel = null
          let booted = false

          // ---------------------------------------------------------------- glass
          //
          // The shell paints two surfaces from the same tokens (the AppFrame background
          // and the nested centre column / sidebar), so one token override plus a
          // sqrt-compensated alpha yields exactly `glass` effective opacity:
          //   1 - (1 - a)^2 = glass  =>  a = 1 - sqrt(1 - glass)
          //
          // Deliberately NO `:has()` selectors here. Anchoring the whole `#root` with
          // `:has()` makes Chromium re-evaluate the entire tree on every panel switch;
          // that is exactly what froze the app when the sidebar entry was clicked, and
          // dsh-better-sidebar documents the same pitfall (`#root [data-dsh-center-col]`
          // single-node marker instead of `:has()`).
          const DARK_RGB = '9, 12, 16'
          const LIGHT_RGB = '255, 255, 255'
          const STYLE_ID = 'shadertoy-skin-glass-style'
          const GLASS_CSS = 'html, body { background: transparent !important; }'
          const GLASS_LAYERS = 2

          function ensureGlassStyle() {
            if (document.getElementById(STYLE_ID)) return
            const style = document.createElement('style')
            style.id = STYLE_ID
            style.textContent = GLASS_CSS
            ;(document.head ?? document.documentElement).append(style)
          }

          let glassApplying = false
          let lastGlassAlpha = null
          function applyGlass() {
            if (theme === undefined || !booted || glassApplying) return
            glassApplying = true
            try {
              const target = clamp(effective().glass, 0.4, 0.9, 0.72)
              const alpha = 1 - Math.pow(1 - target, 1 / GLASS_LAYERS)
              const key = alpha.toFixed(3)
              // identical value: the token layer is already in place, skip the
              // publish (every overrideTokens call emits theme/change)
              if (key === lastGlassAlpha && document.getElementById(STYLE_ID)) return
              lastGlassAlpha = key
              const value = {
                light: `rgba(${LIGHT_RGB}, ${alpha.toFixed(3)})`,
                dark: `rgba(${DARK_RGB}, ${alpha.toFixed(3)})`,
              }
              ensureGlassStyle()
              glassDispose?.()
              glassDispose = theme.overrideTokens('shadertoy-skin', {
                '--dsw-alias-bg-base': value,
                '--dsw-specific-sidebar-fill': value,
              })
            } finally {
              glassApplying = false
            }
          }

          function clearGlass() {
            glassDispose?.()
            glassDispose = null
            document.getElementById(STYLE_ID)?.remove()
          }

          // ------------------------------------------------------------ parameters
          function effective() {
            return { ...store.defaults, ...(store.overrides[store.activeId] ?? {}) }
          }

          function normalizeState(raw) {
            const state = { version: 2, activeId: null, entries: [], overrides: {} }
            if (!raw || typeof raw !== 'object') return state
            state.activeId = typeof raw.activeId === 'string' ? raw.activeId : null
            if (Array.isArray(raw.entries)) {
              state.entries = raw.entries.filter(entry => entry && typeof entry.id === 'string' && typeof entry.code?.image === 'string')
            }
            if (raw.overrides && typeof raw.overrides === 'object' && !Array.isArray(raw.overrides)) {
              state.overrides = raw.overrides
            } else if (raw.params && typeof raw.params === 'object' && state.activeId) {
              state.overrides[state.activeId] = raw.params // v1 migration
            }
            return state
          }

          async function reloadState() {
            const raw = await fetchJson(`${BASE}/state`).catch(() => null)
            const next = normalizeState(raw)
            store.activeId = next.activeId
            store.entries = next.entries
            store.overrides = next.overrides
            return store
          }

          // ------------------------------------------------------------- renderer
          async function resolvePreset(id) {
            const entry = store.entries.find(item => item.id === id)
            if (entry) {
              const code = { image: entry.code.image }
              if (typeof entry.code.sound === 'string' && entry.code.sound.trim() !== '') code.sound = entry.code.sound
              return { id: entry.id, name: entry.name || entry.id, code }
            }
            const manifest = await fetchJson(`${BASE}/presets/index.json`).catch(() => [])
            const list = Array.isArray(manifest) ? manifest : []
            const item = list.find(candidate => candidate.id === id) ?? list[0]
            if (!item) throw new Error('no presets available')
            const image = await fetchText(`${BASE}/presets/${item.file}`)
            let sound
            if (typeof item.soundFile === 'string' && item.soundFile !== '') {
              sound = await fetchText(`${BASE}/presets/${item.soundFile}`).catch(() => undefined)
            } else {
              sound = await fetchText(`${BASE}/presets/${item.id}-sound.glsl`).catch(() => undefined)
            }
            const code = { image }
            if (typeof sound === 'string' && sound.trim() !== '') code.sound = sound
            return { id: item.id, name: item.name || item.id, code }
          }

          function postTo(frame, message) {
            try { frame?.contentWindow?.postMessage(message, location.origin) } catch { /* frame gone */ }
          }

          function broadcastPanel(message) {
            for (const frame of panelFrames) postTo(frame, message)
          }

          async function sendInit(frame) {
            try {
              const preset = await resolvePreset(store.activeId ?? FALLBACK_PRESET)
              store.activeId = preset.id
              postTo(frame, { type: 'init', preset, params: effective() })
              postTo(frame, { type: 'theme', dark: isDark() })
              broadcastPanel({ type: 'preset', id: preset.id, name: preset.name })
            } catch (error) {
              console.warn('[shadertoy-skin] could not start the renderer:', error)
            }
          }

          function createBackground() {
            const existing = document.getElementById(BG_ID)
            if (existing) return existing
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
            frame.addEventListener('load', () => { void sendInit(frame) })
            return frame
          }

          function removeBackground() {
            document.getElementById(BG_ID)?.remove()
            background = null
          }

          // ----------------------------------------------------------------- panel
          function createPanel() {
            if (document.getElementById(PANEL_ID)) return
            const frame = document.createElement('iframe')
            frame.id = PANEL_ID
            frame.title = 'ShaderToy background settings'
            frame.setAttribute('allow', 'autoplay')
            frame.style.cssText = 'position:fixed;right:16px;bottom:16px;width:44px;height:44px;border:0;background:transparent;z-index:6000;overflow:hidden;'
            frame.src = `${BASE}/panel.html`
            document.body.append(frame)
            panel = frame
            registerPanelFrame(frame)
          }

          async function handlePanelMessage(message) {
            if (!message || typeof message !== 'object') return
            switch (message.type) {
              case 'resize': {
                const width = clamp(message.w, 44, 720, 44)
                const height = clamp(message.h, 44, 900, 44)
                if (panel) {
                  panel.style.width = `${width}px`
                  panel.style.height = `${height}px`
                }
                return
              }
              case 'params': {
                store.overrides[store.activeId] = { ...(message.params ?? {}) }
                applyGlass()
                syncEnabled()
                postTo(background, { type: 'params', params: effective() })
                return
              }
              case 'preset': {
                if (typeof message.id === 'string' && message.id !== '') {
                  await reloadState()
                  store.activeId = message.id
                  if (background) await sendInit(background)
                  applyGlass()
                  syncEnabled()
                }
                return
              }
              case 'audio-resume':
                postTo(background, { type: 'audio-resume' })
                return
              case 'theme':
                // the panel only asks us to re-read the host palette; forwarding is
                // enough — applying glass here would emit theme/change again
                postTo(background, { type: 'theme', dark: isDark() })
                return
              default:
                return
            }
          }

          function syncEnabled() {
            const enabled = effective().enabled !== false
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

          // ------------------------------------------------------- message routing
          on(window, 'message', event => {
            if (event.origin !== location.origin) return
            const message = event.data
            if (!message || typeof message !== 'object') return
            if (background && event.source === background.contentWindow) {
              if (message.type === 'audio') broadcastPanel({ type: 'audio', ...message })
              else if (message.type === 'error') {
                console.warn('[shadertoy-skin] renderer reported an error:', message.stage, message.log)
                broadcastPanel({ type: 'error', stage: message.stage, log: String(message.log ?? '').slice(0, 400) })
              }
              return
            }
            if (panelFrames.has(event.source)) void handlePanelMessage(message)
          })

          // ------------------------------------------------------------------ theme
          //
          // IMPORTANT: never call applyGlass() from here. `theme.overrideTokens()`
          // emits `theme/change`, the presenter then rewrites `data-ds-dark-theme`
          // on <body>, which lands in this observer again — a feedback loop that
          // pegs the renderer and freezes the frontend. We only forward *real*
          // flips (tracked by value), and the tokens themselves already carry the
          // {light, dark} pair, so the glass needs no re-apply on a theme change.
          let lastDark = isDark()
          const themeObserver = new MutationObserver(() => {
            const dark = isDark()
            if (dark === lastDark) return
            lastDark = dark
            if (background) postTo(background, { type: 'theme', dark })
            broadcastPanel({ type: 'theme', dark })
          })
          if (document.body) themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
          listeners.push(() => themeObserver.disconnect())

          // ------------------------------------------------------------ sidebar entry
          //
          // Escape hatch: create `$DSH_HOME/shader-skin.safe` and reload the page to
          // skip the sidebar entry / main panel entirely (background keeps working).
          // Useful while iterating on UI that lives inside #root.
          function registerSidebar() {
            if (slots === undefined || React === null) {
              console.warn('[shadertoy-skin] slots service or react unavailable; sidebar entry skipped')
              return
            }
            const register = (slotKey, definition, component) => {
              try {
                ctx.effect(() => slots.inject(slotKey, () => {
                  try {
                    return slots.register(definition, component)
                  } catch (error) {
                    console.warn(`[shadertoy-skin] could not register into ${slotKey}:`, error)
                    return () => {}
                  }
                }), `shadertoy-skin: ${slotKey}`)
              } catch (error) {
                console.warn(`[shadertoy-skin] could not inject into ${slotKey}:`, error)
              }
            }
            register('sidebar.panellist', {
              name: 'sidebar.panellist',
              id: 'shadertoy-skin',
              order: 40,
              label: () => 'Shader 背景',
            }, PanelIcon)
            register('main', {
              name: 'main',
              key: 'shadertoy-skin',
            }, MainSettingsPage)
          }

          // ------------------------------------------------------------------- boot
          void (async () => {
            store.defaults = { ...FALLBACK_DEFAULTS }
            const defaults = await fetchJson(`${BASE}/defaults.json`).catch(() => null)
            if (defaults?.params && typeof defaults.params === 'object') store.defaults = { ...FALLBACK_DEFAULTS, ...defaults.params }
            await reloadState()
            if (!store.activeId) store.activeId = FALLBACK_PRESET
            booted = true
            syncEnabled()
            createPanel()
            const safeMode = await fetchJson(`${BASE}/safe-mode`).catch(() => ({ on: false }))
            if (safeMode?.on === true) {
              console.warn('[shadertoy-skin] safe mode: sidebar entry disabled ($DSH_HOME/shader-skin.safe exists)')
            } else if (ENABLE_SIDEBAR_ENTRY && booted) {
              try { registerSidebar() } catch (error) { console.warn('[shadertoy-skin] sidebar registration skipped:', error) }
            }
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
            panelFrames.clear()
            panel = null
          }
        }, 'shadertoy-skin: background surface, settings surfaces and glass')
      },
    }
  },
})
