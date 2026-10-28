import { normalizeCode, sourceFor, loadBuiltin, parseDocument, BUFFER_IDS, renderSize } from './project.js'
import { createPipeline } from './pipeline.js'
/* ShaderSkin player — zero-dependency WebGL2 ShaderToy-compatible runtime (M2).
 * Runs standalone (dev) or inside the skin iframe (parent = plugin client half).
 * Protocol (postMessage, same origin only):
 *   in : {type:'init', preset:{id,name,code:{image,sound?}}, params}   // preset.image 旧写法兼容
 *        {type:'params', params} | {type:'mouse', mouse:[x,y,z,w]}
 *        {type:'theme', dark:boolean} | {type:'pause', paused:boolean} | {type:'reset'}
 *        {type:'audio-resume'}                                        // 手势后重试 resume()
 *   out: {type:'ready', preset, es3, sound} | {type:'error', stage, log}
 *        {type:'stats', fps, ms, w, h} | {type:'diag', text}
 *        {type:'audio', state:'none'|'running'|'suspended'|'error', sampleRate?, chunks?, reason?}
 * Audio: mainSound(t) -> 4096x1 RGBA8 (16-bit L/R) -> readPixels -> WebAudio
 * lookahead scheduling (400 ms ahead, 500 ms prebuffer, 120 ms timer).
 */
(() => {
  'use strict'

  const canvas = document.getElementById('c')
  const errBox = document.getElementById('err')
  const diagBox = document.getElementById('diag')
  const q = new URLSearchParams(location.search)
  const DEBUG_BG = q.get('debug') === 'bg'
  const STANDALONE = window.__standalone === true
  const PRESET = q.get('preset') || 'aurora'
  const EMBEDDED_FALLBACK = `void mainImage(out vec4 o, in vec2 p){
  vec2 uv = p / iResolution.xy;
  o = vec4(0.04 + 0.06*sin(uv.x*6.0 + iTime), 0.06 + 0.05*cos(uv.y*5.0 - iTime*0.7), 0.10, 1.0);
}`

  // ---------- params (client half sends these; standalone defaults are for preview)

  const params = {
    speed: 1,      // 0..2   image timeline multiplier (audio stays continuous)
    scale: 1,      // 0.5..2 render resolution multiplier
    blur: 0,       // 0..12  css blur px (only applied when > 0)
    fps: 30,       // 15..120 render-loop cap (battery vs smoothness)
    dim: 1,        // 0..2   brightness multiplier (readability slider)
    tintMix: 0,    // 0..1   mix toward tint colour (this is the "glass" veil)
    tint: '#ececec',
    paused: false,
    loop: true,
    loopMode: 'auto',
    loopSeconds: 20,    // 5..120 loop period
    audioMode: 'loop',  // 'loop' = music keeps playing | 'once' = stop after `audioSeconds`
    audioDurationMode: 'auto',
    audioSeconds: 60,   // 10..600 duration used by audioMode 'once'
    volume: 60,    // 0..100 mainSound output level
    muted: true,   // default muted; parent UI unmutes
  }
  const TINT = [0.925, 0.925, 0.925]

  // Set once the parent sends an explicit look (dim / tint / tintMix). The parent
  // derives it from the glass + brightness sliders; the per-theme defaults below
  // are only a preview fallback for a standalone player (no parent).
  let lookExplicit = false

  function clamp(v, lo, hi, fallback) {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback
  }

  function applyParams(next) {
    if (!next || typeof next !== 'object') return
    const resetProbe = ['loop', 'loopMode', 'speed', 'dim', 'tintMix', 'tint'].some(key => key in next && next[key] !== params[key])
    const wasPaused = params.paused
    const wasAudible = targetGain() > 0
    if ('speed' in next) params.speed = clamp(next.speed, 0, 2, 1)
    if ('scale' in next) params.scale = clamp(next.scale, 0.25, 2, 1)
    if ('blur' in next) params.blur = clamp(next.blur, 0, 12, 0)
    if ('fps' in next) params.fps = clamp(next.fps, 1, 120, 30)
    if ('dim' in next) { params.dim = clamp(next.dim, 0, 2, 1); lookExplicit = true }
    if ('tintMix' in next) { params.tintMix = clamp(next.tintMix, 0, 1, 0); lookExplicit = true }
    if ('loop' in next) params.loop = Boolean(next.loop)
    if (next.loopMode === 'auto' || next.loopMode === 'manual') params.loopMode = next.loopMode
    if ('loopSeconds' in next) params.loopSeconds = clamp(next.loopSeconds, 5, 120, 20)
    const previousAudioMode = params.audioMode
    const previousAudioSeconds = params.audioSeconds
    const previousDurationMode = params.audioDurationMode
    if (next.audioMode === 'loop' || next.audioMode === 'once') params.audioMode = next.audioMode
    if (next.audioDurationMode === 'auto' || next.audioDurationMode === 'manual') params.audioDurationMode = next.audioDurationMode
    if ('audioSeconds' in next) params.audioSeconds = clamp(next.audioSeconds, 1, 600, 60)
    const audioModeChanged = previousAudioMode !== params.audioMode || previousAudioSeconds !== params.audioSeconds || previousDurationMode !== params.audioDurationMode
    if ('volume' in next) params.volume = clamp(next.volume, 0, 100, 60)
    if ('muted' in next) params.muted = Boolean(next.muted)
    if (typeof next.tint === 'string' && /^#[0-9a-fA-F]{6}$/.test(next.tint)) {
      params.tint = next.tint
      lookExplicit = true
    }
    if (typeof next.paused === 'boolean') params.paused = next.paused
    frameInterval = 1000 / Math.max(1, params.fps)
    canvas.style.filter = params.blur > 0 ? `blur(${params.blur.toFixed(2)}px)` : ''
    if (params.blur > 0) canvas.style.willChange = 'filter'
    else canvas.style.removeProperty('will-change')
    for (let i = 0; i < 3; i++) TINT[i] = parseInt(params.tint.slice(1 + i * 2, 3 + i * 2), 16) / 255
    applyGain()
    if (wasPaused !== params.paused) {
      if (params.paused) stopAudioScheduler('paused')
      else if (audio.program && audio.ctx && audio.ctx.state === 'running') startAudioScheduler()
    }
    // Rebuild queued samples from the audible cursor, not the producer clock.
    // Otherwise a mode change can cut off the final lookahead or leak samples
    // beyond a newly shortened duration.
    const synthesisChanged = wasAudible !== (targetGain() > 0) && Number.isFinite(musicDuration())
    if ((audioModeChanged || synthesisChanged) && audio.program && audio.ctx) {
      stopAudioScheduler('reconfigure')
      if (audioLoopPeriod() > 0 && audio.time >= musicDuration()) audio.time = 0
      if (audio.ctx.state === 'running' && !params.paused) startAudioScheduler()
    }
    resize()
    if (resetProbe) resetDetection()
  }

  // ---------- diagnostics

  const diag = { stage: 'boot', note: '', gl: 'none', preset: PRESET, es3: null, w: 0, h: 0, frames: 0, fps: 0 }
  let audioStateLabel = 'none'
  function line() {
    const mode = DEBUG_BG ? 'debug-bg' : (program ? 'running' : 'idle')
    const note = diag.note ? ` · ${diag.note}` : ''
    return `${mode} · gl=${diag.gl} · ${es3 ? 'es3' : 'es1'} · ${canvas.width}x${canvas.height} · ${state.fps}fps · frames=${state.frame} · audio=${audioStateLabel} · look=${params.dim.toFixed(2)}/${params.tintMix.toFixed(2)} · loop=${params.loop ? params.loopMode === 'manual' ? `${params.loopSeconds.toFixed(0)}s` : `auto/${playback.duration || 'detecting'}` : 'off'} · music=${params.audioMode}/${Number.isFinite(musicDuration()) ? musicDuration().toFixed(1) + 's' : 'auto'} · shader=${diag.preset}${note}`
  }
  function refreshDiag() {
    diagBox.textContent = line()
    document.title = line().slice(0, 120)
  }
  function report(text) {
    diag.note = text
    refreshDiag()
    post({ type: 'diag', text })
  }
  const STAGE_TITLES = {
    context: 'WebGL2 不可用',
    compile: '着色器编译失败',
    preset: '背景加载失败',
    init: '初始化失败',
  }
  function fail(stage, log) {
    diag.stage = stage
    const text = `[shader-skin] ${stage} failed\n${log}`
    errBox.innerHTML = ''
    const head = document.createElement('b')
    head.textContent = `${STAGE_TITLES[stage] || stage}\n`
    errBox.append(head, document.createTextNode(log))
    // standalone: show the full-screen reader; embedded: never cover the app,
    // report to the shell so the settings panel can surface it instead
    if (STANDALONE) errBox.classList.add('open')
    report(text)
    post({ type: 'error', stage, log })
  }
  function post(message) {
    if (window.__send) { window.__send(message); return }
    if (STANDALONE) {
      // dev/test only: keep the last outbound messages inspectable without a parent
      if (window.__outbox) {
        window.__outbox.push(message)
        if (window.__outbox.length > 240) window.__outbox.shift()
      }
      return
    }
    try { parent.postMessage(message, location.origin) } catch { /* parent gone */ }
  }
  if (STANDALONE) window.__outbox = []

  // ---------- GL setup

  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: false,
    preserveDrawingBuffer: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: false,
  })
  if (!gl) { diag.gl = 'none'; fail('context', 'getContext("webgl2") 返回 null。请确认显卡驱动 / 是否被远程桌面禁用。'); return }
  diag.gl = 'webgl2'
  const viewportLimit = gl.getParameter(gl.MAX_VIEWPORT_DIMS)
  const maxRenderSide = Math.min(8192, gl.getParameter(gl.MAX_TEXTURE_SIZE), viewportLimit[0], viewportLimit[1])

  const VBO = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, VBO)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const blackTex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, blackTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]))
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)

  // ---------- GLSL preprocessing

  const UNIFORMS = [
    ['vec3', 'iResolution'], ['float', 'iTime'], ['float', 'iTimeDelta'], ['int', 'iFrame'],
    ['vec4', 'iMouse'], ['vec4', 'iDate'], ['float', 'iSampleRate'],
    ['sampler2D', 'iChannel0'], ['sampler2D', 'iChannel1'], ['sampler2D', 'iChannel2'], ['sampler2D', 'iChannel3'],
    ['float', 'iChannelTime[4]'], ['vec3', 'iChannelResolution[4]'],
  ]
  const OWN_UNIFORMS = [['float', 'uDim'], ['vec3', 'uTint'], ['float', 'uTintMix']]
  const KNOWN_EXTENSIONS = /^(GL_OES_standard_derivatives|GL_EXT_shader_texture_lod|GL_EXT_frag_depth|GL_EXT_shadow_samplers|GL_OES_EGL_image_external_essl3)$/

  function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, comment => comment.replace(/[^\n]/g, ' '))
  }

  // Split off directives that must live in the header; keep line count stable for error mapping.
  function splitDirectives(src) {
    const kept = []
    const lines = src.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim()
      if (/^#\s*version\b/.test(t)) { lines[i] = ''; continue }
      if (/^#\s*line\b/.test(t)) { lines[i] = ''; continue }
      const m = /^#\s*extension\s+([A-Za-z0-9_]+)\s*:\s*([A-Za-z0-9_]+)/.exec(t)
      if (m) {
        if (!KNOWN_EXTENSIONS.test(m[1])) kept.push(`#extension ${m[1]} : ${m[2]}`)
        lines[i] = ''
      }
    }
    return { body: lines.join('\n'), extensions: kept }
  }

  function rewriteLegacyEs3(src) {
    return src
      .replace(/\btexture2DProjLodEXT\b/g, 'textureProjLod')
      .replace(/\btexture2DProjGradEXT\b/g, 'textureProjGrad')
      .replace(/\btexture2DProj\b/g, 'textureProj')
      .replace(/\btexture2DLodEXT\b/g, 'textureLod')
      .replace(/\btexture2DGradEXT\b/g, 'textureGrad')
      .replace(/\btexture2DLod\b/g, 'textureLod')
      .replace(/\btexture2DGrad\b/g, 'textureGrad')
      .replace(/\btexture2D\b/g, 'texture')
      .replace(/\btextureCubeLodEXT\b/g, 'textureLod')
      .replace(/\btextureCubeLod\b/g, 'textureLod')
      .replace(/\btextureCube\b/g, 'texture')
      .replace(/\bvarying\b/g, 'in')
      .replace(/\bgl_FragColor\b/g, 'st_out')
  }

  /** Build a compilable fragment shader from ShaderToy-style source.
   *  kind 'image' -> wraps mainImage(); kind 'sound' -> wraps mainSound() and packs
   *  stereo samples into RGBA8 (16 bit per channel) for readPixels + WebAudio. */
  function assemble(rawSrc, es3, skip, kind = 'image', channels = []) {
    rawSrc = rawSrc.replace(/^\uFEFF/, '')
    const { body, extensions } = splitDirectives(rawSrc)
    let rewritten = es3 ? rewriteLegacyEs3(body) : body
    const analysis = stripComments(rewritten)
    const ownMain = /\bvoid\s+main\s*\(\s*(?:void\s*)?\)\s*\{/.exec(analysis)
    const ownOutput = es3 ? /\bout\s+(?:(?:lowp|mediump|highp)\s+)?vec4\s+([A-Za-z_]\w*)\s*;/.exec(analysis)?.[1] : null
    const target = es3 ? ownOutput || 'st_out' : /\bgl_FragData\s*\[/.test(analysis) ? 'gl_FragData[0]' : 'gl_FragColor'
    if (kind !== 'sound' && ownMain) {
      const index = ownMain.index + ownMain[0].indexOf('main')
      rewritten = rewritten.slice(0, index) + 'st_userMain' + rewritten.slice(index + 4)
    }

    const defines = new Set()
    for (const m of analysis.matchAll(/#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)/g)) defines.add(m[1])

    const has = name => new RegExp(`uniform\\s+(?:(?:lowp|mediump|highp)\\s+)?[A-Za-z0-9_]+\\s+${name.replace(/\[.*$/, '')}\\b`).test(analysis)

    const header = []
    if (es3) header.push('#version 300 es')
    for (const ext of extensions) header.push(ext)
    header.push('precision highp float;', 'precision highp int;')
    if (es3) header.push('precision highp sampler3D;')
    if (es3 && !ownOutput) header.push('out vec4 st_out;')
    for (const [type, name] of UNIFORMS) {
      const base = name.replace(/\[.*$/, '')
      if (has(name) || defines.has(base) || skip.has(name)) continue
      const samplerType = /^iChannel[0-3]$/.test(name) && channels[Number(name.slice(-1))] === 'noise3d' ? 'sampler3D' : type
      header.push(`uniform ${samplerType} ${name};`)
    }
    if (kind === 'image') for (const [type, name] of OWN_UNIFORMS) header.push(`uniform ${type} ${name};`)

    const tail = []
    if (kind !== 'sound') {
      if (ownMain) {
        tail.push(`void main(){`, `  ${target} = vec4(0.0, 0.0, 0.0, 1.0);`, `  st_userMain();`,
          ...(kind === 'image' ? [`  ${target}.rgb = mix(clamp(${target}.rgb, 0.0, 1.0) * uDim, uTint, uTintMix);`] : []), `}`)
      } else if (/\bmainImage\s*\(/.test(analysis)) {
        tail.push(
          `void main(){`,
          `  vec4 c = vec4(0.0, 0.0, 0.0, 1.0);`,
          `  mainImage(c, gl_FragCoord.xy);`,
          ...(kind === 'image' ? [`  c.rgb = mix(clamp(c.rgb, 0.0, 1.0) * uDim, uTint, uTintMix);`] : []),
          `  ${target} = c;`,
          `}`,
        )
      }
    } else {
      // 16-bit linear packing: R/G = hi/lo byte of L, B/A = hi/lo byte of R.
      // ShaderToy sound passes come in several signatures, all of them accepted:
      //   vec2 mainSound(float time)            stereo
      //   float mainSound(float time)           mono   (duplicated to both channels)
      //   vec2 mainSound(int samp, float time)  stereo + sample index (often unused)
      //   float mainSound(int samp, float time) mono   + sample index
      const signature = analyzeSoundSignature(analysis)
      const call = signature.args > 1 ? 'mainSound(st_samp, st_t)' : 'mainSound(st_t)'
      const sample = signature.ret === 'float'
        ? [`  float st_m = clamp(${call}, -1.0, 1.0);`, `  vec2 st_s = vec2(st_m, st_m);`]
        : [`  vec2 st_s = clamp(${call}, -1.0, 1.0);`]
      tail.push(
        `vec2 st_pack16(float v){`,
        `  float u = clamp(v * 0.5 + 0.5, 0.0, 1.0);`,
        `  float n = floor(u * 65535.0);`,
        `  return vec2(floor(n / 256.0), n - 256.0 * floor(n / 256.0)) / 255.0;`,
        `}`,
        `void main(){`,
        `  float st_t = iTime + (gl_FragCoord.x - 0.5) / iSampleRate;`,
        // absolute sample index, wrapped well below int overflow for very long runs
        `  int st_samp = int(floor(mod(st_t * iSampleRate, 2147483000.0)));`,
        ...sample,
        `  ${target} = vec4(st_pack16(st_s.x), st_pack16(st_s.y));`,
        `}`,
      )
    }
    const source = `${header.join('\n')}\n${rewritten}\n${tail.join('\n')}`
    return { source, headerLineCount: header.length }
  }

  /** Detect the return type and arity of a ShaderToy `mainSound` declaration. */
  function analyzeSoundSignature(code) {
    const match = /\b(vec2|float)\s+mainSound\s*\(([^)]*)\)/.exec(code)
    if (match === null) return { ret: 'vec2', args: 1 }
    const args = match[2].split(',').filter(part => part.trim() !== '').length
    return { ret: match[1], args }
  }

  const VS_ES3 = `#version 300 es\nin vec2 aPos;\nvoid main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`
  const VS_ES1 = `attribute vec2 aPos;\nvoid main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`

  function compileShader(type, source) {
    const sh = gl.createShader(type)
    gl.shaderSource(sh, source)
    gl.compileShader(sh)
    if (gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return { shader: sh }
    const log = gl.getShaderInfoLog(sh) || 'unknown compile error'
    gl.deleteShader(sh)
    return { error: log }
  }

  function tryLink(fragSource, es3) {
    const fs = compileShader(gl.FRAGMENT_SHADER, fragSource)
    if (fs.error) return { error: fs.error }
    const vs = compileShader(gl.VERTEX_SHADER, es3 ? VS_ES3 : VS_ES1)
    if (vs.error) { gl.deleteShader(fs.shader); return { error: vs.error } }
    const prog = gl.createProgram()
    gl.attachShader(prog, vs.shader)
    gl.attachShader(prog, fs.shader)
    gl.bindAttribLocation(prog, 0, 'aPos')
    gl.linkProgram(prog)
    gl.deleteShader(vs.shader)
    gl.deleteShader(fs.shader)
    if (gl.getProgramParameter(prog, gl.LINK_STATUS)) return { program: prog, es3 }
    const log = gl.getProgramInfoLog(prog) || 'unknown link error'
    gl.deleteProgram(prog)
    return { error: log }
  }

  function remapLog(log, headerLineCount) {
    return String(log).split('\n').map(line =>
      line.replace(/(\d+):(\d+)/g, (all, col, lineNo) => {
        const n = Number(lineNo) - headerLineCount
        return n >= 1 ? `${col}:${n}` : `${col}:${lineNo}-header`
      }),
    ).join('\n').trim()
  }

  let program = null
  let es3 = true
  let locs = Object.create(null)

  function buildProgram(rawSrc, channels = [], kind = 'image') {
    const skip = new Set()
    let lastError = ''
    for (let attempt = 0; attempt < 8; attempt++) {
      const { source, headerLineCount } = assemble(rawSrc, true, skip, kind, channels)
      const result = tryLink(source, true)
      if (result.program) return { program: result.program, es3: true, source }
      lastError = remapLog(result.error, headerLineCount)
      const redef = /redefinition of '([A-Za-z_][A-Za-z0-9_]*)'/.exec(result.error)
      if (redef && !skip.has(redef[1])) {
        const name = UNIFORMS.find(([, n]) => n.replace(/\[.*$/, '') === redef[1])
        if (name) { skip.add(name[1]); continue }
      }
      break
    }
    // Fallback: plain GLSL ES 1.00 (WebGL2 accepts both), original syntax untouched.
    if (q.get('noes1') === '1') return { error: lastError || 'unknown shader error' }
    const { source, headerLineCount } = assemble(rawSrc, false, new Set(), kind, channels)
    const result = tryLink(source, false)
    if (result.program) return { program: result.program, es3: false, source, note: 'es1-fallback' }
    const es1Error = remapLog(result.error, headerLineCount)
    return { error: lastError ? `[ES3]\n${lastError}\n\n[ES1]\n${es1Error}` : es1Error }
  }

  /** Sound pass: same preprocessing/fallback ladder, different wrapper. */
  function buildSoundProgram(rawSrc, channels = []) {
    if (!/\bmainSound\s*\(/.test(stripComments(rawSrc))) {
      return { error: 'sound 代码里没有 vec2 mainSound(float time)' }
    }
    const skip = new Set()
    let lastError = ''
    for (let attempt = 0; attempt < 8; attempt++) {
      const { source, headerLineCount } = assemble(rawSrc, true, skip, 'sound', channels)
      const result = tryLink(source, true)
      if (result.program) return { program: result.program, es3: true, source }
      lastError = remapLog(result.error, headerLineCount)
      const redef = /redefinition of '([A-Za-z_][A-Za-z0-9_]*)'/.exec(result.error)
      if (redef && !skip.has(redef[1])) {
        const name = UNIFORMS.find(([, n]) => n.replace(/\[.*$/, '') === redef[1])
        if (name) { skip.add(name[1]); continue }
      }
      break
    }
    const { source, headerLineCount } = assemble(rawSrc, false, new Set(), 'sound', channels)
    const result = tryLink(source, false)
    if (result.program) return { program: result.program, es3: false, source, note: 'es1-fallback' }
    const es1Error = remapLog(result.error, headerLineCount)
    return { error: lastError ? `[ES3]\n${lastError}\n\n[ES1]\n${es1Error}` : es1Error }
  }

  function collectLocations(targetProgram = program) {
    const map = Object.create(null)
    if (!targetProgram) return map
    for (const [, name] of [...UNIFORMS, ...OWN_UNIFORMS]) {
      const loc = gl.getUniformLocation(targetProgram, /\[/.test(name) ? `${name.replace(/\[.*$/, '')}[0]` : name)
      if (loc) map[name] = loc
    }
    return map
  }

  function set1(name, v) { const l = locs[name]; if (l) gl.uniform1f(l, v) }
  function set1i(name, v) { const l = locs[name]; if (l) gl.uniform1i(l, v) }
  function set2(name, a, b) { const l = locs[name]; if (l) gl.uniform2f(l, a, b) }
  function set3(name, a, b, c) { const l = locs[name]; if (l) gl.uniform3f(l, a, b, c) }
  function set4(name, a, b, c, d) { const l = locs[name]; if (l) gl.uniform4f(l, a, b, c, d) }

  // ---------- audio (M2): mainSound -> 4096x1 RGBA8 16-bit -> WebAudio lookahead
  //
  // mainSound(t) is evaluated one sample per pixel into a 4096x1 RGBA8 target:
  // R/G = high/low byte of the left sample, B/A = the right one. readPixels then
  // moves 16 KB per chunk (~92.9 ms at 44.1 kHz ≈ 10.8 syncs/s), which the
  // 400 ms lookahead + 500 ms prebuffer absorb. Scheduling runs on its own timer
  // so a hitching rAF can never starve the audio thread.

  const AUDIO_CHUNK = 4096
  const AUDIO_LOOKAHEAD = 0.4
  const AUDIO_PREBUFFER = 0.5
  const AUDIO_TICK_MS = 120
  const AUDIOPROBE = q.get('audioprobe') === '1'

  const audio = {
    ctx: null, gain: null, limiter: null,
    program: null, es3: true, locs: Object.create(null),
    tex: null, fbo: null,
    bytes: new Uint8Array(AUDIO_CHUNK * 4),
    left: new Float32Array(AUDIO_CHUNK),
    right: new Float32Array(AUDIO_CHUNK),
    sampleRate: 0, chunkSize: AUDIO_CHUNK,
    time: 0,               // shader time at the next chunk start
    chunks: 0,             // scheduled chunk count
    scheduledUntil: 0,     // ctx.currentTime of the next chunk start
    sources: new Map(), timer: 0, running: false,
    state: 'none', reason: '',
    peak: 0, rms: 0,
  }
  let pipeline = null
  let projectRequest = 0

  // GLSL has no ended event. Only recognize an explicit duration annotation or
  // the simple terminal fade idiom; arbitrary GLSL is never evaluated as JS.
  function sourceDuration(source, clock) {
    const hint = source.match(/^\s*\/\/\s*@duration\s+([\d.]+)\s*$/m)
    if (hint && Number(hint[1]) > 0 && Number(hint[1]) <= 86400) return Number(hint[1])
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
    const number = '(\\d+(?:\\.\\d*)?|\\.\\d+)'
    const re = new RegExp('1(?:\\.0*)?\\s*-\\s*smoothstep\\s*\\(\\s*' + number + '\\s*,\\s*' + number + '\\s*,\\s*' + clock + '\\s*\\)', 'g')
    const ends = [...code.matchAll(re)].filter(m => Number(m[2]) > Number(m[1]) && Number(m[2]) <= 86400).map(m => Number(m[2]))
    return ends.length ? Math.max(...ends) : 0
  }
  let soundDuration = 0
  let soundSeen = false
  let soundLastSignal = 0
  function musicDuration() { return params.audioDurationMode === 'manual' ? params.audioSeconds : soundDuration || Infinity }

  function targetGain() { return params.muted ? 0 : clamp(params.volume, 0, 100, 60) / 100 }

  function applyGain() {
    const value = targetGain()
    if (!audio.gain || !audio.ctx) return
    try { audio.gain.gain.setTargetAtTime(value, audio.ctx.currentTime, 0.02) } catch { audio.gain.gain.value = value }
  }

  function audioChunkSeconds() { return audio.chunkSize / (audio.sampleRate || 44100) }

  // The producer clock includes prebuffer/lookahead. Resume at the first
  // unplayed sample, including a loop seam, instead of skipping queued sound.
  function audibleMusicTime() {
    const now = audio.ctx?.currentTime ?? 0
    for (const { when, start, duration } of audio.sources.values()) {
      if (now < when + duration) return start + Math.max(0, now - when)
    }
    return audio.time
  }

  function publishAudio() {
    audioStateLabel = audio.program ? `${audio.state}/${audio.chunks}` : 'none'
    if (typeof window.__player !== 'object' || window.__player === null) window.__player = {}
    const p = window.__player
    p.ready = state.ready
    p.sound = !!audio.program
    p.es3 = es3
    p.preset = diag.preset
    p.frames = state.frame
    p.project = pipeline ? { buffers: [...pipeline.buffers.keys()], textures: [...pipeline.textures.keys()], ...pipeline.stats() } : null
    p.render = { fps: state.fps, submissionMs: state.drawMs, width: canvas.width, height: canvas.height }
    p.audio = {
      state: audio.state, sampleRate: audio.sampleRate, chunks: audio.chunks,
      chunkSize: audio.chunkSize, peak: audio.peak, rms: audio.rms, gain: targetGain(),
    }
    p.playback = { time: state.time, frame: state.frame, duration: playback.duration, repeats: playback.repeats, mode: params.loopMode, musicDuration: Number.isFinite(musicDuration()) ? musicDuration() : null, musicTime: audio.time, musicAudibleTime: audibleMusicTime() }
    if (AUDIOPROBE) window.__audioProbe = { peak: audio.peak, rms: audio.rms, chunks: audio.chunks }
    window.__snapshot?.(p, window.__audioProbe)
  }

  function setAudioState(next, reason) {
    if (audio.state === next && (reason ?? '') === audio.reason) return
    audio.state = next
    audio.reason = reason ?? ''
    const message = { type: 'audio', state: next }
    if (audio.sampleRate) message.sampleRate = audio.sampleRate
    if (next === 'running' || audio.chunks) message.chunks = audio.chunks
    if (reason) message.reason = reason
    post(message)
    publishAudio()
    refreshDiag()
  }

  function ensureAudioTarget() {
    if (audio.fbo) return true
    try {
      const tex = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, AUDIO_CHUNK, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      const fbo = gl.createFramebuffer()
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`0x${status.toString(16)}`)
      audio.tex = tex
      audio.fbo = fbo
      return true
    } catch (error) {
      setAudioState('error', `audio FBO: ${error.message}`)
      return false
    }
  }

  function ensureAudioContext() {
    if (audio.ctx) return true
    const Ctor = window.AudioContext || window.webkitAudioContext
    if (!Ctor) { setAudioState('error', 'AudioContext 不可用'); return false }
    let ctx = null
    try {
      ctx = new Ctor({ sampleRate: 44100, latencyHint: 'playback' })
    } catch {
      try { ctx = new Ctor({ latencyHint: 'playback' }) } catch (error) {
        setAudioState('error', `AudioContext 创建失败: ${error.message}`)
        return false
      }
    }
    audio.ctx = ctx
    audio.sampleRate = ctx.sampleRate || 44100
    audio.gain = ctx.createGain()
    audio.limiter = ctx.createDynamicsCompressor()
    audio.limiter.threshold.value = -6
    audio.limiter.knee.value = 0
    audio.limiter.ratio.value = 20
    audio.limiter.attack.value = 0.003
    audio.limiter.release.value = 0.25
    audio.gain.connect(audio.limiter)
    audio.limiter.connect(ctx.destination)
    audio.gain.gain.value = targetGain()
    ctx.onstatechange = () => {
      if (ctx.state === 'running') { if (audio.program) startAudioScheduler() }
      else if (audio.program) {
        stopAudioScheduler('context')
        setAudioState(ctx.state === 'suspended' ? 'suspended' : 'error', `context ${ctx.state}`)
      }
    }
    try { const p = ctx.resume(); if (p && typeof p.catch === 'function') p.catch(() => {}) } catch { /* blocked */ }
    // Autoplay policy may keep us suspended; that is a normal state, not an error.
    setAudioState(ctx.state === 'running' ? 'running' : 'suspended', ctx.state === 'running' ? '' : 'autoplay blocked')
    return true
  }

  /** Length of the music-loop seam fade, in seconds (keeps the repeat click-free). */
  const AUDIO_SEAM_FADE = 0.04

  /**
   * Loop period for the *music* timeline. ShaderToy sound passes are finite pieces
   * (they fade out and then stay silent), so "循环播放" cannot just keep feeding
   * t=60,70,… — it has to wrap the audio clock at the configured length.
   */
  function audioLoopPeriod() {
    const period = musicDuration()
    return params.audioMode === 'loop' && Number.isFinite(period) && period > 0 ? period : 0
  }

  /** Per-sample gain that fades the music in/out at the loop seam and at "stop". */
  function seamGain(time) {
    let gain = 1
    const period = audioLoopPeriod()
    if (period > 0) {
      if (time < AUDIO_SEAM_FADE) gain = Math.min(gain, Math.max(0, time) / AUDIO_SEAM_FADE)
      const left = period - time
      if (left < AUDIO_SEAM_FADE) gain = Math.min(gain, Math.max(0, left) / AUDIO_SEAM_FADE)
    } else if (params.audioMode === 'once') {
      const left = musicDuration() - time
      if (left < AUDIO_SEAM_FADE) gain = Math.min(gain, Math.max(0, left) / AUDIO_SEAM_FADE)
    }
    return gain
  }

  /**
   * Render one chunk that starts at `startTime` into the FBO and decode it into
   * audio.left/right. The caller owns the clock (`audio.time` is not advanced here),
   * so a chunk can be re-rendered at a wrapped time.
   */
  function renderAudioChunk(startTime, chunkSeconds) {
    if (!audio.program || !audio.sampleRate) return false
    // A known finite piece can keep its clock/looping while muted without
    // evaluating thousands of expensive vocal/synth samples that nobody hears.
    // Unknown durations still render so end-of-sound detection remains valid.
    if (targetGain() === 0 && Number.isFinite(musicDuration())) {
      audio.left.fill(0); audio.right.fill(0); audio.peak = 0; audio.rms = 0
      return true
    }
    if (!ensureAudioTarget()) return false
    const L = audio.locs
    const dither = gl.isEnabled(gl.DITHER)
    try {
      gl.disable(gl.DITHER) // byte packing must not be dithered like visual colour
      gl.bindFramebuffer(gl.FRAMEBUFFER, audio.fbo)
      gl.viewport(0, 0, AUDIO_CHUNK, 1)
      gl.useProgram(audio.program)
      gl.bindBuffer(gl.ARRAY_BUFFER, VBO)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
      for (let i = 0; i < 4; i++) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, blackTex) }
      if (L.iResolution) gl.uniform3f(L.iResolution, AUDIO_CHUNK, 1, 1)
      if (L.iTime) gl.uniform1f(L.iTime, startTime)
      if (L.iTimeDelta) gl.uniform1f(L.iTimeDelta, 0)
      if (L.iFrame) gl.uniform1i(L.iFrame, audio.chunks)
      if (L.iMouse) gl.uniform4f(L.iMouse, 0, 0, 0, 0)
      if (L.iDate) { const d = nowDate(); gl.uniform4f(L.iDate, d[0], d[1], d[2], d[3]) }
      if (L.iSampleRate) gl.uniform1f(L.iSampleRate, audio.sampleRate)
      for (let i = 0; i < 4; i++) if (L[`iChannel${i}`]) gl.uniform1i(L[`iChannel${i}`], i)
      if (L['iChannelResolution[4]']) gl.uniform3fv(L['iChannelResolution[4]'], zeroChannelResolution)
      if (L['iChannelTime[4]']) gl.uniform1fv(L['iChannelTime[4]'], zeroChannelTime)
      pipeline?.channels('sound', L, startTime)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.readPixels(0, 0, AUDIO_CHUNK, 1, gl.RGBA, gl.UNSIGNED_BYTE, audio.bytes)
    } catch (error) {
      setAudioState('error', `audio render: ${error.message}`)
      return false
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      if (dither) gl.enable(gl.DITHER)
    }
    const bytes = audio.bytes
    const perSample = chunkSeconds / AUDIO_CHUNK
    let peak = 0
    let sum = 0
    for (let i = 0; i < AUDIO_CHUNK; i++) {
      const time = startTime + i * perSample
      const gain = seamGain(time)
      const l = ((((bytes[i * 4] << 8) | bytes[i * 4 + 1]) / 65535) * 2 - 1) * gain
      const r = ((((bytes[i * 4 + 2] << 8) | bytes[i * 4 + 3]) / 65535) * 2 - 1) * gain
      audio.left[i] = l
      audio.right[i] = r
      const al = l < 0 ? -l : l
      const ar = r < 0 ? -r : r
      if (al > peak) peak = al
      if (ar > peak) peak = ar
      sum += l * l + r * r
    }
    audio.peak = peak
    audio.rms = Math.sqrt(sum / (AUDIO_CHUNK * 2))
    if (AUDIOPROBE) window.__audioProbe = { peak, rms: audio.rms, chunks: audio.chunks }
    return true
  }

  function scheduleAudioChunk(when) {
    const ctx = audio.ctx
    if (!ctx || !audio.gain) return false
    const chunkSeconds = audioChunkSeconds()
    const period = audioLoopPeriod()
    let start = audio.time
    if (period > 0 && start >= period) start = start % period
    let duration = musicDuration()
    if (params.audioMode === 'once' && start >= duration) return false
    if (!renderAudioChunk(start, chunkSeconds)) return abortAudioScheduler(audio.reason)
    if (params.audioDurationMode === 'auto' && !soundDuration) {
      // The encoded zero level has ~1/65535 quantization noise. Detect the raw
      // sound before the user's mute/volume gain; those must never end a song.
      for (let i = 0; i < AUDIO_CHUNK; i++) {
        if (Math.max(Math.abs(audio.left[i]), Math.abs(audio.right[i])) > 0.0002) {
          soundSeen = true
          soundLastSignal = start + i / audio.sampleRate
        }
      }
      if (soundSeen && start + chunkSeconds - soundLastSignal >= 3) {
        soundDuration = soundLastSignal + 0.1
        if (params.audioMode === 'once') return false
        // Detection includes a silence window; it is not part of the piece.
        // Start at sample zero, not silenceTime % the newly learned duration.
        start = 0
        duration = musicDuration()
        if (!renderAudioChunk(start, chunkSeconds)) return abortAudioScheduler(audio.reason)
      }
    }
    // The speed control belongs to the image timeline. Sound chunks must remain
    // contiguous; scaling only chunk starts creates gaps, repeats and clicks.
    audio.time = start + chunkSeconds
    try {
      // Do not schedule a chunk beyond the exact boundary (or skip the first
      // samples after wrapping). This also keeps once mode from leaking notes.
      const count = Number.isFinite(duration) ? Math.min(AUDIO_CHUNK, Math.max(1, Math.round((duration - start) * audio.sampleRate))) : AUDIO_CHUNK
      audio.time = start + count / audio.sampleRate
      const buffer = ctx.createBuffer(2, count, audio.sampleRate)
      buffer.copyToChannel(audio.left.subarray(0, count), 0)
      buffer.copyToChannel(audio.right.subarray(0, count), 1)
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(audio.gain)
      source.onended = () => audio.sources.delete(source)
      source.start(when)
      audio.sources.set(source, { when, start, duration: count / audio.sampleRate })
      audio.chunks++
      audio.scheduledUntil = when + count / audio.sampleRate
      return true
    } catch (error) {
      return abortAudioScheduler(`audio schedule: ${error.message}`)
    }
  }

  function abortAudioScheduler(reason) {
    stopAudioScheduler('error')
    setAudioState('error', reason)
    return false
  }

  function startAudioScheduler() {
    if (!audio.program || !audio.ctx || audio.ctx.state !== 'running' || audio.running) return
    if (params.paused || document.hidden || gl.isContextLost()) return
    // "music plays once": never resurrect the scheduler after the duration ran out
    if (params.audioMode === 'once' && audio.time >= musicDuration()) {
      setAudioState('ended', 'music played once')
      return
    }
    // music loop: switching modes (or shortening the length) may leave the clock
    // past the new seam — restart the piece instead of playing silence forever
    const period = audioLoopPeriod()
    if (period > 0 && audio.time >= period) audio.time = audio.time % period
    audio.running = true
    const startAt = audio.ctx.currentTime + AUDIO_PREBUFFER
    audio.scheduledUntil = startAt
    // fill prebuffer + lookahead up front: one slow frame must not starve playback
    for (let i = 0; i < 16 && audio.scheduledUntil < startAt + AUDIO_LOOKAHEAD; i++) {
      if (!scheduleAudioChunk(audio.scheduledUntil)) break
    }
    if (audio.state !== 'error') setAudioState('running')
    if (audio.running) audio.timer = setInterval(tickAudio, AUDIO_TICK_MS)
    publishAudio()
  }

  function stopAudioScheduler(reason) {
    if (!['switch', 'reset', 'once'].includes(reason)) audio.time = audibleMusicTime()
    if (audio.timer) { clearInterval(audio.timer); audio.timer = 0 }
    audio.running = false
    for (const source of audio.sources.keys()) {
      try { source.onended = null; source.stop() } catch { /* already stopped */ }
      try { source.disconnect() } catch { /* noop */ }
    }
    audio.sources.clear()
    audio.scheduledUntil = 0
    if (audio.program && reason !== 'switch' && reason !== 'reset' && reason !== 'once') {
      setAudioState('suspended', reason)
    }
    publishAudio()
  }

  function tickAudio() {
    const ctx = audio.ctx
    if (!ctx || !audio.program || audio.running !== true) return
    if (params.paused || document.hidden) { stopAudioScheduler('paused'); return }
    if (ctx.state !== 'running') { stopAudioScheduler('context'); return }
    // music-once: the timeline passed the configured duration → stop for good
    if (params.audioMode === 'once' && audio.time >= musicDuration()) {
      // The producer's clock includes the lookahead buffer. Drain it before
      // stopping, otherwise the final scheduled notes are cut off early.
      if (ctx.currentTime >= audio.scheduledUntil) {
        stopAudioScheduler('once')
        setAudioState('ended', 'music played once')
      }
      return
    }
    if (audio.scheduledUntil < ctx.currentTime - 0.05) audio.scheduledUntil = ctx.currentTime + 0.15 // underrun: skip ahead
    for (let i = 0; i < 16 && audio.scheduledUntil < ctx.currentTime + AUDIO_LOOKAHEAD; i++) {
      if (!scheduleAudioChunk(audio.scheduledUntil)) return
    }
    publishAudio()
  }

  function stopAudio() {
    stopAudioScheduler('switch')
    audio.time = 0
    audio.chunks = 0
    audio.scheduledUntil = 0
    audio.peak = 0
    audio.rms = 0
    if (audio.program) { try { gl.deleteProgram(audio.program) } catch { /* noop */ } }
    audio.program = null
    audio.locs = Object.create(null)
    publishAudio()
  }

  /** Install (or clear) the sound pass. Never fails the image pass. */
  function setSound(source) {
    stopAudio()
    soundDuration = sourceDuration(typeof source === 'string' ? source : '', '(?:time|t)')
    soundSeen = false
    soundLastSignal = 0
    if (typeof source !== 'string' || !source.trim()) { setAudioState('none'); publishAudio(); return false }
    const built = buildSoundProgram(source, pipeline?.code.channels?.sound)
    if (!built.program) {
      const detail = String(built.error).split('\n').filter(line => line.trim() !== '').slice(0, 3).join(' · ')
      console.warn('[shader-skin] sound compile error', built.error)
      report(`sound disabled · ${detail.slice(0, 220)}`)
      setAudioState('error', `sound compile failed · ${detail.split('·').pop()?.trim().slice(0, 120) ?? ''}`)
      publishAudio()
      return false
    }
    audio.program = built.program
    audio.es3 = built.es3
    audio.locs = collectLocations(built.program)
    audio.time = 0
    audio.chunks = 0
    report(`sound ready · ${built.es3 ? 'es3' : 'es1'}`)
    if (ensureAudioContext()) {
      applyGain()
      if (audio.ctx.state === 'running') startAudioScheduler()
      else setAudioState('suspended', 'autoplay blocked')
    }
    publishAudio()
    return true
  }

  async function resumeAudio() {
    if (!audio.program) return
    if (!ensureAudioContext()) return
    try { await audio.ctx.resume() } catch { /* still blocked */ }
    if (audio.ctx.state === 'running') startAudioScheduler()
    else setAudioState('suspended', 'autoplay blocked')
    publishAudio()
  }

  // ---------- state

  if (STANDALONE) window.__audioInternals = audio

  const state = { time: 0, dt: 0, frame: 0, last: 0, drawMs: 0, fps: 0, fpsAcc: 0, fpsFrames: 0, ready: false, pendingSound: false }
  const playback = { duration: 0, repeats: 0, lastProbe: 0, stableSince: 0, motion: 0, sample: null, fbo: null, tex: null, bytes: new Uint8Array(16 * 16 * 4) }
  function resetDetection() {
    playback.lastProbe = 0
    playback.stableSince = state.time
    playback.motion = 0
    playback.sample = null
  }
  function replayImage(period = 0) {
    state.time = period > 0 ? state.time % period : 0
    state.frame = 0
    state.dt = 0
    playback.repeats++
    resetDetection()
    pipeline?.clear()
  }
  function detectImageEnd(now) {
    if (!params.loop || params.loopMode !== 'auto' || playback.duration || params.speed === 0 || !program) return
    if (mouse.down) { resetDetection(); return }
    if (now - playback.lastProbe < 500) return
    playback.lastProbe = now
    if (!playback.fbo) {
      playback.tex = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, playback.tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 16, 16, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      playback.fbo = gl.createFramebuffer()
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, playback.fbo)
      gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, playback.tex, 0)
      if (gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        return
      }
    }
    // Downsample the rendered frame on GPU. Read only 1 KB twice a second;
    // no full-resolution readback and no second shader render.
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null)
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, playback.fbo)
    gl.blitFramebuffer(0, 0, canvas.width, canvas.height, 0, 0, 16, 16, gl.COLOR_BUFFER_BIT, gl.NEAREST)
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, playback.fbo)
    gl.readPixels(0, 0, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, playback.bytes)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    let delta = 0
    if (playback.sample) for (let i = 0; i < playback.bytes.length; i++) delta = Math.max(delta, Math.abs(playback.sample[i] - playback.bytes[i]))
    if (!playback.sample || delta > 2) {
      if (playback.sample) playback.motion++
      playback.sample = playback.bytes.slice()
      playback.stableSince = state.time
    } else if (playback.motion >= 3 && state.time >= 8 && state.time - playback.stableSince >= 5) {
      // A still image from startup is not an ended animation. Require observed
      // motion, then five shader-seconds of stability against the same baseline.
      playback.duration = playback.stableSince + 0.5
      replayImage()
    }
  }
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault()
    params.paused = true
    stopAudioScheduler('context lost')
    fail('context', '图形上下文丢失，恢复后将自动重新载入。')
  })
  canvas.addEventListener('webglcontextrestored', () => post({ type: 'context-restored' }))
  const zeroChannelResolution = new Float32Array(12)
  const zeroChannelTime = new Float32Array(4)
  const mouse = { x: 0, y: 0, cx: 0, cy: 0, down: false, anchorX: 0, anchorY: 0 }

  function resize() {
    if (gl.isContextLost()) return
    try {
      const { width: w, height: h } = renderSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight, window.devicePixelRatio, params.scale, maxRenderSide)
      if (w !== canvas.width || h !== canvas.height) { canvas.width = w; canvas.height = h; resetDetection() }
      if (pipeline?.resize(w, h)) state.frame = 0
      diag.w = canvas.width
      diag.h = canvas.height
    } catch (error) {
      // A failed (re)allocation must not break the frame loop or the message
      // handlers that call resize(); keep the last good size and report once.
      report(`render size unavailable · ${error.message}`)
    }
  }

  function nowDate() {
    const d = new Date()
    return [
      d.getFullYear(), d.getMonth(), d.getDate(),
      d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000,
    ]
  }

  function drawPass(targetProgram, locations, fbo, width, height, role) {
    const previousLocations = locs
    locs = locations
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.viewport(0, 0, width, height)
    gl.useProgram(targetProgram)
    gl.bindBuffer(gl.ARRAY_BUFFER, VBO)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    for (let i = 0; i < 4; i++) {
      gl.activeTexture(gl.TEXTURE0 + i)
      gl.bindTexture(gl.TEXTURE_2D, blackTex)
    }
    set3('iResolution', width, height, 1)
    set1('iTime', state.time); set1('iTimeDelta', state.dt); set1i('iFrame', state.frame)
    for (let i = 0; i < 4; i++) set1i(`iChannel${i}`, i)
    const sx = width / canvas.width, sy = height / canvas.height
    set4('iMouse', mouse.x * sx, mouse.y * sy, (mouse.down ? mouse.anchorX : -Math.abs(mouse.anchorX)) * sx, (mouse.down ? mouse.anchorY : -Math.abs(mouse.anchorY)) * sy)
    const date = nowDate()
    set4('iDate', ...date)
    set1('iSampleRate', audio.sampleRate || 44100)
    if (locs['iChannelResolution[4]']) gl.uniform3fv(locs['iChannelResolution[4]'], zeroChannelResolution)
    if (locs['iChannelTime[4]']) gl.uniform1fv(locs['iChannelTime[4]'], zeroChannelTime)
    pipeline?.channels(role, locs, state.time)
    set1('uDim', role === 'image' ? params.dim : 1)
    set3('uTint', ...TINT)
    set1('uTintMix', role === 'image' ? params.tintMix : 0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    locs = previousLocations
  }

  function draw() {
    if (DEBUG_BG) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(1, 0, 1, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
      return
    }
    if (!program) return
    const t0 = performance.now()
    pipeline?.render(state.time, drawPass)
    drawPass(program, locs, null, canvas.width, canvas.height, 'image')
    pipeline?.endFrame()
    state.drawMs = state.drawMs * 0.9 + (performance.now() - t0) * 0.1
  }

  let frameInterval = 1000 / Math.max(1, params.fps)
  let lastFrameStamp = 0

  // Diagnostic reads execute inside the rendering worker, immediately after draw.
  const inspections = []
  window.__inspectRenderer = (command, reply) => {
    if (command === 'lose-context') {
      const ext = gl.getExtension('WEBGL_lose_context')
      if (!ext) return reply(null, 'WEBGL_lose_context unavailable')
      ext.loseContext(); setTimeout(() => ext.restoreContext(), 150); reply(true); return
    }
    if (command === 'look') { reply(program ? [...gl.getUniform(program, gl.getUniformLocation(program, 'uTint'))] : null); return }
    if (command === 'pixel') { inspections.push(reply); return }
    reply(null, 'Unknown inspection')
  }
  function flushInspections() {
    if (!inspections.length) return
    const bytes = new Uint8Array(4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
    for (const reply of inspections.splice(0)) reply([...bytes])
  }

  function frame(now) {
    requestAnimationFrame(frame)
    if (params.paused || document.hidden) { state.last = now; return }
    if (now - lastFrameStamp < frameInterval - 1) return
    const dt = state.last ? Math.min((now - state.last) / 1000, 1) : 0
    lastFrameStamp = now
    state.last = now
    state.dt = dt * Math.max(params.speed, 0)
    state.time += state.dt
    // Loop mode: shaders that animate once (and then sit still) replay from 0.
    // Audio keeps its own realtime timeline, so looping is image-only.
    const period = params.loopMode === 'manual' ? params.loopSeconds : playback.duration
    if (params.loop && period > 0 && state.time >= period) {
      replayImage(period)
    }
    draw()
    flushInspections()
    detectImageEnd(now)
    state.frame++
    diag.frames = state.frame
    state.fpsFrames++
    state.fpsAcc += dt
    if (state.fpsAcc >= 0.5) {
      state.fps = Math.round(state.fpsFrames / state.fpsAcc)
      state.fpsAcc = 0
      state.fpsFrames = 0
      diag.fps = state.fps
      refreshDiag()
      publishAudio()
      if (state.ready) post({ type: 'stats', fps: state.fps, ms: Math.round(state.drawMs * 100) / 100, w: canvas.width, h: canvas.height })
    }
    if (!state.ready && program && !state.pendingSound) {
      state.ready = true
      post({ type: 'ready', preset: diag.preset, es3, sound: !!audio.program })
      publishAudio()
    }
  }

  // ---------- shader loading

  function setShader(source, presetName, channels = []) {
    const built = buildProgram(source, channels)
    if (!built.program) {
      fail('compile', built.error)
      return false
    }
    if (audio.program) stopAudio()
    if (program) gl.deleteProgram(program)
    program = built.program
    es3 = built.es3
    diag.es3 = es3
    diag.preset = presetName || diag.preset
    diag.stage = 'running'
    errBox.classList.remove('open')
    errBox.textContent = ''
    state.time = STANDALONE ? clamp(q.get('time') ?? 0, 0, 86400, 0) : 0
    state.frame = 0
    state.last = 0
    playback.duration = sourceDuration(source, 'iTime')
    playback.repeats = 0
    resetDetection()
    state.ready = false
    locs = collectLocations()
    report(`running · ${es3 ? 'es3' : 'es1'} · shader=${diag.preset}`)
    return true
  }

  async function setProject(rawCode, name) {
    const request = ++projectRequest
    state.pendingSound = true
    let candidate
    try {
      const code = normalizeCode(rawCode)
      candidate = await createPipeline(gl, code, (source, id) => {
        const built = buildProgram(source, code.channels?.[id], 'buffer')
        if (built.program) built.locs = collectLocations(built.program)
        return built
      })
      if (request !== projectRequest) { candidate.dispose(); return false }
      candidate.resize(canvas.width, canvas.height)
      if (!setShader(sourceFor(code, 'image'), name, code.channels?.image)) { candidate.dispose(); return false }
      pipeline?.dispose()
      pipeline = candidate
      setSound(sourceFor(code, 'sound'))
      return true
    } catch (error) {
      candidate?.dispose()
      if (request === projectRequest) fail('init', error.message)
      return false
    } finally { if (request === projectRequest) { state.pendingSound = false; publishAudio() } }
  }

  async function fetchText(url) {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) throw new Error(`${response.status} ${url}`)
    return response.text()
  }

  async function loadPreset(id) {
    // dev/preview path: `?preset=local/seascape.glsl` reads a user preset straight
    // from $DSH_HOME/shader-skin/presets (served by the Host / dev server at /local/)
    if (id.startsWith('local/')) {
      const file = id.slice('local/'.length)
      const text = await fetchText(`local/${file}`)
      const code = /\.json$/i.test(file) ? parseDocument(text) : { image: text, sound: /\bmainSound\s*\(/.test(text) ? text : undefined }
      return { entry: { id, name: code?.name || file.replace(/\.[^.]+$/, '') }, code }
    }
    let list = []
    try { list = await (await fetch('presets/index.json', { cache: 'no-store' })).json() } catch { /* manifest optional */ }
    const hit = Array.isArray(list) ? list.find(item => item.id === id) : undefined
    if (hit) {
      return { entry: hit, code: await loadBuiltin(hit, file => fetchText(`presets/${file}`)) }
    }
    // unknown id: try presets/<id>.glsl directly (dev fixtures), otherwise the first manifest entry
    try { return { entry: { id, name: id }, code: { image: await fetchText(`presets/${id}.glsl`), sound: await fetchText(`presets/${id}-sound.glsl`).catch(() => undefined) } } } catch { /* not a fixture */ }
    const first = Array.isArray(list) ? list[0] : undefined
    if (first) throw new Error(`preset "${id}" not found (manifest has ${list.length} entries)`)
    throw new Error(`preset "${id}" not found and presets/index.json is unavailable`)
  }

  // ---------- events

  function toPixels(clientX, clientY) {
    const rect = canvas.getBoundingClientRect()
    const sx = canvas.width / Math.max(rect.width, 1)
    const sy = canvas.height / Math.max(rect.height, 1)
    return [clientX * sx, (rect.height - (clientY - rect.top)) * sy]
  }

  function bindPointer() {
    const move = event => {
      if (!mouse.down || !(event.buttons & 1)) { mouse.down = false; return }
      const [x, y] = toPixels(event.clientX, event.clientY)
      mouse.x = x; mouse.y = y
    }
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.isPrimary === false) return
      const [x, y] = toPixels(event.clientX, event.clientY)
      mouse.x = x; mouse.y = y; mouse.anchorX = Math.max(0.001, x); mouse.anchorY = Math.max(0.001, y); mouse.down = true
    }, { passive: true })
    window.addEventListener('pointerup', () => { mouse.down = false }, { passive: true })
    window.addEventListener('pointercancel', () => { mouse.down = false }, { passive: true })
    window.addEventListener('blur', () => { mouse.down = false })
  }

  window.addEventListener('resize', resize)
  if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(document.body)
  document.addEventListener('visibilitychange', () => {
    state.last = 0
    if (document.hidden) stopAudioScheduler('hidden')
    else if (audio.program && !params.paused && audio.ctx && audio.ctx.state === 'running') startAudioScheduler()
  })

  {
    window.addEventListener('message', event => {
      if (event.origin !== location.origin || event.source !== parent) return
      const message = event.data
      if (!message || typeof message !== 'object') return
      switch (message.type) {
        case 'init': {
          if (message.params) applyParams(message.params)
          if (message.preset) {
            const preset = message.preset
            const image = preset.code?.image ?? preset.image
            if (typeof image === 'string' && image.trim()) {
              void setProject(preset.code ?? { image }, preset.name || preset.id)
            } else {
              fail('init', 'init 消息里没有 image 代码')
            }
          }
          break
        }
        case 'params': applyParams(message.params); break
        case 'mouse':
          if (Array.isArray(message.mouse) && message.mouse.length === 4) {
            // parent sends CSS-pixel viewport coords (origin bottom-left); scale to the drawing buffer
            const sx = canvas.width / Math.max(window.innerWidth, 1)
            const sy = canvas.height / Math.max(window.innerHeight, 1)
            mouse.x = (Number(message.mouse[0]) || 0) * sx
            mouse.y = (Number(message.mouse[1]) || 0) * sy
            mouse.down = Number(message.mouse[2]) > 0
            mouse.anchorX = Math.abs(Number(message.mouse[2])) * sx || 0
            mouse.anchorY = Math.abs(Number(message.mouse[3])) * sy || 0
          }
          break
        case 'theme':
          // When the parent sends an explicit look (it always does once a settings
          // surface has talked to it), the theme flip must not reset the sliders.
          if (!lookExplicit) {
            // standalone preview: per-theme readability defaults
            if (message.dark === false) { params.dim = 0.9; params.tintMix = 0.5 }
            else { params.dim = 1; params.tintMix = 0 }
          }
          applyParams({})
          break
        case 'pause':
          params.paused = Boolean(message.paused)
          if (params.paused) stopAudioScheduler('paused')
          else if (audio.program && audio.ctx && audio.ctx.state === 'running') startAudioScheduler()
          break
        case 'reset':
          state.time = 0
          state.frame = 0
          state.last = 0
          resetDetection()
          pipeline?.clear()
          if (audio.program) {
            stopAudioScheduler('reset')
            audio.time = 0
            audio.chunks = 0
            if (!params.paused && audio.ctx && audio.ctx.state === 'running') startAudioScheduler()
          }
          break
        case 'audio-resume': void resumeAudio(); break
        default: break
      }
    })
  }
  if (STANDALONE) {
    bindPointer()
    window.addEventListener('pointerdown', () => { if (audio.state === 'suspended') void resumeAudio() }, { passive: true })
    window.addEventListener('keydown', event => { if (!event.repeat) pipeline?.key(event.keyCode, true); if (audio.state === 'suspended') void resumeAudio() })
    window.addEventListener('keyup', event => pipeline?.key(event.keyCode, false))
    window.addEventListener('blur', () => pipeline?.releaseKeys())
  }

  // ---------- boot

  // dev conveniences: ?dim= .9 &scale= .75 &speed= .5 &blur= 4 &fps= 60 &tintMix= .3
  //                   &tint= 090c10 &volume= 70 &muted= 0 &loop= 1 &loopSeconds= 12
  //                   &audioMode= once &audioSeconds= 2
  const overrides = {}
  for (const key of ['dim', 'scale', 'speed', 'blur', 'fps', 'tintMix', 'volume', 'loopSeconds', 'audioSeconds']) {
    if (q.has(key)) overrides[key] = Number(q.get(key))
  }
  if (q.has('loop')) overrides.loop = q.get('loop') !== '0'
  if (q.has('loopSeconds')) overrides.loopMode = 'manual'
  if (q.has('audioSeconds')) overrides.audioDurationMode = 'manual'
  if (q.get('loopMode') === 'auto') overrides.loopMode = 'auto'
  if (q.get('audioDurationMode') === 'auto') overrides.audioDurationMode = 'auto'
  if (q.get('audioMode') === 'once' || q.get('audioMode') === 'loop') overrides.audioMode = q.get('audioMode')
  if (q.has('tint')) {
    const tint = q.get('tint').trim().replace(/^#/, '')
    if (/^[0-9a-fA-F]{6}$/.test(tint)) overrides.tint = `#${tint}`
  }
  if (q.has('muted')) overrides.muted = q.get('muted') !== '0'
  applyParams(params)
  applyParams(overrides)
  resize()
  report('boot · gl=webgl2')

  if (DEBUG_BG) {
    requestAnimationFrame(frame)
    return
  }

  if (STANDALONE && window.__autoboot) {
    // Ready waits for the optional sound probe: presets/<id>-sound.glsl (404 = no sound)
    // or a manifest `soundFile` entry. presets/index.json itself is never modified.
    state.pendingSound = true
    loadPreset(PRESET)
      .then(async ({ entry, code }) => {
        await setProject(code, entry.name || entry.id)
        state.pendingSound = false
        publishAudio()
      })
      .catch(error => {
        const message = error && error.message ? error.message : String(error)
        setShader(EMBEDDED_FALLBACK, 'embedded-fallback')
        fail('preset', `${message}\n\n已回退到内置占位 shader。`)
        setSound(null)
        state.pendingSound = false
        publishAudio()
      })
  } else {
    report('boot · waiting for parent init')
  }

  requestAnimationFrame(frame)
})()
