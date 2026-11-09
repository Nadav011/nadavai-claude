// Mimics what Orca does before it serves the phone its page bundle: every asset listed in
// out/mobile-web/manifest.json is opened THROUGH the asar path (Electron's asar-aware fs),
// hashed, and compared with the manifest's sha256 and byteLength. A mismatch is the desktop's
// rpc error mobile_web_bundle_asset_changed, and the phone then cannot install the bundle.
// Run it with the app's own Electron in node mode:
//   ELECTRON_RUN_AS_NODE=1 /opt/Orca/orca-ide verify-serve.cjs [/opt/Orca/resources/app.asar]
// Exit 0 = every asset matches, 1 = at least one does not, 2 = could not run.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const path = require('node:path');

const asar = process.argv[2] || '/opt/Orca/resources/app.asar';
const root = path.join(asar, 'out', 'mobile-web');
(async () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  let ok = 0;
  const bad = [];
  for (const a of m.assets) {
    const fh = await fsp.open(path.join(root, a.path), 'r');
    try {
      const h = crypto.createHash('sha256');
      let n = 0;
      for await (const chunk of fh.createReadStream({ autoClose: false })) { h.update(chunk); n += chunk.length; }
      if (h.digest('hex') === a.sha256 && n === a.byteLength) ok++;
      else bad.push(a.path + ' read=' + n + ' want=' + a.byteLength);
    } finally { await fh.close(); }
  }
  console.log('[orca-rtl] phone bundle ' + m.desktopVersion + ' buildId ' + m.buildId.slice(0, 12) + ': ' + ok + '/' + m.assets.length + ' assets match the manifest');
  for (const b of bad) console.log('[orca-rtl]   MISMATCH ' + b);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('[orca-rtl] verify-serve ERROR: ' + e.message); process.exit(2); });
