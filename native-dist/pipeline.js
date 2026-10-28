import { BUFFER_IDS, sourceFor } from './project.js'
import { makeTextureSource } from './textures.js'

/** @typedef {ReturnType<typeof import('./project.js').normalizeCode>} ShaderCode */
/** @typedef {{ tex: WebGLTexture, fbo: WebGLFramebuffer }} Target */
/** @typedef {{ program: WebGLProgram, locs: Record<string, WebGLUniformLocation | null>, front: number, time: number, half: boolean, nearest: boolean, mipmaps: boolean, targets: Target[] }} BufferPass */
/** @typedef {{ tex: WebGLTexture, type: number, width: number, height: number, depth: number, data?: Uint8Array, time?: number }} TextureRef */
/** @typedef {Awaited<ReturnType<typeof import('./textures.js').makeTextureSource>>} TextureSource */
/** @typedef {{ id: string, format: 'float16' | 'float32', mipmaps: boolean, filter: 'nearest' | 'linear' }} PassStats */
/** @typedef {{ width: number, height: number, bufferBytes: number, passes: PassStats[] }} PipelineStats */
/** @typedef {(program: WebGLProgram, locations: Record<string, WebGLUniformLocation | null>, fbo: WebGLFramebuffer | null, width: number, height: number, role: string) => void} DrawPass */
/** @typedef {(source: string, id: string) => { program?: WebGLProgram | null, locs?: Record<string, WebGLUniformLocation | null>, error?: string }} CompileFn */
/** @typedef {object} Pipeline
 * @property {ShaderCode} code
 * @property {Map<string, BufferPass>} buffers
 * @property {Map<string, TextureRef>} textures
 * @property {() => PipelineStats} stats
 * @property {(w: number, h: number) => boolean} resize
 * @property {() => void} clear
 * @property {(role: string, locations: Record<string, WebGLUniformLocation | null>, time: number) => void} channels
 * @property {(time: number, draw: DrawPass) => void} render
 * @property {() => void} endFrame
 * @property {(code: number, down: boolean) => void} key
 * @property {() => void} releaseKeys
 * @property {() => void} dispose
 */

/**
 * @param {WebGL2RenderingContext} gl
 * @param {ShaderCode} code
 * @param {CompileFn} compile
 * @returns {Promise<Pipeline>}
 */
export async function createPipeline(gl, code, compile) {
  /** @type {Map<string, BufferPass>} */
  const buffers = new Map()
  /** @type {Map<string, TextureRef>} */
  const textures = new Map()
  const floating = !!gl.getExtension('EXT_color_buffer_float')
  const linear = !!gl.getExtension('OES_texture_float_linear')
  const dimensions = new Float32Array(12), times = new Float32Array(4)
  let width = 0, height = 0, keyboardDirty = false, keyboardPressed = false

  /** Bytes retained per pixel for one target, mip levels included. */
  function bytesPerTarget() {
    return [...buffers.values()].reduce((sum, pass) => sum + (pass.half ? 8 : 16) * (pass.mipmaps ? 4 / 3 : 1), 0)
  }

  /** @returns {PipelineStats} */
  function stats() {
    /** @type {PassStats[]} */
    const passes = []
    for (const [id, pass] of buffers) {
      passes.push({ id, format: pass.half ? 'float16' : 'float32', mipmaps: pass.mipmaps, filter: pass.nearest ? 'nearest' : 'linear' })
    }
    return { width, height, bufferBytes: width * height * 2 * bytesPerTarget(), passes }
  }

  /** @param {number} w @param {number} h @returns {boolean} */
  function resize(w, h) {
    // Two float RGBA targets per pass, with mip levels. Bound total retained
    // buffer memory instead of allocating gigabytes on a large/high-DPI screen.
    const scale = Math.min(1, Math.sqrt(96 * 1024 * 1024 / Math.max(1, 2 * bytesPerTarget() * w * h)))
    const nextW = Math.max(1, Math.floor(w * scale)), nextH = Math.max(1, Math.floor(h * scale))
    if (width === nextW && height === nextH) return false
    // Allocate the whole next generation first and only then replace the old
    // targets: a failed framebuffer allocation used to leave passes without
    // targets while width/height already changed, so every following frame
    // threw inside channels(). The pipeline now stays renderable at the old
    // size until the new one is complete.
    /** @type {Map<string, Target[]>} */
    const nextTargets = new Map()
    /** @type {Target[]} */
    const created = []
    try {
      for (const [id, pass] of buffers) {
        /** @type {Target[]} */
        const targets = []
        for (let i = 0; i < 2; i++) {
          const tex = gl.createTexture(), fbo = gl.createFramebuffer()
          targets.push({ tex, fbo })
          created.push({ tex, fbo })
          gl.bindTexture(gl.TEXTURE_2D, tex)
          gl.texImage2D(gl.TEXTURE_2D, 0, pass.half ? gl.RGBA16F : gl.RGBA32F, nextW, nextH, 0, gl.RGBA, pass.half ? gl.HALF_FLOAT : gl.FLOAT, null)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, pass.mipmaps ? gl.LINEAR_MIPMAP_LINEAR : pass.nearest ? gl.NEAREST : gl.LINEAR)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, pass.nearest ? gl.NEAREST : gl.LINEAR)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
          if (!pass.mipmaps) gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0)
          gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Buffer 浮点帧缓冲不可用')
          gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
          if (pass.mipmaps) gl.generateMipmap(gl.TEXTURE_2D)
        }
        nextTargets.set(id, targets)
      }
    } catch (error) {
      for (const target of created) { gl.deleteFramebuffer(target.fbo); gl.deleteTexture(target.tex) }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      throw error
    }
    width = nextW; height = nextH
    for (const [id, pass] of buffers) {
      for (const target of pass.targets) { gl.deleteFramebuffer(target.fbo); gl.deleteTexture(target.tex) }
      pass.targets = nextTargets.get(id) ?? []
      pass.front = 0; pass.time = 0
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return true
  }

  function clear() {
    for (const pass of buffers.values()) {
      pass.front = 0; pass.time = 0
      for (const target of pass.targets) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
        if (pass.mipmaps) { gl.bindTexture(gl.TEXTURE_2D, target.tex); gl.generateMipmap(gl.TEXTURE_2D) }
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** @param {string} role @param {Record<string, WebGLUniformLocation | null>} locations @param {number} time */
  function channels(role, locations, time) {
    dimensions.fill(0); times.fill(0)
    for (let i = 0; i < 4; i++) {
      const ref = code.channels?.[role]?.[i]
      if (!ref) continue
      /** @type {TextureRef | undefined} */
      let target
      if (ref.startsWith('buffer:')) {
        const pass = buffers.get(ref.slice(7))
        if (pass?.targets?.length) {
          const current = pass.targets[pass.front]
          target = { tex: current.tex, type: gl.TEXTURE_2D, width, height, depth: 1, time: pass.time }
        }
      } else target = textures.get(ref)
      if (!target) continue
      gl.activeTexture(gl.TEXTURE0 + i)
      gl.bindTexture(target.type, target.tex)
      if (ref === 'keyboard' && keyboardDirty && target.data) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 3, gl.RGBA, gl.UNSIGNED_BYTE, target.data)
        keyboardDirty = false
      }
      dimensions.set([target.width, target.height, target.depth], i * 3)
      // ShaderToy semantics: iChannelTime is the buffer's own render time and
      // 0 for image/texture inputs. Using the current frame time for textures
      // made e.g. noise channels report a moving time they never had.
      times[i] = target.time ?? 0
    }
    if (locations['iChannelResolution[4]']) gl.uniform3fv(locations['iChannelResolution[4]'], dimensions)
    if (locations['iChannelTime[4]']) gl.uniform1fv(locations['iChannelTime[4]'], times)
  }

  /** @param {number} time @param {DrawPass} draw */
  function render(time, draw) {
    for (const [id, pass] of buffers) {
      const next = 1 - pass.front
      draw(pass.program, pass.locs, pass.targets[next].fbo, width, height, id)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, pass.targets[next].tex)
      if (pass.mipmaps) gl.generateMipmap(gl.TEXTURE_2D)
      pass.front = next; pass.time = time
    }
  }

  function endFrame() {
    if (!keyboardPressed) return
    keyboardPressed = false
    const keyboard = textures.get('keyboard')
    if (!keyboard || !keyboard.data) return
    // Only a new key-down can set the one-frame pulse row. Track that event
    // instead of scanning/clearing 1 KB and allocating a view on every idle frame.
    keyboard.data.fill(0, 256 * 4, 512 * 4)
    keyboardDirty = true
  }

  /** @param {number} code @param {boolean} down */
  function key(code, down) {
    const keyboard = textures.get('keyboard')
    if (!keyboard || !keyboard.data || !Number.isInteger(code) || code < 0 || code > 255) return
    const offset = code * 4
    if (keyboard.data[offset] === (down ? 255 : 0)) return
    if (down && keyboard.data[offset] === 0) {
      keyboardPressed = true
      keyboard.data[offset + 256 * 4] = 255
      keyboard.data[offset + 512 * 4] ^= 255
    }
    keyboard.data[offset] = down ? 255 : 0
    keyboardDirty = true
  }

  function releaseKeys() {
    keyboardPressed = false
    const keyboard = textures.get('keyboard')
    if (keyboard?.data) { keyboard.data.fill(0, 0, 512 * 4); keyboardDirty = true }
  }

  function dispose() {
    for (const pass of buffers.values()) {
      gl.deleteProgram(pass.program)
      for (const target of pass.targets) { gl.deleteFramebuffer(target.fbo); gl.deleteTexture(target.tex) }
    }
    for (const texture of textures.values()) gl.deleteTexture(texture.tex)
    buffers.clear(); textures.clear()
  }

  /** @type {Pipeline} */
  const pipeline = { code, buffers, textures, stats, resize, clear, channels, render, endFrame, key, releaseKeys, dispose }

  try {
    for (const id of BUFFER_IDS) {
      const source = code.buffers?.[id]
      if (!source) continue
      if (!floating) throw new Error('此项目需要浮点 Buffer，当前 GPU 不支持 EXT_color_buffer_float')
      const built = compile(sourceFor(code, id), id)
      if (!built.program) throw new Error(`Buffer ${id}:\n${built.error}`)
      const settings = code.bufferSettings?.[id]
      const half = settings?.format === 'float16'
      buffers.set(id, { program: built.program, locs: built.locs ?? {}, front: 0, time: 0, half, nearest: settings?.filter === 'nearest' || !half && !linear, mipmaps: settings?.mipmaps === true && (half || linear), targets: [] })
    }
    /** @type {Set<string>} */
    const refSet = new Set()
    for (const refs of Object.values(code.channels ?? {})) for (const ref of refs) if (ref && !ref.startsWith('buffer:')) refSet.add(ref)
    let texturePixels = 0
    const maxTexture = /** @type {number} */ (gl.getParameter(gl.MAX_TEXTURE_SIZE))
    for (const ref of refSet) {
      const source = await makeTextureSource(ref, code.assets)
      texturePixels += source.width * source.height * (source.depth ?? 1)
      if (source.width > maxTexture || source.height > maxTexture || texturePixels > 16 * 1024 * 1024) {
        source.close?.()
        throw new Error('项目图片超过当前 GPU 尺寸或总计 1600 万像素限制')
      }
      const tex = gl.createTexture(), type = (source.depth ?? 1) > 1 ? gl.TEXTURE_3D : gl.TEXTURE_2D
      textures.set(ref, { tex, type, width: source.width, height: source.height, depth: source.depth ?? 1, data: source.data })
      gl.bindTexture(type, tex)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, !source.data)
      if (type === gl.TEXTURE_3D) {
        if (!source.data) throw new Error('3D 纹理缺少像素数据')
        gl.texImage3D(type, 0, gl.RGBA8, source.width, source.height, source.depth ?? 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, source.data)
      } else if (source.data) gl.texImage2D(type, 0, gl.RGBA8, source.width, source.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, source.data)
      else gl.texImage2D(type, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, /** @type {TexImageSource} */ (source))
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      source.close?.()
      gl.texParameteri(type, gl.TEXTURE_MIN_FILTER, ref === 'keyboard' ? gl.NEAREST : gl.LINEAR_MIPMAP_LINEAR)
      gl.texParameteri(type, gl.TEXTURE_MAG_FILTER, ref === 'keyboard' ? gl.NEAREST : gl.LINEAR)
      for (const axis of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, ...(type === gl.TEXTURE_3D ? [gl.TEXTURE_WRAP_R] : [])]) gl.texParameteri(type, axis, ref.startsWith('noise') ? gl.REPEAT : gl.CLAMP_TO_EDGE)
      if (ref !== 'keyboard') gl.generateMipmap(type)
    }
    return pipeline
  } catch (error) { pipeline.dispose(); throw error }
}
