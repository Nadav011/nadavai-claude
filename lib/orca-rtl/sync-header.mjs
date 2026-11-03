#!/usr/bin/env node
// Make app.asar's header agree with the unpacked files beside it.
// Electron serves an unpacked file through the asar path using the size recorded in
// the header, so a file that grew on disk is cut off at the old size. On 1.4.246 the
// RTL patch added 491 bytes to the terminal bundle and every Orca start showed a white
// window (SyntaxError: Unexpected end of input). Run this after any in-place edit or
// restore of a file under app.asar.unpacked. Usage: sync-header.mjs [--check] [asar]
// The header is rewritten in place only when its byte length does not change (sizes
// keep their digit count), so no packed file moves; otherwise it refuses and exits 2.
// --check: report mismatches, change nothing, exit 1 when any exist.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const check = args.includes('--check');
const ASAR = args.find(a => !a.startsWith('--')) || '/opt/Orca/resources/app.asar';
const UNPACKED = ASAR + '.unpacked';

const buf = fs.readFileSync(ASAR);
// Pickle layout: u32 4 | u32 headerPickleSize | u32 payloadSize | u32 strLen | header JSON
const pickleSize = buf.readUInt32LE(4);
const strLen = buf.readUInt32LE(12);
const oldStr = buf.subarray(16, 16 + strLen).toString('utf8');
const header = JSON.parse(oldStr);

const changed = [];
(function walk(node, rel) {
  if (node.files) { for (const [k, c] of Object.entries(node.files)) walk(c, rel ? rel + '/' + k : k); return; }
  if (!node.unpacked) return;
  const file = path.join(UNPACKED, rel);
  if (!fs.existsSync(file)) return;
  const data = fs.readFileSync(file);
  const bs = node.integrity?.blockSize || 4 * 1024 * 1024;
  const sha = b => crypto.createHash('sha256').update(b).digest('hex');
  const blocks = [];
  for (let i = 0; i < Math.max(data.length, 1); i += bs) blocks.push(sha(data.subarray(i, i + bs)));
  if (node.size === data.length && (!node.integrity || node.integrity.hash === sha(data))) return;
  changed.push(rel + ' (' + node.size + ' -> ' + data.length + ')');
  node.size = data.length;
  if (node.integrity) { node.integrity.hash = sha(data); node.integrity.blocks = blocks; }
})(header, '');

if (!changed.length) { console.log('[orca-rtl] asar header matches the unpacked files'); process.exit(0); }
for (const c of changed) console.log('[orca-rtl] header ' + (check ? 'mismatch: ' : 'update: ') + c);
if (check) process.exit(1);

const newStr = JSON.stringify(header);
if (Buffer.byteLength(newStr) !== strLen) {
  console.error('[orca-rtl] ERROR: header length would change (' + strLen + ' -> ' + Buffer.byteLength(newStr) + '); not writing. Restore the originals with orca-rtl-remove.');
  process.exit(2);
}
const out = Buffer.from(buf);
out.write(newStr, 16, 'utf8');
if (out.readUInt32LE(4) !== pickleSize) throw new Error('pickle size changed');

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-rtl-hdr-'));
const tmp = path.join(work, 'app.asar');
fs.writeFileSync(tmp, out);
// Sibling then rename: a running Orca keeps its open inode and never sees a half-written file.
execFileSync('sudo', ['install', '-m', '644', tmp, ASAR + '.orca-rtl-new']);
execFileSync('sudo', ['mv', '-f', ASAR + '.orca-rtl-new', ASAR]);
fs.rmSync(work, { recursive: true, force: true });
console.log('[orca-rtl] asar header updated for ' + changed.length + ' file(s)');
