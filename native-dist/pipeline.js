import { BUFFER_IDS, sourceFor } from './project.js'
import { makeTextureSource } from './textures.js'

export async function createPipeline(gl, code, compile) {
  const buffers = new Map(), textures = new Map()
  const floating = !!gl.getExtension('EXT_color_buffer_float')
  const linear = !!gl.getExtension('OES_texture_float_linear')
  const dimensions = new Float32Array(12), times = new Float32Array(4)
  let width = 0, height = 0, keyboardDirty = false
  const pipeline = {
    code, buffers, textures,
    stats() { return { width, height, bufferBytes: [...buffers.values()].reduce((sum, pass) => sum + width * height * 2 * (pass.half ? 8 : 16) * (pass.mipmaps ? 4 / 3 : 1), 0), passes: [...buffers].map(([id, pass]) => ({ id, format: pass.half ? 'float16' : 'float32', mipmaps: pass.mipmaps, filter: pass.nearest ? 'nearest' : 'linear' })) } },
    resize(w, h) {
      // Two float RGBA targets per pass, with mip levels. Bound total retained
      // buffer memory instead of allocating gigabytes on a large/high-DPI screen.
      const bytesPerPixel = [...buffers.values()].reduce((sum, pass) => sum + 2 * (pass.half ? 8 : 16) * (pass.mipmaps ? 4 / 3 : 1), 0)
      const scale = Math.min(1, Math.sqrt(96 * 1024 * 1024 / Math.max(1, bytesPerPixel * w * h)))
      const nextW = Math.max(1, Math.floor(w * scale)), nextH = Math.max(1, Math.floor(h * scale))
      if (width === nextW && height === nextH) return false
      width = nextW; height = nextH
      for (const pass of buffers.values()) {
        for (const target of pass.targets ?? []) { gl.deleteFramebuffer(target.fbo); gl.deleteTexture(target.tex) }
        pass.targets = []
        for (let i = 0; i < 2; i++) {
          const tex = gl.createTexture(), fbo = gl.createFramebuffer()
          pass.targets.push({ tex, fbo })
          gl.bindTexture(gl.TEXTURE_2D, tex)
          gl.texImage2D(gl.TEXTURE_2D, 0, pass.half ? gl.RGBA16F : gl.RGBA32F, width, height, 0, gl.RGBA, pass.half ? gl.HALF_FLOAT : gl.FLOAT, null)
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
        pass.front = 0; pass.time = 0
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      return true
    },
    clear() {
      for (const pass of buffers.values()) {
        pass.front = 0; pass.time = 0
        for (const target of pass.targets ?? []) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
          gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
          if (pass.mipmaps) { gl.bindTexture(gl.TEXTURE_2D, target.tex); gl.generateMipmap(gl.TEXTURE_2D) }
        }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    },
    channels(role, locations, time) {
      dimensions.fill(0); times.fill(0)
      for (let i = 0; i < 4; i++) {
        const ref = code.channels?.[role]?.[i]
        if (!ref) continue
        let target
        if (ref.startsWith('buffer:')) {
          const pass = buffers.get(ref.slice(7))
          if (pass?.targets) target = { ...pass.targets[pass.front], width, height, time: pass.time, type: gl.TEXTURE_2D }
        } else target = textures.get(ref)
        if (!target) continue
        gl.activeTexture(gl.TEXTURE0 + i)
        gl.bindTexture(target.type, target.tex)
        if (ref === 'keyboard' && keyboardDirty) {
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 3, gl.RGBA, gl.UNSIGNED_BYTE, target.data)
          keyboardDirty = false
        }
        dimensions.set([target.width, target.height, target.depth ?? 1], i * 3)
        times[i] = target.time ?? time
      }
      if (locations['iChannelResolution[4]']) gl.uniform3fv(locations['iChannelResolution[4]'], dimensions)
      if (locations['iChannelTime[4]']) gl.uniform1fv(locations['iChannelTime[4]'], times)
    },
    render(time, draw) {
      for (const [id, pass] of buffers) {
        const next = 1 - pass.front
        draw(pass.program, pass.locs, pass.targets[next].fbo, width, height, id)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, pass.targets[next].tex)
        if (pass.mipmaps) gl.generateMipmap(gl.TEXTURE_2D)
        pass.front = next; pass.time = time
      }
      const keyboard = textures.get('keyboard')
      if (keyboard) { keyboard.data.fill(0, 256 * 4, 512 * 4); keyboardDirty = true }
    },
    key(code, down) {
      const keyboard = textures.get('keyboard')
      if (!keyboard || code < 0 || code > 255) return
      const offset = code * 4
      if (down && keyboard.data[offset] === 0) {
        keyboard.data[offset + 256 * 4] = 255
        keyboard.data[offset + 512 * 4] ^= 255
      }
      keyboard.data[offset] = down ? 255 : 0
      keyboardDirty = true
    },
    releaseKeys() {
      const keyboard = textures.get('keyboard')
      if (keyboard) { keyboard.data.fill(0, 0, 512 * 4); keyboardDirty = true }
    },
    dispose() {
      for (const pass of buffers.values()) {
        gl.deleteProgram(pass.program)
        for (const target of pass.targets ?? []) { gl.deleteFramebuffer(target.fbo); gl.deleteTexture(target.tex) }
      }
      for (const texture of textures.values()) gl.deleteTexture(texture.tex)
      buffers.clear(); textures.clear()
    },
  }
  try {
    for (const id of BUFFER_IDS) if (code.buffers?.[id]) {
      if (!floating) throw new Error('此项目需要浮点 Buffer，当前 GPU 不支持 EXT_color_buffer_float')
      const built = compile(sourceFor(code, id), id)
      if (!built.program) throw new Error(`Buffer ${id}:\n${built.error}`)
      const settings = code.bufferSettings?.[id] ?? {}
      const half = settings.format === 'float16'
      buffers.set(id, { program: built.program, locs: built.locs, front: 0, time: 0, half, nearest: settings.filter === 'nearest' || !half && !linear, mipmaps: settings.mipmaps === true && (half || linear) })
    }
    const refs = [...new Set(Object.values(code.channels ?? {}).flat().filter(ref => ref && !ref.startsWith('buffer:')))]
    let texturePixels = 0
    const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE)
    for (const ref of refs) {
      const source = await makeTextureSource(ref, code.assets)
      texturePixels += source.width * source.height * (source.depth ?? 1)
      if (source.width > maxTexture || source.height > maxTexture || texturePixels > 16 * 1024 * 1024) {
        source.close?.()
        throw new Error('项目图片超过当前 GPU 尺寸或总计 1600 万像素限制')
      }
      const tex = gl.createTexture(), type = source.depth > 1 ? gl.TEXTURE_3D : gl.TEXTURE_2D
      textures.set(ref, { tex, type, width: source.width, height: source.height, depth: source.depth ?? 1, data: source.data })
      gl.bindTexture(type, tex)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, !source.data)
      if (type === gl.TEXTURE_3D) gl.texImage3D(type, 0, gl.RGBA8, source.width, source.height, source.depth, 0, gl.RGBA, gl.UNSIGNED_BYTE, source.data)
      else if (source.data) gl.texImage2D(type, 0, gl.RGBA8, source.width, source.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, source.data)
      else gl.texImage2D(type, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
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
