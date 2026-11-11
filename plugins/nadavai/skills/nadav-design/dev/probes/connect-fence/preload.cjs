// A connection fence for a preview's server process: refuse every TCP or socket-path connection except to
// the loopback ports named in FENCE_PORTS. Loaded with NODE_OPTIONS=--require=<absolute path>, so Node
// children started with that environment load it too. It is a probe, not a kit: a project's unit 1 writes
// its own and shows its proofs.
const net = require('node:net');

const ALLOW = new Set((process.env.FENCE_PORTS || '').split(',').filter(Boolean).map(Number));
const LOOPBACK = new Set([undefined, 'localhost', '127.0.0.1', '::1']);
const orig = net.Socket.prototype.connect;

net.Socket.prototype.connect = function fencedConnect(...args) {
  // The call shapes: (options[, cb]), (port[, host][, cb]), (path[, cb]), and the normalised
  // [options, cb] array that net.connect and net.createConnection pass on.
  let first = args[0];
  if (Array.isArray(first)) first = first[0];
  let port;
  let host;
  let path;
  if (first && typeof first === 'object') ({ port, host, path } = first);
  else if (typeof first === 'number' || /^\d+$/.test(String(first))) {
    port = Number(first);
    host = typeof args[1] === 'string' ? args[1] : undefined;
  } else path = first;
  const isPath = typeof path === 'string' && path !== '';
  if (isPath || !LOOPBACK.has(host) || !ALLOW.has(Number(port))) {
    const where = isPath ? `path ${path}` : `${host ?? 'localhost'}:${port}`;
    console.log(`   FENCE refused -> ${where}`);
    const err = new Error(`preview fence: connection to ${where} refused`);
    process.nextTick(() => this.destroy(err));
    return this;
  }
  return orig.apply(this, args);
};
