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

    /** The module table can be incomplete at factory time; retry lazily. */
    function ensureReact() {
      if (React !== null) return React
      try { React = require('react') } catch { React = null }
      return React
    }

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
          // Resolve client services on every use. Capturing `ctx.get('theme')` once at
          // effect setup was a real startup bug: client plugin rows activate
          // concurrently with the theme/slots providers, so at that moment the service
          // could still be `undefined` — the reference then stayed undefined forever,
          // glass was never applied and the sidebar row was never registered until the
          // plugin was toggled off/on (which re-ran `apply` when everything was up).
          const service = name => {
            try { return ctx.get(name) } catch { return undefined }
          }
          const waitForService = async (name, timeoutMs = 15000) => {
            const started = Date.now()
            while (Date.now() - started < timeoutMs) {
              const found = service(name)
              if (found !== undefined && found !== null) return found
              await new Promise(resolve => { timers.push(setTimeout(resolve, 50)) })
              if (!booted) return undefined
            }
            return service(name)
          }
          let glassDispose = null
          let background = null
          let booted = false
          let sidebarRegistered = false
          // stays false until the safe-mode file check completed, so the self-heal
          // loop can never bypass `$DSH_HOME/shader-skin.safe`
          let sidebarAllowed = false
          let playerReady = false
          let playerInitAttempts = 0
          let initRequest = 0
          let presetRequest = 0
          let stateRequest = 0
          // WebAudio inside an iframe may start suspended until a real user gesture
          // (autoplay policy); the first click / keypress in the app is that gesture.
          let audioSuspended = false

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
          // The boxes that follow the `panels` level: cards, nested panels, code
          // blocks, the composer/editor surface (`bg-module-platform`) and the
          // message input (`specific-input-major`). Popovers/menus get a higher
          // alpha below so they stay readable.
          const LAYER_TOKENS = [
            '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2',
            '--dsw-alias-bg-layer-3', '--dsw-alias-bg-layer-4',
            '--dsw-alias-bg-module-platform', '--dsw-specific-input-major',
          ]
          const RAISED_TOKENS = [
            '--dsw-alias-bg-overlay', '--dsw-specific-menu',
          ]
          /**
           * Content fills that never go through the `bg-layer-*` tokens: the
           * changed-files header strip, deliverable/plan cards, markdown code
           * blocks + inline code, and the user-message bubble. In the light theme
           * those default to opaque near-white (the static neutral-50/100 scale),
           * which is what made some assistant replies look like solid white
           * patches while every other card was translucent. Each entry is
           * [token, weight]: the weight scales the current `panels` alpha.
           */
          const CONTENT_TOKENS = [
            ['--dsw-static-neutral-50', 0.62],
            ['--dsw-static-neutral-100', 0.62],
            ['--dsw-static-neutral-800', 0.62],
            ['--dsw-static-neutral-850', 0.62],
            ['--dsw-alias-markdown-code-block', 0.9],
            ['--dsw-alias-markdown-code-block-banner', 1],
            ['--dsw-alias-markdown-inline-code', 0.7],
            ['--dsw-specific-bubble', 1],
          ]

          /** `panels` = opaque (leave theme fills) | half | clear. */
          const PANEL_ALPHA = { half: 0.62, clear: 0.22 }

          function ensureGlassStyle() {
            if (document.getElementById(STYLE_ID)) return
            const style = document.createElement('style')
            style.id = STYLE_ID
            style.textContent = GLASS_CSS
            ;(document.head ?? document.documentElement).append(style)
          }

          function rgba(color, alpha) {
            return { light: `rgba(255, 255, 255, ${alpha})`, dark: `rgba(${color}, ${alpha})` }
          }

          function glassTokens() {
            const tokens = { ...CLEAR_TOKENS }
            const alpha = PANEL_ALPHA[effective().panels] ?? null
            if (alpha === null) return tokens
            const raised = Math.min(0.96, alpha + 0.32)
            for (const token of LAYER_TOKENS) tokens[token] = rgba('9, 12, 16', alpha)
            for (const token of RAISED_TOKENS) tokens[token] = rgba('9, 12, 16', raised)
            for (const [token, weight] of CONTENT_TOKENS) {
              tokens[token] = rgba('9, 12, 16', Math.min(0.96, alpha * weight))
            }
            return tokens
          }

          /** True when every overridden token is present as an inline body style. */
          function tokensIntact(tokens) {
            const style = document.body?.style
            if (!style) return false
            return Object.keys(tokens).every(name => style.getPropertyValue(name) !== '')
          }

          let glassSignature = null
          /**
           * Publish the glass token layer. Safe to call repeatedly: it re-applies only
           * when the token set changed or the inline overrides are missing (the app
           * shell may reset body styles during its own startup).
           */
          function applyGlass(force = false) {
            if (!booted) return false
            const theme = service('theme')
            if (theme === undefined) return false
            const tokens = glassTokens()
            const signature = JSON.stringify(tokens)
            if (!force && signature === glassSignature
              && document.getElementById(STYLE_ID) !== null
              && tokensIntact(tokens)) return true
            glassSignature = signature
            ensureGlassStyle()
            glassDispose?.()
            glassDispose = theme.overrideTokens('shadertoy-skin', tokens)
            return tokensIntact(tokens)
          }

          function clearGlass() {
            glassDispose?.()
            glassDispose = null
            glassSignature = null
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
            const request = ++stateRequest
            const raw = await fetchJson(`${BASE}/state`).catch(() => null)
            if (request !== stateRequest) return store
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
            if (frame === null || playerInitAttempts >= 4) return
            const request = ++initRequest
            const id = store.activeId
            playerInitAttempts += 1
            const retry = (delay) => {
              if (playerInitAttempts >= 4) return
              timers.push(setTimeout(() => {
                if (request === initRequest && booted && !playerReady && background === frame) void sendInit(frame)
              }, delay))
            }
            try {
              const preset = await resolvePreset(store.activeId ?? FALLBACK_PRESET)
              if (!booted || request !== initRequest || frame !== background || id !== store.activeId) return
              store.activeId = preset.id
              // theme first: the player keeps per-theme preview defaults only until
              // it receives an explicit look, and init carries that explicit look
              postTo(frame, { type: 'theme', dark: isDark() })
              postTo(frame, { type: 'init', preset, params: { ...effective(), ...playerLook() } })
              broadcastPanel({ type: 'preset', id: preset.id, name: preset.name })
              retry(3000)
            } catch (error) {
              console.warn('[shadertoy-skin] could not start the renderer:', error)
              retry(900)
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
            playerReady = false
            playerInitAttempts = 0
            frame.addEventListener('load', () => { void sendInit(frame) })
            return frame
          }

          function removeBackground() {
            initRequest++
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
                const id = typeof message.id === 'string' ? message.id : store.activeId
                store.overrides[id] = { ...(message.params ?? {}) }
                if (id !== store.activeId) return
                applyGlass()
                syncEnabled()
                postTo(background, { type: 'params', params: { ...effective(), ...playerLook() } })
                return
              }
              case 'preset': {
                if (typeof message.id === 'string' && message.id !== '') {
                  const request = ++presetRequest
                  initRequest++
                  await reloadState()
                  if (!booted || request !== presetRequest) return
                  store.activeId = message.id
                  playerInitAttempts = 0
                  playerReady = false
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
          //
          // iMouse follows a drag that starts on the *page surface* — never on DSH's
          // own controls. Clicking a button, selecting a reply (copy/paste), dragging
          // a scrollbar or typing in the composer must not steer the shader; that was
          // the second complaint after "hover moves the background".
          //
          // Press -> anchor, drag -> xy, release -> one message with a negated click
          // flag, which is how ShaderToy shaders detect `iMouse.z < 0.0`.
          const UI_SELECTOR = [
            'button', 'a', 'input', 'textarea', 'select', 'summary', 'label',
            '[contenteditable="true"]', '[role="button"]', '[role="tab"]',
            '[role="menuitem"]', '[role="option"]', '[role="dialog"]',
            '[role="listbox"]', '[data-shell-overlay]', '[data-rightbar-col]',
            '[data-shell-bottom]', '[data-shell-leading]', '[data-shortcut-modal]',
          ].join(',')

          function selectionIsRange() {
            try { return window.getSelection?.()?.type === 'Range' } catch { return false }
          }

          /** True when the pointer went down on DSH chrome / selectable content. */
          function isUiTarget(target) {
            if (!(target instanceof Element)) return true
            if (target.closest(UI_SELECTOR)) return true
            // Selectable text (chat replies, code blocks, tables): the drag is a
            // copy/select gesture. Checked by computed style because DSH has no
            // stable class for "selectable content".
            let node = target
            for (let depth = 0; node !== null && node !== document.body && depth < 6; depth += 1) {
              if (getComputedStyle(node).userSelect === 'text') return true
              node = node.parentElement
            }
            return selectionIsRange()
          }

          let drag = null
          let pending = null
          let scheduled = 0
          const flushPointer = () => {
            scheduled = 0
            if (pending === null) return
            const message = pending
            pending = null
            // a text selection appeared between the event and the frame: copying,
            // not steering
            if (selectionIsRange()) { drag = null; return }
            postTo(background, { type: 'mouse', mouse: message })
          }
          const queuePointer = (x, y, down) => {
            pending = down
              ? [x, y, drag.anchorX, drag.anchorY]
              : [x, y, -Math.abs(drag.anchorX), -Math.abs(drag.anchorY)]
            if (scheduled === 0) scheduled = requestAnimationFrame(flushPointer)
          }
          on(window, 'pointermove', event => {
            if (drag === null || !document.hasFocus() || !background) return
            if (selectionIsRange()) { drag = null; return }
            drag.x = event.clientX
            drag.y = window.innerHeight - event.clientY
            drag.live = true
            queuePointer(drag.x, drag.y, true)
          }, { passive: true })
          on(window, 'pointerdown', event => {
            if (event.button !== 0 || !background || !document.hasFocus()) return
            if (isUiTarget(event.target)) { drag = null; return }
            const x = event.clientX
            const y = window.innerHeight - event.clientY
            drag = { anchorX: x, anchorY: y, x, y, live: false }
          }, { passive: true })
          const release = () => {
            if (drag === null) return
            const { x, y, anchorX, anchorY, live } = drag
            drag = null
            if (!live) return
            // ShaderToy convention: while released iMouse.zw are the negated click point
            pending = [x, y, -Math.abs(anchorX), -Math.abs(anchorY)]
            if (scheduled === 0) scheduled = requestAnimationFrame(flushPointer)
          }
          on(window, 'pointerup', release, { passive: true })
          on(window, 'pointercancel', release, { passive: true })
          on(window, 'blur', release)

          // Autoplay policy: an iframe's AudioContext may stay suspended until the
          // page gets a real gesture. Any click / keypress in the app unlocks it, so
          // a background with `mainSound` starts playing without hunting for the
          // panel's 「开声音」 button.
          const unlockAudio = () => {
            if (!audioSuspended) return
            audioSuspended = false
            postTo(background, { type: 'audio-resume' })
          }
          on(window, 'pointerdown', unlockAudio, { passive: true })
          on(window, 'keydown', unlockAudio)
          on(window, 'focus', unlockAudio)

          // ------------------------------------------------------- message routing
          on(window, 'message', event => {
            if (event.origin !== location.origin) return
            const message = event.data
            if (!message || typeof message !== 'object') return
            if (background && event.source === background.contentWindow) {
              if (message.type === 'ready') {
                playerReady = true
                playerInitAttempts = 0
              } else if (message.type === 'audio') {
                audioSuspended = message.state === 'suspended'
                broadcastPanel({ type: 'audio', ...message })
              } else if (message.type === 'error') {
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
            const slots = service('slots')
            if (slots === undefined || ensureReact() === null) {
              console.warn('[shadertoy-skin] slots service or react unavailable yet; sidebar entry deferred')
              return false
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
            return true
          }

          // -------------------------------------------------------------- self-heal
          //
          // Desktop startup is a race: client rows activate concurrently with the
          // services they use, the shell resets body styles once while it paints, and
          // the player reports `ready` only after its first frame. A single early
          // attempt is not enough — this surface verification runs a bounded number of
          // times after boot (plus once on the first real user gesture) and repairs
          // whichever piece is missing:
          //   • the background iframe was never created / got detached  -> recreate
          //   • the glass token overrides were reset with the body styles -> re-apply
          //   • the player never received init / never reported ready    -> re-init
          //   • the sidebar row could not register while slots was still missing -> retry
          function verifySurface() {
            if (!booted) return
            if (effective().enabled === false) return
            const frame = document.getElementById(BG_ID)
            if (frame === null) {
              syncEnabled()
              return
            }
            if (frame !== background) background = frame
            if (sidebarAllowed && !sidebarRegistered) {
              try { sidebarRegistered = registerSidebar() } catch { /* retried later */ }
            }
            applyGlass()
            if (!playerReady && playerInitAttempts < 4) void sendInit(background)
          }

          function scheduleVerify() {
            for (const delay of [0, 250, 700, 1500, 3000, 6000, 10000, 15000]) {
              timers.push(setTimeout(() => { if (booted) verifySurface() }, delay))
            }
            // the first real interaction is also the moment a slow desktop shell has
            // definitely finished mounting
            const kick = () => verifySurface()
            on(window, 'focus', kick)
            on(window, 'pointerdown', kick, { once: true, passive: true })
            on(document, 'visibilitychange', () => { if (!document.hidden) verifySurface() })
          }

          // ------------------------------------------------------------------- boot
          void (async () => {
            if (document.body === null) {
              await new Promise(resolve => { document.addEventListener('DOMContentLoaded', resolve, { once: true }) })
            }
            store.defaults = { ...FALLBACK_DEFAULTS }
            const defaults = await fetchJson(`${BASE}/defaults.json`).catch(() => null)
            if (defaults?.params && typeof defaults.params === 'object') store.defaults = { ...FALLBACK_DEFAULTS, ...defaults.params }
            await reloadState()
            if (!store.activeId) store.activeId = FALLBACK_PRESET
            booted = true
            syncEnabled()
            // Start the bounded checks first so a slow service never delays them.
            scheduleVerify()
            // Services keep activating after us: wait for the theme before publishing
            // the glass, otherwise the overrides are lost for this whole page life.
            await waitForService('theme')
            applyGlass()
            const safeMode = await fetchJson(`${BASE}/safe-mode`).catch(() => ({ on: false }))
            if (safeMode?.on === true) {
              console.warn('[shadertoy-skin] safe mode: sidebar entry disabled ($DSH_HOME/shader-skin.safe exists)')
            } else {
              sidebarAllowed = ENABLE_SIDEBAR_ENTRY
              if (booted && !sidebarRegistered) {
                await waitForService('slots')
                try { sidebarRegistered = registerSidebar() } catch (error) { console.warn('[shadertoy-skin] sidebar registration skipped:', error) }
              }
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
