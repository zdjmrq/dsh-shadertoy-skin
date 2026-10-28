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
 * @param {string} id
 * @param {Record<string, string>} [assets]
 * @returns {Promise<TextureSource>}
 */
export async function makeTextureSource(id, assets) {
  if (id.startsWith('asset:')) {
    const data = assets?.[id.slice(6)]
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(data ?? '')) throw new Error('无效图片资源')
    const bitmap = await createImageBitmap(await (await fetch(data ?? '')).blob())
    if (bitmap.width > 4096 || bitmap.height > 4096) { bitmap.close(); throw new Error('图片边长不能超过 4096') }
    return bitmap
  }
  if (id === 'keyboard') return { width: 256, height: 3, data: new Uint8Array(256 * 3 * 4) }
  if (id === 'noise' || id === 'noise3d') {
    const depth = id === 'noise3d' ? 32 : 1
    const width = depth === 1 ? 256 : 32
    const data = new Uint8Array(width * width * depth * 4)
    let seed = 0x51f15e
    for (let i = 0; i < data.length; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; data[i] = seed & 255 }
    return { width, height: width, depth, data }
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
    return { width: 512, height: 512, data }
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
  return canvas
}
