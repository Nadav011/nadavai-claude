// node --test flow.test.mjs — the link service against a fake WAHA: code only for the expected number, a wrong phone
// is logged out, the right phone spends the token, a working session is never relinked, no admin key in the service.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const fake = { status: "STOPPED", me: null, calls: [], config: { metadata: {} }, putFails: false };
let wahaPort;
let linkPort;
let child;
let srv;
after(() => {
	child?.kill();
	srv?.close();
});
const data = mkdtempSync(join(tmpdir(), "waha-link-"));
const media = mkdtempSync(join(tmpdir(), "waha-media-"));
const SESSION_KEY = "sess-key";

before(async () => {
	srv = createServer(async (req, res) => {
		let body = "";
		for await (const c of req) body += c;
		fake.calls.push({ method: req.method, url: req.url, key: req.headers["x-api-key"], body });
		const j = (code, v) => {
			res.writeHead(code, { "Content-Type": "application/json" });
			res.end(JSON.stringify(v));
		};
		if (req.headers["x-api-key"] !== SESSION_KEY) return j(403, { error: "key" });
		if (req.method === "GET" && req.url === "/api/sessions/s1") return j(200, { name: "s1", status: fake.status, me: fake.me ? { id: fake.me } : null, config: fake.config });
		if (req.method === "PUT" && req.url === "/api/sessions/s1") {
			if (fake.putFails) return j(500, {});
			fake.config = JSON.parse(body).config;
			return j(200, {});
		}
		if (req.method === "POST" && req.url === "/api/sessions/s1/start") {
			fake.status = "SCAN_QR_CODE";
			return j(201, {});
		}
		if (req.method === "POST" && req.url === "/api/sessions/s1/logout") {
			fake.status = "STOPPED";
			fake.me = null;
			return j(201, {});
		}
		if (req.method === "POST" && req.url === "/api/s1/auth/request-code") return j(201, { code: "ABCD1234" });
		return j(404, {});
	});
	await new Promise((r) => srv.listen(0, "127.0.0.1", r));
	wahaPort = srv.address().port;
	mkdirSync(join(media, "s1"));
	writeFileSync(join(media, "s1", "abc.jpg"), "IMG");
	const token = "t".repeat(32);
	writeFileSync(
		join(data, "tokens.json"),
		JSON.stringify({
			[token]: { session: "s1", label: "Test", phone: "972501112222", key: SESSION_KEY, expiresAt: new Date(Date.now() + 3600e3).toISOString() },
		}),
	);
	linkPort = 30000 + Math.floor(Math.random() * 20000);
	child = spawn(process.execPath, [new URL("./server.mjs", import.meta.url).pathname], {
		env: { ...process.env, MEDIA_DIR: media, WAHA_INTERNAL_URL: `http://127.0.0.1:${wahaPort}`, LINK_DATA: data, PORT: String(linkPort), HOST: "127.0.0.1", WAHA_API_KEY: "" },
		stdio: "ignore",
	});
	for (let i = 0; i < 50; i++) {
		try {
			await fetch(`http://127.0.0.1:${linkPort}/link/x`);
			break;
		} catch {
			await new Promise((r) => setTimeout(r, 100));
		}
	}
});

const T = "t".repeat(32);
const L = (p = "") => `http://127.0.0.1:${linkPort}/link/${T}${p}`;

test("opening the page starts the session; every WAHA call uses the session key", async () => {
	const r = await fetch(L());
	assert.equal(r.status, 200);
	const html = await r.text();
	assert.match(html, /שמסתיים ב־<bdi>2222<\/bdi>/);
	assert.doesNotMatch(html, /972501112222/);
	assert.equal(fake.status, "SCAN_QR_CODE");
	assert.ok(fake.calls.every((c) => c.key === SESSION_KEY));
});

test("the code is requested for the expected number only, whatever the browser sends", async () => {
	const r = await fetch(L("/code"), { method: "POST", body: JSON.stringify({ phone: "0509999999" }) });
	assert.equal(r.status, 200);
	assert.equal((await r.json()).code, "ABCD1234");
	const call = fake.calls.findLast((c) => c.url === "/api/s1/auth/request-code");
	assert.deepEqual(JSON.parse(call.body), { phoneNumber: "972501112222" });
	const again = await fetch(L("/code"), { method: "POST" });
	assert.equal(again.status, 429);
});

test("a different phone that links is logged out at once and the link stays usable", async () => {
	fake.status = "WORKING";
	fake.me = "972509999999@c.us";
	const r = await (await fetch(L("/status"))).json();
	assert.equal(r.wrongNumber, true);
	assert.equal(r.linked, false);
	assert.ok(fake.calls.some((c) => c.url === "/api/sessions/s1/logout"));
	assert.equal(JSON.parse(readFileSync(join(data, "tokens.json"), "utf8"))[T].usedAt, undefined);
});

test("a failed clear of the linking flag does not spend the token", async () => {
	fake.status = "WORKING";
	fake.me = "972501112222@c.us";
	fake.putFails = true;
	const r = await (await fetch(L("/status"))).json();
	fake.putFails = false;
	assert.equal(r.linked, false);
	assert.equal(JSON.parse(readFileSync(join(data, "tokens.json"), "utf8"))[T].usedAt, undefined);
});

test("the expected phone spends the token and clears the linking flag", async () => {
	fake.status = "WORKING";
	fake.me = "972501112222@c.us";
	fake.config = { metadata: { linking: "1", app: "x" } };
	const r = await (await fetch(L("/status"))).json();
	assert.equal(r.linked, true);
	assert.deepEqual(fake.config.metadata, { app: "x" });
	assert.ok(JSON.parse(readFileSync(join(data, "tokens.json"), "utf8"))[T].usedAt);
	assert.equal((await fetch(L())).status, 410);
});

test("a token for a session that already works never relinks it", async () => {
	const T2 = "u".repeat(32);
	const all = JSON.parse(readFileSync(join(data, "tokens.json"), "utf8"));
	all[T2] = { session: "s1", label: "Test", phone: "972501112222", key: SESSION_KEY, expiresAt: new Date(Date.now() + 3600e3).toISOString() };
	writeFileSync(join(data, "tokens.json"), JSON.stringify(all));
	fake.status = "WORKING";
	fake.me = "972501112222@c.us";
	const before = fake.calls.length;
	const r = await fetch(`http://127.0.0.1:${linkPort}/link/${T2}`);
	assert.equal(r.status, 200);
	assert.match(await r.text(), /data-state="already"/);
	const made = fake.calls.slice(before);
	assert.ok(made.every((c) => !/\/(start|logout|request-code|auth\/qr)$/.test(c.url)));
	assert.equal(fake.config.metadata.linking, undefined);
});

test("a media file opens only with a key allowed for its own session", async () => {
	const F = `http://127.0.0.1:${linkPort}/api/files/s1/abc.jpg`;
	const ok = await fetch(F, { headers: { "X-Api-Key": SESSION_KEY } });
	assert.equal(ok.status, 200);
	assert.equal(await ok.text(), "IMG");
	assert.equal((await fetch(F, { headers: { "X-Api-Key": "other-session-key" } })).status, 403);
	assert.equal((await fetch(F)).status, 401);
	assert.equal((await fetch(`http://127.0.0.1:${linkPort}/api/files/s1/..%2Fx`, { headers: { "X-Api-Key": SESSION_KEY } })).status, 404);
	assert.equal((await fetch(`http://127.0.0.1:${linkPort}/api/files/s1/missing.jpg`, { headers: { "X-Api-Key": SESSION_KEY } })).status, 404);
});
