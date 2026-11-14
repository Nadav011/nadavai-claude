#!/usr/bin/env node
// Adds key bindings to one Claude Code keybindings.json and keeps everything
// else in it (Orca writes its own binding into the same file).
//
//   keybind.mjs <keybindings.json> <Context> <key>=<action> [<key>=<action> ...]
//
// A key that already runs something else in that context is left as it is and
// named on stdout: the person's own choice wins. A file that is not valid JSON
// is left untouched. Exit code 0 in every case but a wrong call (2).
import fs from 'node:fs'
import path from 'node:path'

const [file, context, ...pairs] = process.argv.slice(2)
if (!file || !context || pairs.length === 0 || pairs.some(p => !/^[^=]+=.+$/.test(p))) {
  console.error('usage: keybind.mjs <keybindings.json> <Context> <key>=<action> ...')
  process.exit(2)
}

let raw = null
try {
  raw = fs.readFileSync(file, 'utf8')
} catch (e) {
  if (e.code !== 'ENOENT') throw e
}

let doc = { bindings: [] }
if (raw !== null) {
  try {
    doc = JSON.parse(raw)
  } catch {
    console.log(`  skipped unreadable ${file}`)
    process.exit(0)
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    console.log(`  skipped unreadable ${file}`)
    process.exit(0)
  }
  if (doc.bindings === undefined) doc.bindings = []
  if (!Array.isArray(doc.bindings)) {
    console.log(`  skipped unreadable ${file}`)
    process.exit(0)
  }
}

let block = doc.bindings.find(b => b && b.context === context)
if (!block) {
  block = { context, bindings: {} }
  doc.bindings.push(block)
}
if (!block.bindings || typeof block.bindings !== 'object') block.bindings = {}

// Claude Code reads key names without regard to case.
const held = new Map(Object.keys(block.bindings).map(k => [k.toLowerCase(), k]))
for (const pair of pairs) {
  const at = pair.indexOf('=')
  const key = pair.slice(0, at)
  const action = pair.slice(at + 1)
  const existing = held.get(key.toLowerCase())
  if (existing !== undefined && block.bindings[existing] !== action) {
    console.log(`  kept ${existing} = ${block.bindings[existing]} in ${file} (not bound to ${action})`)
    continue
  }
  if (existing === undefined) block.bindings[key] = action
}

const next = JSON.stringify(doc, null, 2) + '\n'
if (next === raw) process.exit(0)

// Write beside the real file and rename over it, so a running session never
// reads half a file; keep the file's mode (Orca makes it 600).
const real = raw === null ? file : fs.realpathSync(file)
fs.mkdirSync(path.dirname(real), { recursive: true })
const tmp = `${real}.nadavai-tmp`
fs.writeFileSync(tmp, next, { mode: raw === null ? 0o600 : fs.statSync(real).mode & 0o777 })
fs.renameSync(tmp, real)
console.log(`  bound ${pairs.join(', ')} in ${file}`)
