// WebGL, shader compilation, GPU readback and sound synthesis never run on the
// DSH interface thread. This adapter supplies the small host surface the player
// needs; real audio devices and DOM remain in player-controller.js.
const send = (data, transfer = []) => self.postMessage(data, transfer)
const listeners = new Map(), documentListeners = new Map(), sources = new Map()
let context, sourceId = 0, started = false, loaded = false
const pending = []
const dispatch = (map, type, event) => { for (const listener of map.get(type) ?? []) listener(event) }
const register = (map, type, listener) => {
  if (!map.has(type)) map.set(type, [])
  map.get(type).push(listener)
}

class AudioProxy {
  constructor() {
    context = this
    this.sampleRate = 44100; this.state = 'suspended'; this.clock = 0; this.stamp = performance.now()
    this.destination = {}; send({ kind: 'audio', action: 'create' })
  }
  get currentTime() { return this.clock + (this.state === 'running' ? (performance.now() - this.stamp) / 1000 : 0) }
  createGain() {
    const gain = { setTargetAtTime(value) { send({ kind: 'audio', action: 'gain', value }) } }
    Object.defineProperty(gain, 'value', { set(value) { send({ kind: 'audio', action: 'gain', value }) } })
    return { gain, connect() {} }
  }
  createDynamicsCompressor() {
    return { ...Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map(key => [key, {}])), connect() {} }
  }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length))
    return { data, sampleRate, copyToChannel(source, index) { data[index].set(source) } }
  }
  createBufferSource() {
    const id = ++sourceId
    const source = {
      connect() {}, disconnect() {},
      start(when) {
        const { data, sampleRate } = source.buffer
        sources.set(id, source)
        send({ kind: 'audio', action: 'start', id, when, sampleRate, data }, data.map(channel => channel.buffer))
        source.buffer = null
      },
      stop() { sources.delete(id); send({ kind: 'audio', action: 'stop', id }) },
    }
    return source
  }
  resume() { send({ kind: 'audio', action: 'resume' }); return Promise.resolve() }
}

function node(id) {
  let text = ''
  return {
    get textContent() { return text },
    set textContent(value) { text = String(value); if (id === 'diag') send({ kind: 'diag-dom', text }) },
    set innerHTML(value) { text = String(value) },
    append(...children) { text += children.map(child => child.textContent).join('') },
    classList: { add() {}, remove() {} },
  }
}

function viewport(data) {
  self.innerWidth = data.width; self.innerHeight = data.height; self.devicePixelRatio = data.dpr
  if (self.document) {
    const changed = document.hidden !== data.hidden
    document.hidden = data.hidden
    if (changed) dispatch(documentListeners, 'visibilitychange', {})
  }
  dispatch(listeners, 'resize', {})
}

self.addEventListener('message', async ({ data }) => {
  if (data.kind === 'start') {
    if (started) return
    started = true
    const canvas = data.canvas
    Object.defineProperties(canvas, { clientWidth: { get: () => innerWidth }, clientHeight: { get: () => innerHeight } })
    canvas.style = new Proxy({ removeProperty(property) { send({ kind: 'style', property: property === 'will-change' ? 'willChange' : property, value: '' }) } }, {
      set(target, property, value) { send({ kind: 'style', property, value }); target[property] = value; return true },
    })
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: innerWidth, height: innerHeight })
    self.window = self
    self.parent = { postMessage: message => send({ kind: 'out', message }) }
    self.__standalone = data.standalone
    self.__autoboot = data.autoboot
    self.__send = message => send({ kind: 'out', message })
    self.__snapshot = (player, probe) => send({ kind: 'snapshot', player, probe })
    self.AudioContext = AudioProxy
    const nodes = { c: canvas, err: node('err'), diag: node('diag') }
    self.document = {
      hidden: data.viewport.hidden,
      getElementById: id => nodes[id],
      createElement: tag => tag === 'canvas' ? new OffscreenCanvas(1, 1) : node(tag),
      createTextNode: text => ({ textContent: text }),
      addEventListener: (type, listener) => register(documentListeners, type, listener),
      set title(text) { send({ kind: 'title', text }) },
    }
    self.addEventListener = (type, listener) => register(listeners, type, listener)
    // A timer also works in hidden/non-visible embedding contexts where worker
    // requestAnimationFrame is unavailable. The runtime still enforces its cap.
    if (!self.requestAnimationFrame) self.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 16)
    viewport(data.viewport)
    setInterval(() => send({ kind: 'heartbeat' }), 500)
    try { await import('./player-runtime.js'); loaded = true; for (const message of pending.splice(0)) dispatch(listeners, 'message', message) } catch (error) { send({ kind: 'fatal', log: error.stack || error.message }) }
  } else if (data.kind === 'message') {
    const event = { data: data.message, origin: location.origin, source: self.parent }
    if (loaded) dispatch(listeners, 'message', event); else if (pending.length < 64) pending.push(event)
  } else if (data.kind === 'event') {
    dispatch(listeners, data.type, data.event ?? {})
  } else if (data.kind === 'viewport') viewport(data.viewport)
  else if (data.kind === 'inspect') {
    self.__inspectRenderer?.(data.command, (value, error) => send({ kind: 'inspect', id: data.id, value, error }))
  } else if (data.kind === 'audio-clock' && context) {
    const previous = context.state
    context.clock = data.time; context.stamp = performance.now(); context.sampleRate = data.sampleRate; context.state = data.state
    if (previous !== context.state) context.onstatechange?.()
  } else if (data.kind === 'audio-ended') {
    const source = sources.get(data.id); sources.delete(data.id); source?.onended?.()
  }
})
