#!/usr/bin/env node
/**
 * Push the current working tree to GitHub through the REST API.
 *
 * Why this exists: on some networks `github.com:443` is blocked (TLS reset) while
 * `api.github.com` works, so plain `git push` cannot run. This script builds the
 * same content as one commit via the Git Data API (blobs -> tree -> commit -> ref).
 *
 * Usage:
 *   node tools/push-via-api.mjs [--message "..."] [--branch main] [--dry-run]
 *
 * Auth: `gh auth token` (scopes: repo + workflow; `workflow` is required when the
 * tree contains .github/workflows/*). Requires `gh` to be logged in.
 */
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const args = process.argv.slice(2)
const flag = name => {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}
const message = flag('--message') ?? `chore: sync working tree (${new Date().toISOString()})`
const branch = flag('--branch') ?? 'main'
const dryRun = args.includes('--dry-run')

function sh(command, commandArgs, options = {}) {
  return execFileSync(command, commandArgs, { cwd: ROOT, encoding: 'utf8', ...options })
}

const token = process.env.GH_TOKEN || sh('gh', ['auth', 'token']).trim()
const remote = sh('git', ['remote', 'get-url', 'origin']).trim()
const match = /github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/.exec(remote)
if (!match) throw new Error(`cannot parse owner/repo from origin: ${remote}`)
const [, owner, repo] = match
const api = `https://api.github.com/repos/${owner}/${repo}`

async function call(path, init = {}) {
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  const body = text === '' ? undefined : JSON.parse(text)
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status} ${body?.message ?? text.slice(0, 200)}`)
  return body
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  }))
  return results
}

const tracked = sh('git', ['ls-files', '-z']).split('\0').filter(Boolean)
console.log(`pushing ${tracked.length} files to ${owner}/${repo}#${branch}`)
if (dryRun) {
  for (const file of tracked) console.log(`  ${file}`)
  process.exit(0)
}

let parent
try {
  const ref = await call(`/git/ref/heads/${branch}`)
  parent = ref.object.sha
  console.log(`parent commit: ${parent}`)
} catch (error) {
  const text = String(error)
  // 404: no branch yet. 409 "Git Repository is empty": the repo has no commits at all.
  if (!text.includes('404') && !text.includes('409') && !text.includes('Git Repository is empty')) throw error
  console.log('remote branch does not exist yet, creating the first commit')
}

const blobs = await mapLimit(tracked, 6, async file => {
  const content = await readFile(`${ROOT}/${file}`)
  const blob = await call('/git/blobs', {
    method: 'POST',
    body: JSON.stringify({ content: content.toString('base64'), encoding: 'base64' }),
  })
  return { path: file, mode: '100644', type: 'blob', sha: blob.sha }
})

const tree = await call('/git/trees', {
  method: 'POST',
  body: JSON.stringify({ tree: blobs }),
})

const commit = await call('/git/commits', {
  method: 'POST',
  body: JSON.stringify({
    message,
    tree: tree.sha,
    parents: parent ? [parent] : [],
  }),
})

if (parent) {
  await call(`/git/refs/heads/${branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false }),
  })
} else {
  await call('/git/refs', {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
  })
}

console.log(`pushed commit ${commit.sha}`)
console.log(`https://github.com/${owner}/${repo}/commit/${commit.sha}`)
