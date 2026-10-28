// The interface thread only hosts the canvas, audio device and a bounded worker
// lifecycle. A blocked compiler/readPixels can be terminated without blocking DSH.
const standalone = parent === window
const query = new URLSearchParams(location.search)
const err = document.getElementById('err'), diag = document.getElementById('diag')
let canvas = document.getElementById('c'), worker, audio, gain, limiter, audioTimer
let generation = 0, heartbeat = performance.now(), ready = false, compiling = false, failed = false
let lastInit, fingerprint, pendingInit, initTimer, recoveryAt = -Infinity, jobStarted = performance.now()
let inspectId = 0
// Init and params are two independent message streams; a retried init must not be
// invalidated by a newer params update (and vice versa). Anything older than the
// newest applied revision of its own stream is dropped as stale.
let initRevision = 0, paramsRevision = 0
let playbackSignature = ''
const sources = new Map(), inspections = new Map()
const timeout = standalone && query.has('watchdogMs') ? Math.max(1000, Math.min(30000, Number(query.get('watchdogMs')) || 12000)) : 12000
if (standalone) window.__outbox = []

function output(message) {
  if (standalone) {
    window.__outbox.push(message)
    if (window.__outbox.length > 240) window.__outbox.shift()
  } else parent.postMessage(message, location.origin)
  if (message.type === 'error') compiling = false
  if (message.type === 'error' && standalone) {
    err.textContent = `${({ compile: '着色器编译失败', context: 'WebGL2 不可用', preset: '背景加载失败', init: '初始化失败' })[message.stage] || message.stage}\n${message.log}`; err.classList.add('open')
  }
  if (message.type === 'ready') { ready = true; compiling = false; err.classList.remove('open') }
}

function send(data, transfer = []) { worker?.postMessage(data, transfer) }
function audioClock() {
  if (audio) send({ kind: 'audio-clock', time: audio.currentTime, sampleRate: audio.sampleRate, state: audio.state })
}
/** Tear down only the audio pipeline; the wallpaper keeps rendering. */
function audioFailure(reason) {
  clearInterval(audioTimer); audioTimer = null
  for (const source of sources.values()) { source.onended = null; try { source.stop(); source.disconnect() } catch {} }
  sources.clear()
  const broken = audio
  audio = null; gain = null; limiter = null
  if (broken) { broken.onstatechange = null; void broken.close().catch(() => {}) }
  // Tell the worker to stop scheduling chunks and surface the error state.
  send({ kind: 'audio-clock', time: 0, sampleRate: 44100, state: 'error' })
  output({ type: 'audio', state: 'error', reason: `声音设备异常：${reason}` })
}
function createAudio() {
  if (audio) return true
  try {
    // The worker schedules at this exact rate; never resample already synthesized
    // ShaderToy samples because the device selected a different default rate.
    audio = new AudioContext({ sampleRate: 44100, latencyHint: 'playback' })
    gain = audio.createGain(); limiter = audio.createDynamicsCompressor()
    limiter.threshold.value = -6; limiter.knee.value = 0; limiter.ratio.value = 20
    limiter.attack.value = .003; limiter.release.value = .25
    gain.connect(limiter); limiter.connect(audio.destination)
    gain.gain.value = 0
    audio.onstatechange = audioClock
    audioTimer = setInterval(audioClock, 100)
    void audio.resume().catch(() => {})
    audioClock()
    return true
  } catch (error) {
    // A missing/broken output device must never take the background down.
    audioFailure(error.message)
    return false
  }
}
function audioCommand(data) {
  try {
    if (data.action === 'create') { createAudio(); return }
    if (!audio) return
    if (data.action === 'resume') { void audio.resume().then(audioClock, audioClock); return }
    if (data.action === 'gain') { gain.gain.setTargetAtTime(Math.max(0, Math.min(1, data.value)), audio.currentTime, .02); return }
    if (data.action === 'stop') { const source = sources.get(data.id); source?.stop(); source?.disconnect(); sources.delete(data.id); return }
    if (data.action === 'start') {
      const duration = data.data[0].length / data.sampleRate
      const late = Math.max(0, audio.currentTime - data.when)
      if (late >= duration) { send({ kind: 'audio-ended', id: data.id }); return }
      // Bound device allocations even if a faulty producer floods messages.
      if (sources.size >= 32) throw new Error('声音队列超过安全上限')
      const buffer = audio.createBuffer(2, data.data[0].length, data.sampleRate)
      buffer.copyToChannel(data.data[0], 0); buffer.copyToChannel(data.data[1], 1)
      const source = audio.createBufferSource(); source.buffer = buffer; source.connect(gain)
      const owner = worker
      source.onended = () => { source.disconnect(); sources.delete(data.id); if (owner === worker) send({ kind: 'audio-ended', id: data.id }) }
      sources.set(data.id, source); source.start(Math.max(data.when, audio.currentTime), late)
    }
  } catch (error) { audioFailure(error.message) }
}

function dispose() {
  worker?.terminate(); worker = null
  clearInterval(audioTimer); audioTimer = null
  for (const source of sources.values()) { source.onended = null; try { source.stop(); source.disconnect() } catch {} }
  sources.clear()
  if (audio) { audio.onstatechange = null; void audio.close().catch(() => {}); audio = null }
  for (const pending of inspections.values()) { clearTimeout(pending.timer); pending.reject(new Error('渲染器已停止')) }
  inspections.clear()
}
function stop(reason) {
  dispose(); failed = true; compiling = false; ready = false
  diag.textContent = reason
  if (window.__player) { window.__player.ready = false; window.__player.failure = reason }
  output({ type: 'error', stage: 'worker', log: reason })
  output({ type: 'audio', state: 'error', reason })
}
function viewport() { return { width: Math.max(1, canvas.clientWidth || innerWidth), height: Math.max(1, canvas.clientHeight || innerHeight), dpr: devicePixelRatio || 1, hidden: document.hidden } }

function start(init) {
  dispose()
  failed = false; ready = false; compiling = !!init || standalone; heartbeat = performance.now(); jobStarted = heartbeat
  if (generation) { const next = document.createElement('canvas'); next.id = 'c'; canvas.replaceWith(next); canvas = next }
  generation++
  window.__player = { ready: false, workerGeneration: generation, isolated: true, inspect }
  if (!canvas.transferControlToOffscreen || typeof Worker !== 'function') { stop('当前浏览器不支持独立 Worker 渲染，请升级 DSH。'); return }
  try {
    const url = new URL('./render-worker.js', location.href); url.search = location.search
    worker = new Worker(url, { type: 'module', name: 'shader-skin-renderer' })
    const owner = worker
    worker.onmessage = ({ data }) => {
      if (worker !== owner) return
      if (data.kind === 'heartbeat') heartbeat = performance.now()
      else if (data.kind === 'out') {
        if (data.message.type === 'context-restored') {
          if (performance.now() - recoveryAt < 60000) { stop('GPU 在一分钟内重复崩溃，已停止背景。请选择其他背景或降低分辨率。'); return }
          recoveryAt = performance.now(); start(lastInit); return
        }
        output(data.message)
      } else if (data.kind === 'snapshot') {
        window.__player = { ...data.player, workerGeneration: generation, isolated: true, inspect }
        if (standalone) { window.__audioProbe = data.probe; window.__audioInternals = { time: data.player.playback?.musicTime } }
        const preset = lastInit?.preset
        // Send only changes to durations/modes, never producer-clock ticks. A
        // previous project's last snapshot must not describe the new selection.
        if (data.player.playback && (!preset || data.player.preset === (preset.name || preset.id))) {
          const p = data.player.playback
          const message = { type: 'playback', id: preset?.id, imageDuration: p.imageDuration, musicDuration: p.musicDuration, jointPeriod: p.jointPeriod, loopPeriod: p.loopPeriod, musicLoopPeriod: p.musicLoopPeriod, loop: p.loop, mode: p.mode, audioMode: p.audioMode, speed: p.speed }
          const signature = JSON.stringify(message)
          if (signature !== playbackSignature) { playbackSignature = signature; output(message) }
        }
      } else if (data.kind === 'diag-dom') diag.textContent = data.text
      else if (data.kind === 'title') document.title = data.text
      else if (data.kind === 'style' && ['filter', 'willChange'].includes(data.property)) canvas.style[data.property] = data.value
      else if (data.kind === 'audio') audioCommand(data)
      else if (data.kind === 'fatal') stop(data.log)
      else if (data.kind === 'inspect') {
        const pending = inspections.get(data.id)
        if (pending) { clearTimeout(pending.timer); inspections.delete(data.id); data.error ? pending.reject(new Error(data.error)) : pending.resolve(data.value) }
      }
    }
    worker.onerror = event => { event.preventDefault(); if (owner === worker) stop(`渲染线程异常：${event.message}`) }
    worker.onmessageerror = () => { if (owner === worker) stop('渲染线程通信失败') }
    const offscreen = canvas.transferControlToOffscreen()
    // Recovery of a standalone preview uses the last explicit project rather
    // than fetching the initial query preset again.
    send({ kind: 'start', canvas: offscreen, viewport: viewport(), standalone, autoboot: !init }, [offscreen])
    if (init) send({ kind: 'message', message: init })
  } catch (error) { stop(`渲染线程启动失败：${error.message}`) }
}

function inspect(command) {
  return new Promise((resolve, reject) => {
    if (!worker) { reject(new Error('渲染器不可用')); return }
    const id = ++inspectId
    const timer = setTimeout(() => { inspections.delete(id); reject(new Error('渲染诊断超时')) }, 5000)
    inspections.set(id, { resolve, reject, timer }); send({ kind: 'inspect', id, command })
  })
}

function receive(message) {
  if (!message || typeof message !== 'object') return
  // Newer revisions always win: a queued init for the previous preset used to
  // override a newer selection when the two messages arrived out of order.
  if (message.type === 'init' && typeof message.revision === 'number' && Number.isFinite(message.revision)) {
    if (message.revision < initRevision) return
    initRevision = message.revision
  } else if (message.type === 'params' && typeof message.revision === 'number' && Number.isFinite(message.revision)) {
    if (message.revision < paramsRevision) return
    paramsRevision = message.revision
  }
  if (message.type === 'init' && message.preset) {
    const key = JSON.stringify(message.preset)
    // A parent startup retry must not restart a project already stopped by the
    // watchdog/circuit breaker. A different project or re-enable makes it explicit.
    if (key === fingerprint && failed) return
    if (key === fingerprint && !failed) {
      if (lastInit) lastInit.params = { ...lastInit.params, ...message.params }
      if (pendingInit) pendingInit.params = { ...pendingInit.params, ...message.params }
      send({ kind: 'message', message: { type: 'params', params: message.params } }); return
    }
    fingerprint = key
    playbackSignature = ''
    pendingInit = { ...message, params: { ...lastInit?.params, ...message.params } }
    clearTimeout(initTimer)
    initTimer = setTimeout(() => {
      const next = pendingInit; pendingInit = null; lastInit = next
      // Cancel a previous compilation immediately; never queue N expensive
      // compilers when the preset selector is changed quickly.
      if (compiling || failed || !worker) start(next)
      else { compiling = true; heartbeat = performance.now(); jobStarted = heartbeat; send({ kind: 'message', message: next }) }
    }, 100)
    return
  }
  if (message.type === 'params' && message.params) {
    if (lastInit) lastInit.params = { ...lastInit.params, ...message.params }
    if (pendingInit) pendingInit.params = { ...pendingInit.params, ...message.params }
  }
  if (message.type === 'pause') {
    if (lastInit) lastInit.params = { ...lastInit.params, paused: !!message.paused }
    if (pendingInit) pendingInit.params = { ...pendingInit.params, paused: !!message.paused }
  }
  if (message.type === 'audio-resume') void audio?.resume().catch(() => {})
  send({ kind: 'message', message })
}

window.addEventListener('message', event => { if (event.source === parent && event.origin === location.origin) receive(event.data) })
window.addEventListener('resize', () => send({ kind: 'viewport', viewport: viewport() }))
new ResizeObserver(() => send({ kind: 'viewport', viewport: viewport() })).observe(document.body)
document.addEventListener('visibilitychange', () => {
  heartbeat = performance.now(); jobStarted = heartbeat; send({ kind: 'viewport', viewport: viewport() })
  if (document.hidden) void audio?.suspend().catch(() => {})
  else void audio?.resume().catch(() => {})
})
function checkWatchdog() {
  // Hidden pages may be frozen by Chromium. Start a new deadline when visible.
  if (document.hidden) { heartbeat = performance.now(); jobStarted = heartbeat; return }
  if (worker && compiling && performance.now() - jobStarted > (timeout === 12000 ? 30000 : timeout)) { stop('背景初始化超时，已停止渲染线程。请切换背景后重试。'); return }
  if (worker && performance.now() - heartbeat > (compiling && timeout === 12000 ? 30000 : timeout)) stop('背景长时间无响应，已终止渲染线程。可切换背景后重试；建议降低分辨率或简化循环。')
}
let watchdog = setInterval(checkWatchdog, 500)

if (standalone) {
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'keydown', 'keyup', 'blur']) {
    window.addEventListener(type, event => {
      if (type === 'pointerdown' || type === 'keydown') void audio?.resume().catch(() => {})
      const details = Object.fromEntries(['clientX', 'clientY', 'button', 'buttons', 'isPrimary', 'keyCode', 'repeat'].map(key => [key, event[key]]))
      send({ kind: 'event', type, event: details })
    }, { passive: true })
  }
}
window.addEventListener('pageshow', event => { if (event.persisted) { watchdog = setInterval(checkWatchdog, 500); start(lastInit) } })
window.addEventListener('pagehide', () => { clearTimeout(initTimer); clearInterval(watchdog); dispose() })
start()
