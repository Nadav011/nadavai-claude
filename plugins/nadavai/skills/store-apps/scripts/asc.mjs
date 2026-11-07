// App Store Connect API helper (read and write). Usage:
//   node asc.mjs GET /v1/apps/<id>/builds?limit=5
//   node asc.mjs PATCH /v1/... '<json body>'
//   <command that prints the JSON body> | node asc.mjs PATCH /v1/... @-    (a body carrying a secret)
// Reads ~/.claude/secrets/sporchat-asc.env (ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH). Prints the HTTP
// status, then the body with every demoAccountPassword value replaced by "<set>" or "<empty>", so
// no secret reaches the output. A body with a secret comes on stdin (@-), never on the command line.
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const env = Object.fromEntries(readFileSync(`${process.env.HOME}/.claude/secrets/sporchat-asc.env`, 'utf8').split('\n')
  .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^['"]|['"]$/g, '')]));
const kid = env.ASC_KEY_ID, iss = env.ASC_ISSUER_ID;
const keyPath = env.ASC_KEY_PATH.replace(/^~/, process.env.HOME);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64({ alg: 'ES256', kid, typ: 'JWT' })}.${b64({ iss, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' })}`;
const sig = createSign('SHA256').update(unsigned).sign({ key: readFileSync(keyPath), dsaEncoding: 'ieee-p1363' }, 'base64url');
const token = `${unsigned}.${sig}`;

const [method = 'GET', path, arg] = process.argv.slice(2);
const body = arg === '@-' ? readFileSync(0, 'utf8') : arg;
const r = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
  method, headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body,
});
const text = await r.text();
console.log(r.status);
console.log(text.replace(/("demoAccountPassword"\s*:\s*)("(?:[^"\\]|\\.)*"|null)/g, (_, k, v) => `${k}"${v === 'null' || v === '""' ? '<empty>' : '<set>'}"`));
