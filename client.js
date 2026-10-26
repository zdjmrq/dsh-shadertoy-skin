/**
 * dsh-shadertoy-skin — Client half.
 *
 * Thin browser shell (no React app, no build step) that owns:
 *   1. the background iframe — first child of <body>, behind everything
 *      (`position:fixed; inset:0; z-index:-1; pointer-events:none`);
 *   2. one settings surface served from disk: a sidebar entry
 *      (`sidebar.panellist`) whose `main` panel page is the full settings UI
 *      (`/shader-skin/panel.html?mode=main`). No floating popup.
 *   3. the glass look — every shell surface that paints `--dsw-alias-bg-base`
 *      / `--dsw-specific-sidebar-fill` is made fully transparent, and the
 *      darkening ("glass") is painted ONCE by the player itself as a tint mix.
 *      See the glass section below for why alpha-only tokens are not enough.
 *
 * State (`$DSH_HOME/shader-skin.json`, v2) is owned by the settings surface;
 * this half reads it to boot and follows its messages.
 */
window.__ModuleLoader__.load({
  id: 'dsh-shadertoy-skin',
  factory(require) {
    const BASE = '/shader-skin'
    const BG_ID = 'shadertoy-skin-bg'
    const FALLBACK_DEFAULTS = { enabled: true, glass: 60, brightness: 100, blur: 0, scale: 1, fps: 30, speed: 1, volume: 60, muted: false }
    const FALLBACK_PRESET = 'aurora'
    // ⚠️ Keep off while the sidebar route is unstable: registering into
    // `sidebar.panellist` + `main` has frozen the frontend on panel switch.
    // Flip to true only after the cause is isolated (see docs/renderer-notes.md).
    const ENABLE_SIDEBAR_ENTRY = true

    let React = null
    try { React = require('react') } catch { React = null }

    /**
     * Every settings iframe currently mounted, keyed by its WindowProxy.
     *
     * `postMessage` gives us `event.source === iframe.contentWindow`, NOT the
     * iframe element — storing elements here silently dropped every message from
     * the settings page (sliders appeared dead while their own state still saved).
     */
    const panelWindows = new Set()
    function registerPanelFrame(frame) {
      if (!frame) return () => {}
      let win = frame.contentWindow ?? null
      const add = () => {
        if (win === null && frame.contentWindow) win = frame.contentWindow
        if (win !== null) panelWindows.add(win)
      }
      if (win !== null) panelWindows.add(win)
      else frame.addEventListener('load', add, { once: true })
      return () => {
        frame.removeEventListener('load', add)
        if (win !== null) panelWindows.delete(win)
      }
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
      // absolute fill: the shell's main-panel container does not always give a
      // percentage height, so the iframe must not rely on `height: 100%`.
      return h('div', { style: { position: 'relative', height: '100%', minHeight: 0 } },
        h('iframe', {
          ref,
          title: 'ShaderToy 背景设置',
          src: `${BASE}/panel.html?mode=main`,
          style: { position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, display: 'block', background: 'transparent' },
        }))
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
          let booted = false

          // ---------------------------------------------------------------- glass
          //
          // The shell is a stack of surfaces that ALL paint `--dsw-alias-bg-base`
          // (AppFrame, the centre column, the page roots, the Windows titlebar's
          // frame uses `--dsw-specific-sidebar-fill`). Giving those a translucent
          // colour multiplies out: n nested surfaces at alpha a leave only
          // (1-a)^n of the shader visible — measured on the real app, one layer of
          // alpha .225 across ~10 nested surfaces dimmed a bright seascape to ~7%
          // of its brightness. That is why the old "alpha compensation for exactly
          // two layers" was both far too dark and looked like a dead slider.
          //
          // So: the shell tokens go FULLY transparent (the shader is the only
          // background), and the single darkening/whitening veil is painted by the
          // player's own tint mix (`tint` + `tintMix`, see `playerLook()`), one
          // composition layer, whatever the DOM depth. Sliding the glass slider then
          // only sends a `params` message — it never touches the theme tokens, so it
          // cannot emit `theme/change` or trigger a restyle storm.
          //
          // Deliberately NO `:has()` selectors here. Anchoring the whole `#root` with
          // `:has()` makes Chromium re-evaluate the entire tree on every panel switch;
          // that is exactly what froze the app when the sidebar entry was clicked, and
          // dsh-better-sidebar documents the same pitfall (`#root [data-dsh-center-col]`
          // single-node marker instead of `:has()`).
          const DARK_VEIL = '#090c10'
          const LIGHT_VEIL = '#ffffff'
          const STYLE_ID = 'shadertoy-skin-glass-style'
          const GLASS_CSS = 'html, body { background: transparent !important; }'
          const CLEAR_TOKENS = {
            '--dsw-alias-bg-base': { light: 'rgba(255, 255, 255, 0)', dark: 'rgba(9, 12, 16, 0)' },
            '--dsw-specific-sidebar-fill': { light: 'rgba(255, 255, 255, 0)', dark: 'rgba(9, 12, 16, 0)' },
          }

          function ensureGlassStyle() {
            if (document.getElementById(STYLE_ID)) return
            const style = document.createElement('style')
            style.id = STYLE_ID
            style.textContent = GLASS_CSS
            ;(document.head ?? document.documentElement).append(style)
          }

          let glassApplied = false
          function applyGlass() {
            if (theme === undefined || !booted || glassApplied) return
            glassApplied = true
            ensureGlassStyle()
            glassDispose = theme.overrideTokens('shadertoy-skin', CLEAR_TOKENS)
          }

          function clearGlass() {
            glassDispose?.()
            glassDispose = null
            glassApplied = false
            document.getElementById(STYLE_ID)?.remove()
          }

          // ------------------------------------------------------------ parameters
          function effective() {
            return { ...store.defaults, ...(store.overrides[store.activeId] ?? {}) }
          }

          /**
           * The one place where the sliders become pixels.
           *
           * `glass` (20–95%) is how much of the shader the veil hides; `brightness`
           * (30–180%) scales the shader before the veil. Light theme veils toward
           * white so dark text stays readable on bright shaders.
           */
          function playerLook() {
            const params = effective()
            const glass = clamp(params.glass, 20, 95, 60) / 100
            const brightness = clamp(params.brightness, 30, 180, 100) / 100
            return isDark()
              ? { dim: brightness, tint: DARK_VEIL, tintMix: glass }
              : { dim: brightness, tint: LIGHT_VEIL, tintMix: glass * 0.92 }
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

          function postTo(target, message) {
            const win = target?.contentWindow ?? target
            try { win?.postMessage(message, location.origin) } catch { /* frame gone */ }
          }

          function broadcastPanel(message) {
            for (const win of panelWindows) postTo(win, message)
          }

          async function sendInit(frame) {
            try {
              const preset = await resolvePreset(store.activeId ?? FALLBACK_PRESET)
              store.activeId = preset.id
              // theme first: the player keeps per-theme preview defaults only until
              // it receives an explicit look, and init carries that explicit look
              postTo(frame, { type: 'theme', dark: isDark() })
              postTo(frame, { type: 'init', preset, params: { ...effective(), ...playerLook() } })
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
          // Settings now live in the main column through the sidebar entry; there is
          // no floating popup any more (it was fragile and the user prefers a page).

          async function handlePanelMessage(message) {
            if (!message || typeof message !== 'object') return
            switch (message.type) {
              case 'params': {
                store.overrides[store.activeId] = { ...(message.params ?? {}) }
                applyGlass()
                syncEnabled()
                postTo(background, { type: 'params', params: { ...effective(), ...playerLook() } })
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
            if (panelWindows.has(event.source)) void handlePanelMessage(message)
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
            for (const dispose of listeners) dispose()
            panelWindows.clear()
          }
        }, 'shadertoy-skin: background surface, settings surfaces and glass')
      },
    }
  },
})
