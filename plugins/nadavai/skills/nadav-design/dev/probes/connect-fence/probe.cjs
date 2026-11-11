// What does a fence at net.Socket.prototype.connect cover in Node?
//   node probe.cjs            (it starts itself again with the preload in NODE_OPTIONS)
// The "outside" target is 127.0.0.2, a loopback address the fence does not allow, with a listener on it, so
// nothing leaves the host and an unfenced connection shows as REACHED.
const { spawnSync, spawn, fork } = require('node:child_process');
const path = require('node:path');

const PRELOAD = path.join(__dirname, 'preload.cjs');
const ALLOWED = 47301; // the "fake backend": a server this probe starts
const OTHER = 47302; // another loopback port, which the fence must refuse
const TARGET = '127.0.0.2';
const TPORT = 47303; // the listener on the outside target

if (!process.env.FENCE_PROBE_CHILD) {
  const r = spawnSync(process.execPath, [__filename], {
    stdio: 'inherit',
    env: { PATH: process.env.PATH, FENCE_PROBE_CHILD: '1', FENCE_PORTS: String(ALLOWED), NODE_OPTIONS: `--require=${PRELOAD}` },
  });
  process.exit(r.status ?? 1);
}

if (process.env.FENCE_PROBE_CHILD === 'grandchild') {
  // A Node child of the server: is it fenced?
  fetch(`http://${TARGET}:${TPORT}/`).then(
    () => console.log(`   ${process.argv[2]}: REACHED (not fenced)`),
    (e) => console.log(`   ${process.argv[2]}: ${/preview fence/.test(String(e.cause && e.cause.message)) ? 'fenced' : 'failed for another reason (' + (e.cause && e.cause.code) + ')'}`),
  );
  return;
}

const http = require('node:http');
const https = require('node:https');
const http2 = require('node:http2');
const net = require('node:net');
const tls = require('node:tls');
const dgram = require('node:dgram');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const run = async (name, fn) => {
  console.log('--', name);
  try {
    await fn();
  } catch (e) {
    console.log('   threw:', e.message);
  }
  await wait(200);
};
const onErr = (done) => (e) => {
  console.log('   error:', e.message);
  if (done) done();
};
const child = (label, start) =>
  new Promise((res) => {
    const c = start();
    c.stdout && c.stdout.on('data', (d) => process.stdout.write(d));
    c.on('exit', res);
    void label;
  });

(async () => {
  console.log('node', process.version, '| allowed loopback port', ALLOWED);
  const backend = http.createServer((_q, s) => s.end('fake backend'));
  await new Promise((r) => backend.listen(ALLOWED, '127.0.0.1', r));
  const other = http.createServer((_q, s) => s.end('other'));
  await new Promise((r) => other.listen(OTHER, '127.0.0.1', r));
  const outside = http.createServer((_q, s) => s.end('outside'));
  await new Promise((r) => outside.listen(TPORT, TARGET, r));

  await run('allowed: http.get to the fake backend', () => new Promise((res) => http.get(`http://127.0.0.1:${ALLOWED}/`, (r) => { console.log('   reached, status', r.statusCode); r.resume(); res(); }).on('error', onErr(res))));
  await run('allowed: fetch to the fake backend', async () => console.log('   reached:', await (await fetch(`http://127.0.0.1:${ALLOWED}/`)).text()));
  await run('another loopback port (http.get)', () => new Promise((res) => http.get(`http://127.0.0.1:${OTHER}/`, (r) => { console.log('   REACHED (not fenced), status', r.statusCode); r.resume(); res(); }).on('error', onErr(res))));
  await run('http.get', () => new Promise((res) => http.get(`http://${TARGET}:${TPORT}/`, (r) => { console.log('   REACHED (not fenced), status', r.statusCode); r.resume(); res(); }).on('error', onErr(res))));
  await run('https.get', () => new Promise((res) => https.get(`https://${TARGET}/`, res).on('error', onErr(res))));
  await run('fetch http', () => fetch(`http://${TARGET}:${TPORT}/`).then(() => console.log('   REACHED (not fenced)')).catch((e) => console.log('   fetch failed |', e.cause && e.cause.message)));
  await run('fetch https', () => fetch(`https://${TARGET}/`).catch((e) => console.log('   fetch failed |', e.cause && e.cause.message)));
  await run('http2.connect', () => { http2.connect(`https://${TARGET}`).on('error', onErr()); });
  await run('net.connect', () => { net.connect({ port: TPORT, host: TARGET }).on('error', onErr()); });
  await run('net.createConnection (as ioredis does)', () => { net.createConnection(TPORT, TARGET).on('error', onErr()); });
  await run('new net.Socket().connect(port, host) (as pg does)', () => { const s = new net.Socket(); s.on('error', onErr()); s.connect(TPORT, TARGET); });
  await run('tls.connect', () => { tls.connect({ port: 443, host: TARGET }).on('error', onErr()); });
  await run('global WebSocket', () => new Promise((res) => { const w = new WebSocket(`ws://${TARGET}:${TPORT}/`); w.onerror = () => { console.log('   error event'); res(); }; }));
  await run('a unix socket path', () => { net.createConnection('/run/nonexistent-preview-probe.sock').on('error', onErr()); });
  await run('UDP (node:dgram)', () => new Promise((res) => { const d = dgram.createSocket('udp4'); d.send('x', 9, TARGET, (e) => { console.log('   ', e ? e.message : 'sent: NOT fenced'); d.close(); res(); }); }));

  console.log('-- Node children of this process (fetch to the outside target)');
  const env = { ...process.env, FENCE_PROBE_CHILD: 'grandchild' };
  await child('a', () => fork(__filename, ['fork, env inherited'], { env, stdio: ['ignore', 'pipe', 'inherit', 'ipc'] }));
  await child('b', () => spawn(process.execPath, [__filename, 'spawn, env inherited'], { env, stdio: ['ignore', 'pipe', 'inherit'] }));
  const bare = { PATH: process.env.PATH, FENCE_PROBE_CHILD: 'grandchild' };
  await child('c', () => spawn(process.execPath, [__filename, 'spawn, env without NODE_OPTIONS'], { env: bare, stdio: ['ignore', 'pipe', 'inherit'] }));

  backend.close();
  other.close();
  outside.close();
  setTimeout(() => process.exit(0), 200);
})();
