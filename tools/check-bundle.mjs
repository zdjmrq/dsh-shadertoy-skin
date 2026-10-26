#!/usr/bin/env node
/**
 * Bundle checks — fast, dependency-free, runs in CI before anything else.
 *
 * Verifies the package is actually installable/publishable and that the *public*
 * artefact ships only code whose licence allows redistribution:
 *   - manifest shape (name / repository / dsh.bundle / dsh.client / exports / files)
 *   - every declared entry point and packaged file exists
 *   - no absolute local paths or `file://` URLs in the bundle patch
 *   - shipped presets are MIT or CC BY-NC-SA 3.0 (the two bundled ShaderToy works:
 *     attribution + licence URL + source URL required, CC notice in the file header)
 *   - Shadertoy view links are only allowed inside those CC BY-NC-SA presets
 *   - user-imported presets (`native-dist/presets/local`) are absent
 *   - `npm pack --dry-run` file list is exactly the intended set
 *
 * Usage: node tools/check-bundle.mjs [--no-pack]
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const results = []
let failures = 0

function check(label, condition, detail = '') {
  const ok = Boolean(condition)
  if (!ok) failures++
  results.push({ ok, label, detail })
}

function readJson(rel) {
  return readFile(join(ROOT, rel), 'utf8').then(JSON.parse)
}

/** Expand the tiny glob subset used in `files` (`dir/*.json`). */
async function expand(pattern) {
  if (!pattern.includes('*')) return [pattern]
  const dir = dirname(pattern)
  const suffix = pattern.slice(pattern.lastIndexOf('*') + 1)
  try {
    const entries = await readdir(join(ROOT, dir))
    return entries.filter(entry => entry.endsWith(suffix)).map(entry => join(dir, entry).replaceAll('\\', '/'))
  } catch {
    return []
  }
}

async function main() {
  const pkg = await readJson('package.json')

  // --- manifest basics
  check('package.json name', pkg.name === 'dsh-shadertoy-skin', `got ${pkg.name}`)
  check('package.json version', /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(pkg.version)), `got ${pkg.version}`)
  check('license is MIT', pkg.license === 'MIT', `got ${pkg.license}`)
  check('type is module', pkg.type === 'module')
  check('engines.node >= 22.14.0', String(pkg.engines?.node ?? '').includes('22.14'), `got ${pkg.engines?.node}`)
  check('private is not true', pkg.private !== true)

  // Trusted publishing requires repository.url to match the GitHub repository exactly.
  const repoUrl = String(pkg.repository?.url ?? '')
  check('repository.url is a github url', /^git\+https:\/\/github\.com\/[^/]+\/[^/]+\.git$/.test(repoUrl), repoUrl)
  const githubRepo = process.env.GITHUB_REPOSITORY
  if (githubRepo) {
    check(
      'repository.url matches GITHUB_REPOSITORY',
      repoUrl.includes(`github.com/${githubRepo}.git`),
      `package.json=${repoUrl} GITHUB_REPOSITORY=${githubRepo}`,
    )
  }

  // --- DSH bundle contract
  check('dsh.bundle.patch declared', pkg.dsh?.bundle?.patch === './cordis.patch.yml', `got ${pkg.dsh?.bundle?.patch}`)
  check('dsh.client.platform is web', pkg.dsh?.client?.platform === 'web', `got ${pkg.dsh?.client?.platform}`)
  check('dsh.client.immediately is true', pkg.dsh?.client?.immediately === true)
  check('exports ./client', pkg.exports?.['./client'] === './client.js')
  check('main entry', pkg.main === 'index.js')

  // --- declared files exist
  const declared = [pkg.main, pkg.exports?.['.'], pkg.exports?.['./client'], pkg.dsh?.bundle?.patch?.replace(/^\.\//, '')]
    .filter(value => typeof value === 'string' && !value.includes('*'))
  for (const rel of new Set(declared)) {
    check(`declared file exists: ${rel}`, existsSync(join(ROOT, rel)))
  }
  const packagedFiles = []
  for (const pattern of pkg.files ?? []) packagedFiles.push(...await expand(pattern))
  check('files list is non-empty', packagedFiles.length > 0)
  for (const rel of packagedFiles) {
    check(`packaged file exists: ${rel}`, existsSync(join(ROOT, rel)))
  }

  // --- patch must not leak the author's machine
  const patch = await readFile(join(ROOT, 'cordis.patch.yml'), 'utf8')
  check('patch inserts our row', /id:\s*shadertoy-skin/.test(patch) && /name:\s*dsh-shadertoy-skin/.test(patch))
  check('patch has no absolute path', !/[A-Za-z]:[\\/]|\/home\/|\/Users\/|file:\/\//.test(patch))

  // --- presets integrity + licence hygiene
  const manifest = await readJson('native-dist/presets/index.json')
  check('preset manifest is a non-empty array', Array.isArray(manifest) && manifest.length > 0)
  // Bundled ShaderToy works are allowed, but only under a licence that permits
  // redistribution — and then attribution + licence/source links are mandatory.
  const ALLOWED_PRESET_LICENCES = new Set(['MIT', 'CC BY-NC-SA 3.0'])
  const presetLicences = new Map()
  for (const item of manifest) {
    check(`preset ${item.id}: id/file/license`, Boolean(item.id && item.file && ALLOWED_PRESET_LICENCES.has(item.license)), JSON.stringify(item))
    const file = join('native-dist/presets', item.file).replaceAll('\\', '/')
    check(`preset ${item.id}: file exists`, existsSync(join(ROOT, file)), file)
    presetLicences.set(file, item.license)
    check(`preset ${item.id}: not a dev fixture`, !String(item.id).startsWith('_') && !String(item.file).startsWith('_'))
    check(`preset ${item.id}: hasSound is boolean`, typeof item.hasSound === 'boolean', String(item.hasSound))
    if (item.license === 'CC BY-NC-SA 3.0') {
      check(`preset ${item.id}: third-party work credits its author`, typeof item.author === 'string' && item.author.trim() !== '', String(item.author))
      check(`preset ${item.id}: third-party work links the CC licence`, /^https:\/\/creativecommons\.org\/licenses\/by-nc-sa\/3\.0\/?$/.test(String(item.licenseUrl ?? '')), String(item.licenseUrl))
      check(`preset ${item.id}: third-party work links its source`, /^https:\/\//.test(String(item.sourceUrl ?? '')), String(item.sourceUrl))
      check(`preset ${item.id}: file carries the CC licence notice`, /Attribution-NonCommercial-ShareAlike 3\.0/.test(await readFile(join(ROOT, file), 'utf8')))
    }
    if (item.soundFile !== undefined) {
      const soundFile = join('native-dist/presets', item.soundFile).replaceAll('\\', '/')
      check(`preset ${item.id}: sound file exists`, existsSync(join(ROOT, soundFile)), soundFile)
      presetLicences.set(soundFile, item.license)
      check(`preset ${item.id}: soundFile implies hasSound`, item.hasSound === true)
      if (item.license === 'CC BY-NC-SA 3.0') {
        check(`preset ${item.id}: sound file carries the CC licence notice`, /Attribution-NonCommercial-ShareAlike 3\.0/.test(await readFile(join(ROOT, soundFile), 'utf8')))
      }
    }
    if (item.hasSound === true) check(`preset ${item.id}: declares a sound file`, typeof item.soundFile === 'string')
  }

  const localContentPatterns = [/[A-Za-z]:\\/, /file:\/\/\//]
  const shadertoyView = /(?:www\.)?shadertoy\.com\/(?:view|embed)\//i
  for (const rel of packagedFiles.filter(file => file.endsWith('.glsl') || file.endsWith('.html') || file.endsWith('.js'))) {
    const text = await readFile(join(ROOT, rel), 'utf8')
    for (const pattern of localContentPatterns) {
      check(`no local paths in ${rel} (${pattern})`, !pattern.test(text))
    }
    if (shadertoyView.test(text)) {
      check(`${rel}: Shadertoy view links only in CC BY-NC-SA presets`,
        presetLicences.get(rel.replaceAll('\\', '/')) === 'CC BY-NC-SA 3.0',
        `license=${presetLicences.get(rel.replaceAll('\\', '/')) ?? 'n/a'}`)
    }
  }
  check('no user-imported presets directory', !existsSync(join(ROOT, 'native-dist/presets/local')))

  // --- what npm would actually publish
  if (!process.argv.includes('--no-pack')) {
    // One shell string instead of an argv array: on Windows npm is a .cmd shim,
    // which cannot be spawned without a shell, and shell+argv is deprecated.
    const packed = spawnSync('npm pack --dry-run --json', { cwd: ROOT, shell: true, encoding: 'utf8' })
    if (packed.error || packed.status !== 0) {
      check('npm pack --dry-run succeeds', false, (packed.stderr ?? packed.error?.message ?? '').slice(0, 400))
    } else {
      let files = []
      try {
        files = JSON.parse(packed.stdout)[0].files.map(file => file.path)
      } catch (error) {
        check('npm pack --dry-run output parses', false, String(error))
      }
      check('npm pack includes player.html', files.includes('native-dist/player.html'))
      check('npm pack includes panel.html', files.includes('native-dist/panel.html'))
      check('npm pack includes defaults.json', files.includes('native-dist/defaults.json'))
      check('npm pack includes cordis.patch.yml', files.includes('cordis.patch.yml'))
      check('npm pack includes both halves', files.includes('index.js') && files.includes('client.js'))
      check('npm pack includes third-party notices', files.includes('THIRD-PARTY-NOTICES.md'))
      check('npm pack includes the bundled third-party presets',
        files.includes('native-dist/presets/seascape.glsl')
        && files.includes('native-dist/presets/mario.glsl')
        && files.includes('native-dist/presets/mario-sound.glsl'))
      check('npm pack excludes dev fixtures', !files.some(file => file.includes('presets/dev/') || file.startsWith('native-dist/presets/_')))
      check('npm pack excludes local presets', !files.some(file => file.includes('presets/local/')))
      check('npm pack excludes docs/tools', !files.some(file => file.startsWith('docs/') || file.startsWith('tools/')))
    }
  }

  for (const { ok, label, detail } of results) {
    if (!ok) console.log(`FAIL  ${label}${detail ? `  (${detail})` : ''}`)
  }
  console.log(`\n${results.length - failures}/${results.length} checks passed`)
  if (failures > 0) {
    console.log('bundle check failed')
    process.exit(1)
  }
  console.log('bundle check ok')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
