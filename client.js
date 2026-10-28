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
    const FALLBACK_DEFAULTS = { enabled: true, glass: 60, brightness: 100, panels: 'half', blur: 0, scale: 1, fps: 30, speed: 1, loop: true, loopMode: 'auto', audioDurationMode: 'auto', volume: 60, muted: false }
    const GLOBAL_KEYS = ['enabled', 'glass', 'panels', 'blur', 'scale', 'fps', 'volume', 'muted']
    const FALLBACK_PRESET = 'aurora'
    // The settings surface is independent of whether the background is enabled.
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

    async function readHost(url, type) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8000)
      try {
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error(`${response.status} ${url}`)
        return await response[type]()
      } finally { clearTimeout(timer) }
    }
    const fetchJson = url => readHost(url, 'json')
    const fetchText = url => readHost(url, 'text')

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

          const store = { activeId: null, entries: [], overrides: {}, settings: {}, defaults: FALLBACK_DEFAULTS }
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
          let disposed = false
          let sidebarRegistered = false
          // stays false until the safe-mode file check completed, so the self-heal
          // loop can never bypass `$DSH_HOME/shader-skin.safe`
          let sidebarAllowed = false
          let playerReady = false
          let playerInitAttempts = 0
          let initRequest = 0
          let presetRequest = 0
          let stateRequest = 0
          let paramsRevision = 0
          // Monotonic revisions for every init/params message sent to the player.
          // The player keeps the two sequences separate and drops a message whose
          // revision is older than the last one it applied, so a delayed init for a
          // previous preset can never override a newer selection (both can be in
          // flight: retries, panel saves, reloads).
          let initRevision = 0
          let paramsMessageRevision = 0
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
          // composition layer, whatever the DOM depth. In half mode the same
          // slider also updates semantic surface fills; the shell stays clear.
          //
          // Deliberately NO `:has()` selectors here. Anchoring the whole `#root` with
          // `:has()` makes Chromium re-evaluate the entire tree on every panel switch;
          // that is exactly what froze the app when the sidebar entry was clicked, and
          // dsh-better-sidebar documents the same pitfall (`#root [data-dsh-center-col]`
          // single-node marker instead of `:has()`).
          const DARK_VEIL = '#151517'
          const LIGHT_VEIL = '#ffffff'
          const STYLE_ID = 'shadertoy-skin-glass-style'
          const GLASS_CSS = `html, body { background: transparent !important; }
            [role="dialog"], [role="alertdialog"], [data-shortcut-modal="settings"] {
              background-color: var(--shader-skin-dialog-surface) !important;
            }
            /* These component-local fills shadow inherited theme tokens. Keep
               the outer card's fill, but never stack a second fill in its head. */
            html[data-shader-skin-panels] [class*="_card"] {
              --changes-fill: transparent !important;
              --changes-hover: transparent !important;
              --plan-card-fill: var(--shader-skin-surface) !important;
              --plan-card-hover: var(--shader-skin-surface) !important;
            }
            html[data-shader-skin-panels] [class*="_root"] {
              --deliverable-fill: var(--shader-skin-surface) !important;
              --deliverable-hover: var(--shader-skin-surface) !important;
            }
            /* Stable DSH Markdown attributes cover plain, highlighted and card
               code blocks. Only the wrapper paints, including its sticky head. */
            html[data-shader-skin-panels] .md-code-block {
              background: var(--shader-skin-surface) !important;
              --dsl-code-block-background: transparent !important;
              --dsl-code-block-banner-background-color: transparent !important;
            }
            html[data-shader-skin-panels] .md-code-block [data-code-block-banner],
            html[data-shader-skin-panels] .md-code-block [data-code-block-content],
            html[data-shader-skin-panels] .md-code-block pre {
              background: transparent !important;
            }
            /* macOS hardcodes this button's fill instead of using the token. */
            html[data-shader-skin-panels] button[class*="_newSession"] {
              background: var(--shader-skin-surface) !important;
            }`
          const CLEAR_TOKENS = {
            '--dsw-alias-bg-base': { light: 'transparent', dark: 'transparent' },
            '--dsw-specific-sidebar-fill': { light: 'transparent', dark: 'transparent' },
            '--shader-skin-dialog-surface': { light: '#fff', dark: '#232324' },
          }
          // The boxes that follow the `panels` level: cards, nested panels, code
          // blocks and the composer/editor surface (`bg-module-platform`).
          const LAYER_TOKENS = [
            '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2',
            '--dsw-alias-bg-layer-3', '--dsw-alias-bg-layer-4',
            '--dsw-alias-bg-module-platform',
          ]
          const RAISED_TOKENS = [
            '--dsw-alias-bg-overlay', '--dsw-specific-menu', '--dsw-menu-surface-fill',
            '--dsw-alias-menu-group-header-fill', '--dsw-specific-selector',
            '--dsw-specific-input-major',
            '--dsw-alias-button-elevated-fill', '--dsw-alias-button-elevated-hover',
            '--dsw-alias-button-floating-fill', '--dsw-alias-button-floating-hover',
          ]
          /**
           * Semantic content surfaces only. Never override a static palette:
           * the same neutral value may also be used for foreground text/icons.
           * Every surface shares the selected opacity, without hidden floors.
           */
          const CONTENT_TOKENS = [
            '--dsw-alias-markdown-code-block',
            '--dsw-alias-markdown-code-block-banner',
            '--dsw-alias-markdown-inline-code',
            '--dsw-specific-bubble',
          ]

          /** `panels` = opaque (leave theme fills) | half | clear. */
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
            const params = effective()
            if (!['half', 'clear'].includes(params.panels)) return tokens
            const alpha = params.panels === 'clear' ? 0 : clamp(params.glass, 20, 95, 60) / 100
            for (const token of [...LAYER_TOKENS, ...RAISED_TOKENS, ...CONTENT_TOKENS,
              '--shader-skin-surface', '--shader-skin-dialog-surface']) tokens[token] = rgba('35, 35, 36', alpha)
            return tokens
          }

          /** True when every overridden token is present as an inline body style. */
          function tokensIntact(tokens) {
            const style = document.body?.style
            if (!style) return false
            const mode = isDark() ? 'dark' : 'light'
            return Object.entries(tokens).every(([name, value]) => style.getPropertyValue(name).trim() === value[mode])
          }

          let glassSignature = null
          /**
           * Publish the glass token layer. Safe to call repeatedly: it re-applies only
           * when the token set changed or the inline overrides are missing (the app
           * shell may reset body styles during its own startup).
           */
          function applyGlass(force = false) {
            if (!booted) return false
            if (effective().enabled === false) { clearGlass(); return false }
            const mode = effective().panels
            if (['half', 'clear'].includes(mode)) document.documentElement.dataset.shaderSkinPanels = mode
            else delete document.documentElement.dataset.shaderSkinPanels
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
            delete document.documentElement.dataset.shaderSkinPanels
          }

          // ------------------------------------------------------------ parameters
          function effective() {
            return { ...store.defaults, ...(store.overrides[store.activeId] ?? {}), ...store.settings }
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
            const state = { version: 2, activeId: null, entries: [], overrides: {}, settings: {} }
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
            const legacy = state.overrides[state.activeId] ?? {}
            const preferences = { ...legacy, ...raw.settings }
            state.settings = Object.fromEntries(GLOBAL_KEYS.filter(key => key in preferences).map(key => [key, preferences[key]]))
            return state
          }

          async function reloadState() {
            const request = ++stateRequest
            const paramsAtRead = paramsRevision
            const raw = await fetchJson(`${BASE}/state`).catch(() => undefined)
            if (request !== stateRequest) return store
            if (raw === undefined) return store
            const next = normalizeState(raw)
            store.entries = next.entries
            if (paramsAtRead === paramsRevision) {
              store.activeId = next.activeId
              store.overrides = next.overrides
              store.settings = next.settings
            } else {
              // A live parameter edit cannot invalidate the source/library read
              // that makes a newly imported or edited project available.
              store.overrides = { ...next.overrides, ...store.overrides }
            }
            return store
          }

          // ------------------------------------------------------------- renderer
          async function resolvePreset(id) {
            const entry = store.entries.find(item => item.id === id)
            if (entry) {
              return { id: entry.id, name: entry.name || entry.id, code: entry.code }
            }
            const manifest = await fetchJson(`${BASE}/presets/index.json`).catch(() => [])
            const list = Array.isArray(manifest) ? manifest : []
            const item = list.find(candidate => candidate.id === id) ?? list[0]
            if (!item) throw new Error('no presets available')
            const { loadBuiltin } = await import(`${BASE}/project.js`)
            const code = await loadBuiltin(item, file => fetchText(`${BASE}/presets/${file}`))
            return { id: item.id, name: item.name || item.id, code }
          }

          function postTo(target, message) {
            const win = target?.contentWindow ?? target
            try { win?.postMessage(message, location.origin) } catch { /* frame gone */ }
          }

          function broadcastPanel(message) {
            for (const win of panelWindows) postTo(win, message)
          }

          async function sendInit(frame, revision = ++initRevision) {
            if (frame === null || playerInitAttempts >= 4) return
            const request = ++initRequest
            const id = store.activeId
            playerInitAttempts += 1
            const retry = (delay) => {
              if (playerInitAttempts >= 4) return
              timers.push(setTimeout(() => {
                if (request === initRequest && booted && !playerReady && background === frame) void sendInit(frame, revision)
              }, delay))
            }
            try {
              const preset = await resolvePreset(store.activeId ?? FALLBACK_PRESET)
              if (!booted || request !== initRequest || frame !== background || id !== store.activeId) return
              store.activeId = preset.id
              // theme first: the player keeps per-theme preview defaults only until
              // it receives an explicit look, and init carries that explicit look
              postTo(frame, { type: 'theme', dark: isDark() })
              postTo(frame, { type: 'init', revision, preset, params: { ...effective(), ...playerLook() } })
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
            frame.addEventListener('load', () => {
              playerInitAttempts = 0
              playerReady = false
              void sendInit(frame)
            })
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
                paramsRevision++
                const id = typeof message.id === 'string' ? message.id : store.activeId
                store.overrides[id] = { ...(message.params ?? {}) }
                for (const key of GLOBAL_KEYS) if (key in (message.params ?? {})) store.settings[key] = message.params[key]
                applyGlass()
                syncEnabled()
                postTo(background, { type: 'params', revision: ++paramsMessageRevision, params: { ...effective(), ...playerLook() } })
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
            } else if (!enabled) {
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
            '[contenteditable]:not([contenteditable="false"])', '[role="button"]', '[role="tab"]',
            '[role="menuitem"]', '[role="option"]', '[role="dialog"]',
            '[role="listbox"]', '[data-shell-overlay]', '[data-rightbar-col]',
            '[data-shell-bottom]', '[data-shell-leading]', '[data-shortcut-modal]',
            '[role="textbox"]', '[role="slider"]', '[role="separator"]', '[role="menu"]',
            '[draggable="true"]', 'pre', 'code', 'p', 'table', '.md-code-block',
          ].join(',')

          function selectionIsRange() {
            try { return window.getSelection?.()?.type === 'Range' } catch { return false }
          }

          /** True when the pointer went down on DSH chrome / selectable content. */
          function isUiTarget(target) {
            if (!(target instanceof Element)) return true
            if (target.closest(UI_SELECTOR)) return true
            // user-select:auto also selects normal chat text. Only explicit blank
            // surfaces are eligible; text descendants and scrollbars belong to DSH.
            if ([...target.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
              && getComputedStyle(target).userSelect !== 'none') return true
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
            if (message[2] > 0 && selectionIsRange()) { release(); return }
            postTo(background, { type: 'mouse', mouse: message })
          }
          const queuePointer = (x, y, down) => {
            pending = down
              ? [x, y, drag.anchorX, drag.anchorY]
              : [x, y, -Math.abs(drag.anchorX), -Math.abs(drag.anchorY)]
            if (scheduled === 0) scheduled = requestAnimationFrame(flushPointer)
          }
          on(window, 'pointermove', event => {
            if (drag === null || !background || event.pointerId !== drag.pointerId) return
            if (!document.hasFocus() || !(event.buttons & 1) || selectionIsRange() || isUiTarget(event.target)) { release(); return }
            drag.x = event.clientX
            drag.y = window.innerHeight - event.clientY
            drag.live = true
            queuePointer(drag.x, drag.y, true)
          }, { passive: true })
          on(window, 'pointerdown', event => {
            if (event.button !== 0 || event.isPrimary === false || !background || !document.hasFocus()) return
            release()
            if (isUiTarget(event.target) || isUiTarget(document.activeElement)) return
            const root = document.documentElement
            if (event.clientX >= root.clientWidth || event.clientY >= root.clientHeight) return
            const rect = event.target.getBoundingClientRect()
            if ((event.target.offsetWidth > event.target.clientWidth && event.clientX >= rect.left + event.target.clientWidth)
              || (event.target.offsetHeight > event.target.clientHeight && event.clientY >= rect.top + event.target.clientHeight)) return
            const x = Math.max(0.001, event.clientX)
            const y = Math.max(0.001, window.innerHeight - event.clientY)
            drag = { pointerId: event.pointerId, anchorX: x, anchorY: y, x, y, live: false }
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
          on(window, 'pointerout', event => {
            if (event.relatedTarget === null || event.relatedTarget instanceof HTMLIFrameElement) release()
          }, { passive: true })
          on(document, 'selectionchange', () => { if (selectionIsRange()) release() })
          on(document, 'visibilitychange', () => { if (document.hidden) release() })

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
            if (background) {
              postTo(background, { type: 'theme', dark })
              postTo(background, { type: 'params', revision: ++paramsMessageRevision, params: playerLook() })
            }
            broadcastPanel({ type: 'theme', dark })
          })
          if (document.body) themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
          listeners.push(() => themeObserver.disconnect())
          // A page or a late theme presenter can overwrite styles long after boot.
          // Compare values and repair once per animation frame, never synchronously
          // inside the theme/change path (which would recurse).
          let glassRepairFrame = 0
          const glassObserver = new MutationObserver(() => {
            if (glassRepairFrame || !booted || effective().enabled === false) return
            glassRepairFrame = requestAnimationFrame(() => { glassRepairFrame = 0; if (booted) applyGlass() })
          })
          if (document.body) glassObserver.observe(document.body, { attributes: true, attributeFilter: ['style'] })
          listeners.push(() => { glassObserver.disconnect(); if (glassRepairFrame) cancelAnimationFrame(glassRepairFrame) })

          // ------------------------------------------------------------ sidebar entry
          //
          // Escape hatch: create `$DSH_HOME/shader-skin.safe` and reload the page to
          // skip rendering and settings entirely without changing saved preferences.
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
            if (sidebarAllowed && !sidebarRegistered) {
              try { sidebarRegistered = registerSidebar() } catch { /* retried later */ }
            }
            if (effective().enabled === false) return
            const frame = document.getElementById(BG_ID)
            if (frame === null) {
              syncEnabled()
              return
            }
            if (frame !== background) background = frame
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
            const [defaults, , safeMode] = await Promise.all([
              fetchJson(`${BASE}/defaults.json`).catch(() => null),
              reloadState(),
              fetchJson(`${BASE}/safe-mode`).catch(() => ({ on: false })),
            ])
            if (disposed) return
            if (defaults?.params && typeof defaults.params === 'object') store.defaults = { ...FALLBACK_DEFAULTS, ...defaults.params }
            if (!store.activeId) store.activeId = FALLBACK_PRESET
            if (safeMode?.on === true) {
              console.warn('[shadertoy-skin] safe mode: rendering and settings disabled ($DSH_HOME/shader-skin.safe exists)')
              return
            }
            booted = true
            syncEnabled()
            // Start the bounded checks first so a slow service never delays them.
            scheduleVerify()
            // Theme and navigation are independent: a late theme provider must
            // not hide the settings entry for its entire 15-second deadline.
            void waitForService('theme').then(() => { if (!disposed) applyGlass() })
            sidebarAllowed = ENABLE_SIDEBAR_ENTRY
            if (booted && !sidebarRegistered) {
              await waitForService('slots')
              if (disposed) return
              try { sidebarRegistered = registerSidebar() } catch (error) { console.warn('[shadertoy-skin] sidebar registration skipped:', error) }
              if (!sidebarRegistered) scheduleVerify()
            }
          })()

          return () => {
            disposed = true
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
