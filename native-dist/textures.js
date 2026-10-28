// Offline channel resources. No external image, font or network dependency.

/**
 * @typedef {object} TextureSource
 * @property {number} width
 * @property {number} height
 * @property {number} [depth]
 * @property {Uint8Array} [data]  // raw RGBA rows, already bottom-up when required
 * @property {() => void} [close]
 */

/**
 * CPU-side cache for the generated atlases. Every pipeline still uploads its own
 * GPU copy, but the font SDF (two 512² chamfer passes), the noise tables and the
 * procedural city are identical for every project — regenerating them on every
 * preset switch was wasted work. `keyboard` is excluded (mutable per pipeline)
 * and imported images are not cached (they are per-preset and can be large).
 * @type {Map<string, TextureSource>}
 */
const generated = new Map()

/** Read dimensions before decoding: a small compressed file can expand to a
 * huge bitmap and exhaust the shared browser/GPU process before a post-decode
 * size check runs. Supported imports are PNG, JPEG and WebP only.
 * @param {ArrayBuffer} bytes
 * @returns {{width: number, height: number}}
 */
function imageSize(bytes) {
  const data = new Uint8Array(bytes), view = new DataView(bytes)
  /** @param {number} offset @param {string} text */
  const is = (offset, text) => [...text].every((char, index) => data[offset + index] === char.charCodeAt(0))
  if (data.length >= 24 && is(0, '\x89PNG\r\n\x1a\n') && is(12, 'IHDR')) return { width: view.getUint32(16), height: view.getUint32(20) }
  if (data.length >= 25 && is(0, 'RIFF') && is(8, 'WEBP')) {
    const u24 = /** @param {number} offset */ offset => data[offset] | data[offset + 1] << 8 | data[offset + 2] << 16
    if (data.length >= 30 && is(12, 'VP8X')) return { width: 1 + u24(24), height: 1 + u24(27) }
    if (is(12, 'VP8L') && data[20] === 0x2f) return { width: 1 + ((data[21] | data[22] << 8) & 0x3fff), height: 1 + ((data[22] >> 6 | data[23] << 2 | data[24] << 10) & 0x3fff) }
    if (data.length >= 30 && is(12, 'VP8 ') && is(23, '\x9d\x01\x2a')) return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff }
  }
  if (data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2
    while (offset + 3 < data.length) {
      if (data[offset++] !== 0xff) break
      while (data[offset] === 0xff) offset++
      const marker = data[offset++]
      if (marker === 0xda || marker === 0xd9) break
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue
      if (offset + 2 > data.length) break
      const length = view.getUint16(offset)
      if (length < 2 || offset + length > data.length) break
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && length >= 8) return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) }
      offset += length
    }
  }
  throw new Error('无法读取图片尺寸，请使用有效的 PNG / JPEG / WebP 文件')
}

/**
 * @param {string} id
 * @param {Record<string, string>} [assets]
 * @returns {Promise<TextureSource>}
 */
export async function makeTextureSource(id, assets) {
  if (id.startsWith('asset:')) {
    const data = assets?.[id.slice(6)]
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(data ?? '')) throw new Error('无效图片资源')
    if ((data?.length ?? 0) > 2_800_000) throw new Error('图片文件不能超过 2 MB')
    const blob = await (await fetch(data ?? '')).blob()
    if (blob.size > 2 * 1024 * 1024) throw new Error('图片文件不能超过 2 MB')
    const size = imageSize(await blob.arrayBuffer())
    if (!size.width || !size.height || size.width > 4096 || size.height > 4096) throw new Error('图片边长必须在 1–4096 之间（已在解码前拦截）')
    // WebGL ignores UNPACK_FLIP_Y_WEBGL for ImageBitmap; orient the decoded
    // pixels explicitly so imported pictures share ShaderToy's bottom-left UVs.
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY' })
    if (bitmap.width > 4096 || bitmap.height > 4096) { bitmap.close(); throw new Error('图片边长不能超过 4096') }
    return bitmap
  }
  if (id === 'keyboard') return { width: 256, height: 3, data: new Uint8Array(256 * 3 * 4) }
  const cached = generated.get(id)
  if (cached) return cached
  if (id === 'noise' || id === 'noise3d') {
    const depth = id === 'noise3d' ? 32 : 1
    const width = depth === 1 ? 256 : 32
    const data = new Uint8Array(width * width * depth * 4)
    let seed = 0x51f15e
    for (let i = 0; i < data.length; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; data[i] = seed & 255 }
    const source = { width, height: width, depth, data }
    generated.set(id, source)
    return source
  }
  const canvas = document.createElement('canvas')
  canvas.width = 512; canvas.height = id === 'font' ? 512 : 256
  const ctx = canvas.getContext('2d', { willReadFrequently: id === 'font' })
  if (!ctx) throw new Error('无法创建 2D 画布')
  if (id === 'font') {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 512, 512)
    ctx.fillStyle = '#fff'; ctx.font = '25px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (let i = 32; i < 256; i++) ctx.fillText(String.fromCharCode(i), (i % 16) * 32 + 16, Math.floor(i / 16) * 32 + 16)
    const pixels = ctx.getImageData(0, 0, 512, 512)
    // Two chamfer distance fields; alpha is < .5 inside the glyph, as expected
    // by ShaderToy's font sampler. Each atlas cell uses its ASCII code.
    const count = 512 * 512
    const inside = new Float32Array(count), outside = new Float32Array(count)
    for (let i = 0; i < count; i++) { const on = pixels.data[i * 4] > 127; inside[i] = on ? 1000 : 0; outside[i] = on ? 0 : 1000 }
    for (const field of [inside, outside]) {
      for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
        const i = y * 512 + x
        if (x) field[i] = Math.min(field[i], field[i - 1] + 1)
        if (y) field[i] = Math.min(field[i], field[i - 512] + 1)
        if (x && y) field[i] = Math.min(field[i], field[i - 513] + 1.414)
      }
      for (let y = 511; y >= 0; y--) for (let x = 511; x >= 0; x--) {
        const i = y * 512 + x
        if (x < 511) field[i] = Math.min(field[i], field[i + 1] + 1)
        if (y < 511) field[i] = Math.min(field[i], field[i + 512] + 1)
        if (x < 511 && y < 511) field[i] = Math.min(field[i], field[i + 513] + 1.414)
      }
    }
    for (let i = 0; i < count; i++) {
      pixels.data[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, .5 + (outside[i] - inside[i]) / 16)) * 255)
    }
    // R is glyph coverage, A is inverse signed distance. Upload raw straight
    // RGBA, so Canvas premultiplication cannot erase R where SDF alpha is zero.
    const data = new Uint8Array(pixels.data.length)
    for (let y = 0; y < 512; y++) data.set(pixels.data.subarray(y * 512 * 4, (y + 1) * 512 * 4), (511 - y) * 512 * 4)
    const source = { width: 512, height: 512, data }
    generated.set('font', source)
    return source
  } else if (id === 'scene') {
    const sky = ctx.createLinearGradient(0, 0, 0, 256)
    sky.addColorStop(0, '#263c67'); sky.addColorStop(.55, '#d68d73'); sky.addColorStop(1, '#14253c')
    ctx.fillStyle = sky; ctx.fillRect(0, 0, 512, 256)
    let seed = 17
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
    for (let x = 0; x < 512; x += 20) {
      const top = 70 + rand() * 100
      ctx.fillStyle = '#172332'; ctx.fillRect(x, top, 19, 256 - top)
      for (let y = top + 6; y < 235; y += 12) for (let dx = 3; dx < 17; dx += 6) {
        ctx.fillStyle = rand() > .45 ? '#f4c384' : '#304859'; ctx.fillRect(x + dx, y, 3, 5)
      }
    }
  } else throw new Error(`未知内置纹理：${id}`)
  generated.set(id, canvas)
  return canvas
}
