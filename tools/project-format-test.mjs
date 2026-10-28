import assert from 'node:assert/strict'
import { parseDocument, loadBuiltin } from '../native-dist/project.js'

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
