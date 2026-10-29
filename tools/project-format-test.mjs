import assert from 'node:assert/strict'
import { parseDocument, loadBuiltin } from '../native-dist/project.js'
import { makeTextureSource } from '../native-dist/textures.js'

const image = 'void mainImage(out vec4 c,in vec2 p){c=vec4(1);}'
const parse = passes => parseDocument(JSON.stringify({ renderpass: passes }))
const buffers = [
  { type: 'buffer', code: image },
  { type: 'buffer', code: image },
]
assert.throws(() => parse([...buffers, { type: 'image', code: image, inputs: [{ channel: 0, ctype: 'buffer' }] }]), /Buffer.*id/)
assert.ok(parse([...buffers, { type: 'image', code: image }]), 'unreferenced id-less buffers remain valid')
assert.throws(() => parse([{ type: 'buffer', id: 4, code: image }, { type: 'buffer', outputs: [{ id: 4 }], code: image }, { type: 'image', code: image }]), /id 重复/)
assert.equal(parse([{ type: 'buffer', outputs: [{ id: 0 }], code: image }, { type: 'image', code: image, inputs: [{ channel: 0, ctype: 'buffer', id: '0' }] }]).channels.image[0], 'buffer:A')
assert.throws(() => parse([{ type: 'buffer', outputs: {}, code: image }]), /outputs 必须是数组/)
for (const passes of [[null], [{ type: 'image', code: image, inputs: [null] }], [{ type: 'image', code: image, inputs: {} }]]) assert.throws(() => parse(passes), /必须是/)
assert.throws(() => parse([{ type: 'image', code: image }, { type: 'image', code: image }]), /Pass 重复/)
assert.throws(() => parse([{ type: 'image', code: image, inputs: [{ channel: 0, ctype: 'texture', src: 'font.png' }, { channel: 0, ctype: 'texture', src: 'font.png' }] }]), /iChannel0 重复/)
console.log('ok    malformed/missing/duplicate Buffer ids, passes and channels cannot silently miswire projects')

const requested = []
let release
const gate = new Promise(resolve => { release = resolve })
const loaded = loadBuiltin({ id: 'multi', file: 'image', soundFile: 'sound', commonFile: 'common', bufferFiles: { A: 'buffer' } }, async file => {
  requested.push(file)
  await gate
  return file === 'image' || file === 'buffer' ? image : file === 'sound' ? 'vec2 mainSound(float t){return vec2(0);}' : 'float helper(){return 1.;}'
})
await Promise.resolve()
assert.deepEqual(requested.sort(), ['buffer', 'common', 'image', 'sound'])
release()
assert.ok((await loaded).buffers.A)
console.log('ok    all built-in project files start loading concurrently and retain their roles')

const decoder = globalThis.createImageBitmap
let decodes = 0
globalThis.createImageBitmap = async (_blob, options) => {
  decodes++
  assert.equal(options.imageOrientation, 'flipY')
  return { width: 2, height: 2, close() {} }
}
try {
  const png = Buffer.alloc(24)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png)
  png.write('IHDR', 12); png.writeUInt32BE(50000, 16); png.writeUInt32BE(50000, 20)
  const asset = (bytes, mime = 'png') => makeTextureSource('asset:test', { test: `data:image/${mime};base64,${bytes.toString('base64')}` })
  await assert.rejects(asset(png), /解码前拦截/)
  await assert.rejects(asset(Buffer.alloc(32)), /无法读取图片尺寸/)
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xc2, 0, 8, 8, 0x20, 0, 0x20, 0, 1])
  await assert.rejects(asset(jpeg, 'jpeg'), /解码前拦截/)
  const webp = Buffer.alloc(30)
  webp.write('RIFF'); webp.write('WEBP', 8); webp.write('VP8X', 12)
  webp[24] = 0xff; webp[25] = 0x3f
  await assert.rejects(asset(webp, 'webp'), /解码前拦截/)
  assert.equal(decodes, 0, 'oversized compressed images must never reach the bitmap decoder')
  png.writeUInt32BE(2, 16); png.writeUInt32BE(2, 20)
  await asset(png)
  assert.equal(decodes, 1)
} finally {
  if (decoder === undefined) delete globalThis.createImageBitmap
  else globalThis.createImageBitmap = decoder
}
console.log('ok    oversized PNG/JPEG/WebP are rejected before decoding and imported bitmaps explicitly flip their origin')
