// Shared project format for the Host, importer, editor and both player modes.
/**
 * @typedef {object} ShaderCode
 * @property {string} image
 * @property {string} [sound]
 * @property {string} [common]
 * @property {Record<string, string>} [buffers]
 * @property {Record<string, string>} [includes]
 * @property {Record<string, string>} [assets]
 * @property {Record<string, (string|null)[]>} [channels]
 * @property {{image?: number, sound?: number}} [duration]
 * @property {Record<string, {format: 'float16'|'float32', filter: 'linear'|'nearest', mipmaps: boolean}>} [bufferSettings]
 *
 * @typedef {object} BuiltinPreset
 * @property {string} id
 * @property {string} file
 * @property {string} [name]
 * @property {string} [commonFile]
 * @property {string} [soundFile]
 * @property {Record<string, string>} [bufferFiles]
 * @property {ShaderCode['channels']} [channels]
 * @property {ShaderCode['duration']} [duration]
 * @property {ShaderCode['bufferSettings']} [bufferSettings]
 *
 * @typedef {object} ParseMetadata
 * @property {string} [name]
 * @property {string} [license]
 * @property {string} [origin]
 * @property {string} [author]
 * @property {string} [sourceUrl]
 * @property {string} [licenseUrl]
 *
 * @typedef {ShaderCode & ParseMetadata} ParsedDocument
 *
 * @typedef {{ id?: number }} ShaderToyOutput
 * @typedef {{ channel?: number, ctype?: string, type?: string, id?: number, src?: string }} ShaderToyInput
 * @typedef {object} ShaderToyPass
 * @property {string} [type]
 * @property {string} [code]
 * @property {number} [id]
 * @property {ShaderToyOutput[]} [outputs]
 * @property {ShaderToyInput[]} [inputs]
 */

export const BUFFER_IDS = /** @type {string[]} */ (['A', 'B', 'C', 'D'])

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)

/** @param {string} text @returns {string} */
const sourceText = text => text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')

/** @param {unknown} name @returns {boolean} */
const safeName = name => typeof name === 'string' && name.length > 0 && name.length <= 160 && !/^(?:\/|[A-Za-z]:)|\\|(?:^|\/)\.\.?(?:\/|$)/.test(name) && !['__proto__', 'constructor', 'prototype'].includes(name)

/** @param {unknown} raw @returns {ShaderCode} */
export function normalizeCode(raw) {
  if (!object(raw) || typeof raw.image !== 'string' || !raw.image.trim()) throw new Error('项目需要 Image 代码')
  /** @type {ShaderCode} */
  const code = { image: sourceText(raw.image) }
  for (const role of /** @type {const} */ (['sound', 'common'])) if (typeof raw[role] === 'string' && raw[role].trim()) code[role] = sourceText(raw[role])
  for (const key of /** @type {const} */ (['buffers', 'includes', 'assets'])) {
    if (raw[key] === undefined) continue
    const value = raw[key]
    if (!object(value)) throw new Error(`${key} 必须是对象`)
    const entries = Object.entries(value)
    if (entries.length > (key === 'buffers' ? 4 : 24)) throw new Error(`${key} 文件过多`)
    /** @type {Record<string, string>} */
    const map = Object.create(null)
    for (const [name, text] of entries) {
      if (key === 'buffers' ? !BUFFER_IDS.includes(name) : !safeName(name)) throw new Error(`无效文件名：${name}`)
      if (typeof text !== 'string') throw new Error(`文件 ${name} 需要文本内容`)
      if (key === 'assets' && !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(text)) throw new Error(`图片 ${name} 需要内嵌 PNG / JPEG / WebP`)
      map[name] = key === 'assets' ? text : sourceText(text)
    }
    if (key === 'buffers') code.buffers = map
    else if (key === 'includes') code.includes = map
    else code.assets = map
  }
  if (raw.channels !== undefined) {
    const value = raw.channels
    if (!object(value)) throw new Error('channels 必须是对象')
    /** @type {Record<string, (string|null)[]>} */
    const channels = Object.create(null)
    code.channels = channels
    for (const [role, refs] of Object.entries(value)) {
      if (!['image', 'sound', ...BUFFER_IDS].includes(role) || !Array.isArray(refs) || refs.length > 4) throw new Error(`无效通道：${role}`)
      channels[role] = refs.map(ref => {
        if (ref === null || ref === '') return null
        if (['font', 'noise', 'noise3d', 'scene', 'keyboard'].includes(ref)) return ref
        if (typeof ref === 'string' && ref.startsWith('buffer:') && Object.hasOwn(code.buffers ?? {}, ref.slice(7))) return ref
        if (typeof ref === 'string' && ref.startsWith('asset:') && Object.hasOwn(code.assets ?? {}, ref.slice(6))) return ref
        throw new Error(`找不到通道资源：${String(ref)}`)
      })
    }
  }
  if (object(raw.duration)) {
    /** @type {{image?: number, sound?: number}} */
    const duration = {}
    for (const role of /** @type {const} */ (['image', 'sound'])) {
      const value = raw.duration[role]
      if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 86400) duration[role] = value
    }
    code.duration = duration
  }
  if (raw.bufferSettings !== undefined) {
    if (!object(raw.bufferSettings)) throw new Error('bufferSettings 必须是对象')
    /** @type {NonNullable<ShaderCode['bufferSettings']>} */
    const settingsMap = {}
    for (const [id, settings] of Object.entries(raw.bufferSettings)) {
      if (!Object.hasOwn(code.buffers ?? {}, id) || !object(settings)) throw new Error('无效 Buffer 设置')
      settingsMap[id] = { format: settings.format === 'float16' ? 'float16' : 'float32', filter: settings.filter === 'nearest' ? 'nearest' : 'linear', mipmaps: settings.mipmaps === true }
    }
    code.bufferSettings = settingsMap
  }
  return code
}

/** @param {ShaderCode} code @returns {number} */
export function codeBytes(code) {
  const texts = [code.image ?? '', code.sound ?? '', code.common ?? '', ...Object.values(code.buffers ?? {}), ...Object.values(code.includes ?? {})]
  const encoder = new TextEncoder()
  return texts.reduce((sum, text) => sum + encoder.encode(text).length, 0)
}

/** @param {ShaderCode} code @param {string} role @returns {string} */
export function sourceFor(code, role) {
  const direct = role === 'image' ? code.image : role === 'sound' ? code.sound : role === 'common' ? code.common : ''
  const source = (BUFFER_IDS.includes(role) ? code.buffers?.[role] : direct) ?? ''
  let budget = 2 * 1024 * 1024
  /**
   * @param {string} text
   * @param {string[]} [chain]
   * @returns {string}
   */
  const expand = (text, chain = []) => {
    budget -= text.length
    if (budget < 0) throw new Error('include 展开超过 2 MB')
    return text.replace(/^\s*#\s*include\s+["<]([^">]+)[">]\s*$/gm, (_, name) => {
      if (!Object.hasOwn(code.includes ?? {}, name)) throw new Error(`找不到 include 文件：${name}`)
      if (chain.includes(name) || chain.length >= 16) throw new Error(`include 循环：${[...chain, name].join(' → ')}`)
      return expand(code.includes?.[name] ?? '', [...chain, name])
    })
  }
  if (!source.trim()) return ''
  const duration = role === 'image' || role === 'sound' ? code.duration?.[role] : undefined
  return (duration ? `// @duration ${duration}\n` : '') + expand((code.common ? code.common + '\n' : '') + source)
}

/**
 * @param {BuiltinPreset} item
 * @param {(file: string) => Promise<string>} fetchText
 * @returns {Promise<ShaderCode>}
 */
export async function loadBuiltin(item, fetchText) {
  /** @type {ShaderCode} */
  const code = { image: await fetchText(item.file) }
  /** @type {Promise<void>[]} */
  const reads = []
  if (item.commonFile) reads.push(fetchText(item.commonFile).then(text => { code.common = text }))
  if (item.soundFile) reads.push(fetchText(item.soundFile).then(text => { code.sound = text }))
  for (const [id, file] of Object.entries(item.bufferFiles ?? {})) reads.push(fetchText(file).then(text => { (code.buffers ??= {})[id] = text }))
  await Promise.all(reads)
  if (item.channels) code.channels = item.channels
  if (item.duration) code.duration = item.duration
  if (item.bufferSettings) code.bufferSettings = item.bufferSettings
  return normalizeCode(code)
}

/** @param {string} text @returns {ParsedDocument | undefined} */
export function parseDocument(text) {
  /** @type {any} */
  let raw
  try { raw = JSON.parse(text.replace(/^\uFEFF/, '')) } catch { return undefined }
  const shader = raw?.Shader ?? raw?.shader ?? raw
  if (!object(shader)) return undefined
  /** JSON view: the fields below are only read after explicit type checks. */
  const doc = /** @type {Record<string, any>} */ (shader)
  const passes = Array.isArray(doc.renderpass) ? /** @type {ShaderToyPass[]} */ (doc.renderpass)
    : Array.isArray(doc.passes) ? /** @type {ShaderToyPass[]} */ (doc.passes) : undefined
  /** @type {ShaderCode} */
  let code
  if (passes) {
    /** @type {ShaderCode} */
    const next = { image: '', buffers: {}, channels: {} }
    code = next
    const bufferPasses = passes.filter(pass => String(pass?.type).toLowerCase() === 'buffer')
    if (bufferPasses.length > 4) throw new Error('最多支持 Buffer A–D')
    const ids = new Map(bufferPasses.map((pass, index) => [pass.outputs?.[0]?.id ?? pass.id, BUFFER_IDS[index]]))
    let bufferIndex = 0
    for (const pass of passes) {
      const type = String(pass?.type ?? 'image').toLowerCase()
      if (!['common', 'image', 'buffer', 'sound'].includes(type)) throw new Error(`暂不支持 ${type} pass`)
      if (typeof pass.code !== 'string') throw new Error('Pass 缺少代码')
      if (type === 'common') { next.common = (next.common ?? '') + pass.code + '\n'; continue }
      const role = type === 'buffer' ? BUFFER_IDS[bufferIndex++] : type
      if (type === 'buffer') (next.buffers ??= {})[role] = pass.code
      else if (type === 'sound') next.sound = pass.code
      else next.image = pass.code
      for (const input of pass.inputs ?? []) {
        const channel = input.channel
        if (!Number.isInteger(channel) || /** @type {number} */ (channel) < 0 || /** @type {number} */ (channel) > 3) throw new Error('无效通道编号')
        const index = /** @type {number} */ (channel)
        /** @type {string | undefined} */
        let ref
        if (String(input.ctype ?? input.type).toLowerCase() === 'buffer' && ids.has(input.id)) ref = `buffer:${ids.get(input.id)}`
        else if (/font/i.test(input.src ?? '')) ref = 'font'
        else throw new Error('暂不支持这个外部输入，请导入图片文件并手动指定通道')
        const channels = (next.channels ??= {})
        const slots = (channels[role] ??= [null, null, null, null])
        slots[index] = /** @type {string} */ (ref)
      }
    }
    if (!next.image.trim()) return undefined
  } else {
    const source = /** @type {Record<string, unknown>} */ (object(doc.code) ? doc.code : doc)
    if (typeof source.image !== 'string' || !source.image.trim()) return undefined
    code = /** @type {ShaderCode} */ (source)
  }
  /** @type {ParseMetadata} */
  const metadata = {}
  for (const key of /** @type {const} */ (['license', 'origin', 'author', 'sourceUrl', 'licenseUrl'])) {
    const value = doc[key] ?? doc.info?.[key]
    if (typeof value === 'string') metadata[key] = value
  }
  if (!metadata.author && typeof doc.info?.username === 'string') metadata.author = doc.info.username
  const name = String(doc.info?.name ?? doc.name ?? '').trim()
  return { ...normalizeCode(code), name: name || undefined, ...metadata }
}

/**
 * Match the advertised resolution to the runtime budget on high-DPI displays.
 * @param {number} cssWidth
 * @param {number} cssHeight
 * @param {number} dpr
 * @param {number} scale
 * @param {number} [maxSide]
 * @returns {{width: number, height: number}}
 */
export function renderSize(cssWidth, cssHeight, dpr, scale, maxSide = 8192) {
  let width = Math.min(maxSide, Math.max(1, Math.round(cssWidth * Math.min(dpr || 1, 1.5) * scale)))
  let height = Math.min(maxSide, Math.max(1, Math.round(cssHeight * Math.min(dpr || 1, 1.5) * scale)))
  const factor = Math.min(1, Math.sqrt(8 * 1024 * 1024 / (width * height)))
  width = Math.max(1, Math.floor(width * factor)); height = Math.max(1, Math.floor(height * factor))
  return { width, height }
}
