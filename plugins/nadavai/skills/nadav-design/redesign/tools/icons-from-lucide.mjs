// Write the app's own lucide icons as plain SVG files into icons/ (build.py turns each into a sprite symbol).
//
// usage: node icons-from-lucide.mjs <lucide-react dir> <out dir> name[=file] ...
//   <lucide-react dir>  the app's own install, e.g. <app>/node_modules/lucide-react (pnpm: node_modules/.pnpm/
//                       lucide-react@<version>/node_modules/lucide-react); lucide-react ships no SVG files, so the
//                       shapes are read from dist/esm/icons/<name>.mjs (its __iconNode)
//   name=file           write <name> under another file name (the id the sections use: #i-<file>)
// With the lucide-static package instead, copy its icons/<name>.svg files directly. One icon set per demo: the app's.
import fs from 'fs';
import path from 'path';

const [dir, out, ...names] = process.argv.slice(2);
if (!dir || !out || !names.length) {
  console.error('usage: node icons-from-lucide.mjs <lucide-react dir> <out dir> name[=file] ...');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });
const missing = [];
for (const spec of names) {
  const [name, file] = spec.split('=');
  const src = path.join(dir, 'dist/esm/icons', `${name}.mjs`);
  if (!fs.existsSync(src)) { missing.push(name); continue; }
  const m = fs.readFileSync(src, 'utf8').match(/const __iconNode = (\[[\s\S]*?\]);\n/);
  if (!m) { missing.push(name); continue; }
  // the array literal of the app's installed package: [[tag, {attr: value, key}], ...]
  const nodes = Function(`return ${m[1]}`)();
  const esc = v => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const inner = nodes.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${esc(v)}"`).join(' ')}/>`).join('');
  fs.writeFileSync(path.join(out, `${file || name}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>\n`);
}
console.log(`${names.length - missing.length} icons -> ${out}${missing.length ? `; not found: ${missing.join(', ')}` : ''}`);
process.exit(missing.length ? 1 : 0);
