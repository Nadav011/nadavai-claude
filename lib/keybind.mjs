#!/usr/bin/env node
// Adds key bindings to one Claude Code keybindings.json and keeps everything
// else in it (Orca writes its own binding into the same file).
//
//   keybind.mjs [--was=<action> ...] <keybindings.json> <Context> <key>=<action> [<key>=<action> ...]
//
// A key the owner already uses wins: when the same key, in any spelling
// (control+p, shift+ctrl+p, Ctrl+P), is bound in a block of that context or of
// Global, or starts a chord there (ctrl+p ctrl+s), it is left as it is and
// named on stdout. The one exception is --was: a key that runs that action in
// a block of this context is the caller's own earlier binding, and is rebound
// to the new action. A file that is not valid JSON, or has another shape, is
// left untouched. Exit code 0 in every case but a wrong call (2).
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const was = new Set()
while (args[0]?.startsWith('--was=')) was.add(args.shift().slice('--was='.length))
const [file, context, ...pairs] = args
if (!file || !context || pairs.length === 0 || pairs.some(p => !/^[^=]+=.+$/.test(p))) {
  console.error('usage: keybind.mjs [--was=<action> ...] <keybindings.json> <Context> <key>=<action> ...')
  process.exit(2)
}

const skip = why => {
  console.log(`  skipped ${why} ${file}`)
  process.exit(0)
}
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v)

// The names Claude Code reads for each modifier, and one spelling per key:
// lower case, modifiers in one order, a chord's strokes separated by one space.
const MODIFIERS = {
  ctrl: 'ctrl', control: 'ctrl',
  alt: 'alt', opt: 'alt', option: 'alt', meta: 'alt',
  shift: 'shift',
  cmd: 'cmd', command: 'cmd', super: 'cmd', win: 'cmd',
}
const stroke = text => {
  const parts = text.toLowerCase().split('+').map(p => p.trim())
  const key = parts.pop()
  const mods = [...new Set(parts.map(p => MODIFIERS[p] ?? p))].sort()

  return [...mods, key].join('+')
}
const spell = chord => chord.trim().split(/\s+/).map(stroke).join(' ')

let raw = null
try {
  raw = fs.readFileSync(file, 'utf8')
} catch (e) {
  if (e.code !== 'ENOENT') throw e
  // A link that points nowhere is somebody's setup, not a missing file.
  if (fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink()) skip('dangling link')
}

let doc = { bindings: [] }
if (raw !== null) {
  try {
    doc = JSON.parse(raw)
  } catch {
    skip('unreadable')
  }
  if (!isObject(doc)) skip('unreadable')
  if (doc.bindings === undefined) doc.bindings = []
  if (!Array.isArray(doc.bindings)) skip('unreadable')
  if (doc.bindings.some(b => !isObject(b) || (b.bindings !== undefined && !isObject(b.bindings)))) skip('unreadable')
}

// Every binding the key could collide with: blocks of this context (in any
// letter case) and of Global, which is active at the prompt too.
const wanted = context.toLowerCase()
const taken = []
for (const block of doc.bindings) {
  const where = typeof block.context === 'string' ? block.context : ''
  if (where.toLowerCase() !== wanted && where.toLowerCase() !== 'global') continue
  for (const [key, action] of Object.entries(block.bindings ?? {})) taken.push({ where, key, action, spelled: spell(key), block })
}

const added = []
let target = doc.bindings.find(b => b.context === context)
for (const pair of pairs) {
  const at = pair.indexOf('=')
  const key = pair.slice(0, at)
  const action = pair.slice(at + 1)
  const spelled = spell(key)
  const hits = taken.filter(t => t.spelled === spelled || t.spelled.startsWith(`${spelled} `))
  if (hits.some(t => t.spelled === spelled && t.action === action)) continue
  // The caller's own earlier binding of this key, and nothing else in its way:
  // the key keeps its place and its spelling, and runs the new action.
  const own = hits.filter(t => t.spelled === spelled && t.where === context && was.has(t.action))
  if (own.length > 0 && own.length === hits.length) {
    for (const t of own) {
      t.block.bindings[t.key] = action
      t.action = action
    }
    added.push(pair)
    continue
  }
  if (hits.length > 0) {
    const t = hits[0]
    console.log(`  kept ${t.key} = ${JSON.stringify(t.action)} (${t.where}) in ${file}; ${key} is not bound to ${action}`)
    continue
  }
  if (!target) {
    target = { context, bindings: {} }
    doc.bindings.push(target)
  }
  if (target.bindings === undefined) target.bindings = {}
  target.bindings[key] = action
  taken.push({ where: context, key, action, spelled })
  added.push(pair)
}

if (added.length === 0) process.exit(0)

// Write beside the real file and rename over it, so a running session never
// reads half a file; keep the file's mode (Orca makes it 600).
const real = raw === null ? file : fs.realpathSync(file)
fs.mkdirSync(path.dirname(real), { recursive: true })
const tmp = `${real}.nadavai-tmp`
fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n', { mode: raw === null ? 0o600 : fs.statSync(real).mode & 0o777 })
fs.renameSync(tmp, real)
console.log(`  bound ${added.join(', ')} in ${file}`)
