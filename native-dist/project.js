// Shared project format for the Host, importer, editor and both player modes.
export const BUFFER_IDS = ['A', 'B', 'C', 'D']
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const sourceText = text => text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
const safeName = name => typeof name === 'string' && name.length > 0 && name.length <= 160 && !/^(?:\/|[A-Za-z]:)|\\|(?:^|\/)\.\.?(?:\/|$)/.test(name) && !['__proto__', 'constructor', 'prototype'].includes(name)

export function normalizeCode(raw) {
  if (!object(raw) || typeof raw.image !== 'string' || !raw.image.trim()) throw new Error('项目需要 Image 代码')
  const code = { image: sourceText(raw.image) }
  for (const role of ['sound', 'common']) if (typeof raw[role] === 'string' && raw[role].trim()) code[role] = sourceText(raw[role])
  for (const key of ['buffers', 'includes', 'assets']) {
    if (raw[key] === undefined) continue
    if (!object(raw[key])) throw new Error(`${key} 必须是对象`)
    const entries = Object.entries(raw[key])
    if (entries.length > (key === 'buffers' ? 4 : 24)) throw new Error(`${key} 文件过多`)
    code[key] = Object.create(null)
    for (const [name, text] of entries) {
      if (key === 'buffers' ? !BUFFER_IDS.includes(name) : !safeName(name)) throw new Error(`无效文件名：${name}`)
      if (typeof text !== 'string') throw new Error(`文件 ${name} 需要文本内容`)
      if (key === 'assets' && !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(text)) throw new Error(`图片 ${name} 需要内嵌 PNG / JPEG / WebP`)
      code[key][name] = key === 'assets' ? text : sourceText(text)
    }
  }
  if (raw.channels !== undefined) {
    if (!object(raw.channels)) throw new Error('channels 必须是对象')
    code.channels = Object.create(null)
    for (const [role, channels] of Object.entries(raw.channels)) {
      if (!['image', 'sound', ...BUFFER_IDS].includes(role) || !Array.isArray(channels) || channels.length > 4) throw new Error(`无效通道：${role}`)
      code.channels[role] = channels.map(ref => {
        if (ref === null || ref === '') return null
        if (['font', 'noise', 'noise3d', 'scene', 'keyboard'].includes(ref)) return ref
        if (typeof ref === 'string' && ref.startsWith('buffer:') && Object.hasOwn(code.buffers ?? {}, ref.slice(7))) return ref
        if (typeof ref === 'string' && ref.startsWith('asset:') && Object.hasOwn(code.assets ?? {}, ref.slice(6))) return ref
        throw new Error(`找不到通道资源：${String(ref)}`)
      })
    }
  }
  if (object(raw.duration)) {
    code.duration = {}
    for (const role of ['image', 'sound']) if (Number.isFinite(raw.duration[role]) && raw.duration[role] > 0 && raw.duration[role] <= 86400) code.duration[role] = raw.duration[role]
  }
  if (raw.bufferSettings !== undefined) {
    if (!object(raw.bufferSettings)) throw new Error('bufferSettings 必须是对象')
    code.bufferSettings = {}
    for (const [id, settings] of Object.entries(raw.bufferSettings)) {
      if (!Object.hasOwn(code.buffers ?? {}, id) || !object(settings)) throw new Error('无效 Buffer 设置')
      code.bufferSettings[id] = { format: settings.format === 'float16' ? 'float16' : 'float32', filter: settings.filter === 'nearest' ? 'nearest' : 'linear', mipmaps: settings.mipmaps === true }
    }
  }
  return code
}

export function codeBytes(code) {
  const texts = [code.image ?? '', code.sound ?? '', code.common ?? '', ...Object.values(code.buffers ?? {}), ...Object.values(code.includes ?? {})]
  const encoder = new TextEncoder()
  return texts.reduce((sum, text) => sum + encoder.encode(text).length, 0)
}

export function sourceFor(code, role) {
  const source = BUFFER_IDS.includes(role) ? code.buffers?.[role] ?? '' : code[role] ?? ''
  let budget = 2 * 1024 * 1024
  const expand = (text, chain = []) => {
    budget -= text.length
    if (budget < 0) throw new Error('include 展开超过 2 MB')
    return text.replace(/^\s*#\s*include\s+["<]([^">]+)[">]\s*$/gm, (_, name) => {
    if (!Object.hasOwn(code.includes ?? {}, name)) throw new Error(`找不到 include 文件：${name}`)
    if (chain.includes(name) || chain.length >= 16) throw new Error(`include 循环：${[...chain, name].join(' → ')}`)
    return expand(code.includes[name], [...chain, name])
    })
  }
  if (!source.trim()) return ''
  const duration = code.duration?.[role]
  return (duration ? `// @duration ${duration}\n` : '') + expand((code.common ? code.common + '\n' : '') + source)
}

export async function loadBuiltin(item, fetchText) {
  const code = { image: await fetchText(item.file) }
  const reads = []
  for (const role of ['common', 'sound']) if (item[`${role}File`]) reads.push(fetchText(item[`${role}File`]).then(text => { code[role] = text }))
  for (const [id, file] of Object.entries(item.bufferFiles ?? {})) reads.push(fetchText(file).then(text => { (code.buffers ??= {})[id] = text }))
  await Promise.all(reads)
  if (item.channels) code.channels = item.channels
  if (item.duration) code.duration = item.duration
  if (item.bufferSettings) code.bufferSettings = item.bufferSettings
  return normalizeCode(code)
}

export function parseDocument(text) {
  let raw
  try { raw = JSON.parse(text.replace(/^\uFEFF/, '')) } catch { return undefined }
  const shader = raw?.Shader ?? raw?.shader ?? raw
  if (!object(shader)) return undefined
  const passes = shader.renderpass ?? shader.passes
  let code
  if (Array.isArray(passes)) {
    code = { image: '', buffers: {}, channels: {} }
    const bufferPasses = passes.filter(pass => String(pass?.type).toLowerCase() === 'buffer')
    if (bufferPasses.length > 4) throw new Error('最多支持 Buffer A–D')
    const ids = new Map(bufferPasses.map((pass, index) => [pass.outputs?.[0]?.id ?? pass.id, BUFFER_IDS[index]]))
    let bufferIndex = 0
    for (const pass of passes) {
      const type = String(pass?.type ?? 'image').toLowerCase()
      if (!['common', 'image', 'buffer', 'sound'].includes(type)) throw new Error(`暂不支持 ${type} pass`)
      if (typeof pass.code !== 'string') throw new Error('Pass 缺少代码')
      if (type === 'common') { code.common = (code.common ?? '') + pass.code + '\n'; continue }
      const role = type === 'buffer' ? BUFFER_IDS[bufferIndex++] : type
      if (type === 'buffer') code.buffers[role] = pass.code
      else code[role] = pass.code
      for (const input of pass.inputs ?? []) {
        const channel = input.channel
        if (!Number.isInteger(channel) || channel < 0 || channel > 3) throw new Error('无效通道编号')
        let ref
        if (String(input.ctype ?? input.type).toLowerCase() === 'buffer' && ids.has(input.id)) ref = `buffer:${ids.get(input.id)}`
        else if (/font/i.test(input.src ?? '')) ref = 'font'
        else throw new Error('暂不支持这个外部输入，请导入图片文件并手动指定通道')
        ;(code.channels[role] ??= [null, null, null, null])[channel] = ref
      }
    }
    if (!code.image.trim()) return undefined
  } else {
    const source = object(shader.code) ? shader.code : shader
    if (typeof source.image !== 'string' || !source.image.trim()) return undefined
    code = source
  }
  const metadata = {}
  for (const key of ['license', 'origin', 'author', 'sourceUrl', 'licenseUrl']) {
    const value = shader[key] ?? shader.info?.[key]
    if (typeof value === 'string') metadata[key] = value
  }
  if (!metadata.author && typeof shader.info?.username === 'string') metadata.author = shader.info.username
  const name = String(shader.info?.name ?? shader.name ?? '').trim()
  return { ...normalizeCode(code), name: name || undefined, ...metadata }
}

// Match the advertised resolution to the runtime budget on high-DPI displays.
export function renderSize(cssWidth, cssHeight, dpr, scale, maxSide = 8192) {
  let width = Math.min(maxSide, Math.max(1, Math.round(cssWidth * Math.min(dpr || 1, 1.5) * scale)))
  let height = Math.min(maxSide, Math.max(1, Math.round(cssHeight * Math.min(dpr || 1, 1.5) * scale)))
  const factor = Math.min(1, Math.sqrt(8 * 1024 * 1024 / (width * height)))
  width = Math.max(1, Math.floor(width * factor)); height = Math.max(1, Math.floor(height * factor))
  return { width, height }
}
