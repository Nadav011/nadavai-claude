// WAHA linking page: https://waha.nadavc.ai/link/<token>. A client opens a one-time link and links its WhatsApp to the
// WAHA session by scanning the QR or with the 8-character pairing code. No WAHA key ever reaches the browser, and this
// service holds no admin key: each token carries a key scoped to its one session (read, control, setting), made by
// `ADMIN_KEY=… node server.mjs new <session> <label> <expected phone> [hours]`, run by the operator.
// Safety (REVIEW-1 R4): the code is requested only for the token's expected number; after linking, the linked number is
// compared with it and a different phone is logged out at once; a session that already works is never relinked.
// Plain Node 22, no dependencies.
import { randomBytes } from "node:crypto";
import { createReadStream, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const WAHA = process.env.WAHA_INTERNAL_URL ?? "http://127.0.0.1:3000";
const DATA = process.env.LINK_DATA ?? "/data";
const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "0.0.0.0";
const TOKENS = `${DATA}/tokens.json`;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;
const PHONE_RE = /^972\d{8,9}$/;

export function normalizePhone(raw) {
	const d = String(raw ?? "").replace(/\D/g, "");
	const p = d.startsWith("0") ? `972${d.slice(1)}` : d;
	return PHONE_RE.test(p) ? p : null;
}
/** The digits of a WhatsApp id such as "972501234567@c.us" or "972501234567:12@s.whatsapp.net". */
export function idDigits(id) {
	const m = String(id ?? "").match(/^(\d+)/);
	return m ? m[1] : null;
}
export function maskPhone(p) {
	return `…${String(p).slice(-4)}`;
}

function load() {
	return existsSync(TOKENS) ? JSON.parse(readFileSync(TOKENS, "utf8")) : {};
}
function save(t) {
	writeFileSync(`${TOKENS}.tmp`, JSON.stringify(t, null, 2), { mode: 0o600 });
	renameSync(`${TOKENS}.tmp`, TOKENS);
}
function update(token, patch) {
	const all = load();
	all[token] = { ...all[token], ...patch };
	save(all);
}
function live(token) {
	if (!TOKEN_RE.test(token)) return null;
	const t = load()[token];
	if (!t || t.usedAt || !t.key || Date.parse(t.expiresAt) < Date.now()) return null;
	return t;
}
async function waha(key, path, init = {}) {
	return fetch(`${WAHA}${path}`, {
		...init,
		headers: { "X-Api-Key": key, Accept: "application/json", "Content-Type": "application/json", ...(init.headers ?? {}) },
		signal: AbortSignal.timeout(15_000),
	});
}
const S = (name) => encodeURIComponent(name);
async function sessionStatus(key, name) {
	const r = await waha(key, `/api/sessions/${S(name)}`);
	if (!r.ok) return { status: "UNKNOWN", me: null, config: null };
	const b = await r.json();
	return { status: b.status, me: b.me?.id ?? null, config: b.config ?? {} };
}
// metadata.linking = "<epoch seconds>": until then the watchdog expects SCAN_QR_CODE/STARTING/FAILED (someone is
// linking); after it, it alerts again, so an unfinished link never silences a session for good (REVIEW-1 L2).
// metadata.expectedPhone: the number this session must be linked to; the watchdog alerts on any other (L1).
async function setLinking(key, name, untilEpoch, expectedPhone) {
	const s = await sessionStatus(key, name);
	if (s.config === null) return false;
	const metadata = { ...(s.config.metadata ?? {}) };
	if (untilEpoch) metadata.linking = String(untilEpoch);
	else delete metadata.linking;
	if (expectedPhone) metadata.expectedPhone = expectedPhone;
	const u = await waha(key, `/api/sessions/${S(name)}`, { method: "PUT", body: JSON.stringify({ name, config: { ...s.config, metadata } }) });
	return u.ok;
}
async function ensureStarted(key, name) {
	const s = await sessionStatus(key, name);
	if (s.status === "STOPPED" || s.status === "FAILED") {
		await waha(key, `/api/sessions/${S(name)}/start`, { method: "POST" });
	}
	return s.status;
}
// WhatsApp rate-limits codes; one per token per 60 s here.
const lastCode = new Map();
const PAGE = readFileSync(new URL("./page.html", import.meta.url), "utf8");

function page(state, t) {
	const esc = (v) => String(v ?? "").replace(/[<>&"']/g, "");
	return PAGE.replace("__STATE__", state)
		.replace(/__LABEL__/g, t ? esc(t.label) : "")
		.replace(/__PHONE__/g, t ? esc(String(t.phone).slice(-4)) : "");
}
function send(res, status, body, type = "application/json; charset=utf-8") {
	res.writeHead(status, {
		"Content-Type": type,
		"Cache-Control": "no-store",
		"X-Robots-Tag": "noindex, nofollow",
		"Referrer-Policy": "no-referrer",
		"X-Frame-Options": "DENY",
		"Content-Security-Policy":
			"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'",
	});
	res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
const HTML = "text/html; charset=utf-8";

// Media files (REVIEW: WAHA's /api/files is not scoped by session, so any session key could read another session's
// files). Caddy sends /api/files/* here: the presented key must be allowed to read that session (WAHA answers 403 to
// another session's key on GET /api/sessions/{session}), then the file is streamed from the read-only media mount.
const MEDIA = process.env.MEDIA_DIR ?? "/media";
const FILE_RE = /^\/api\/files\/([A-Za-z0-9_-]{1,64})\/([A-Za-z0-9._-]{1,200})$/;
const TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", mp4: "video/mp4",
	oga: "audio/ogg", ogg: "audio/ogg", opus: "audio/ogg", mp3: "audio/mpeg", m4a: "audio/mp4", pdf: "application/pdf" };
async function serveFile(req, res, session, file) {
	const key = String(req.headers["x-api-key"] ?? "");
	if (!key || file.includes("..")) return send(res, 401, { error: "key" });
	const r = await waha(key, `/api/sessions/${S(session)}`);
	if (!r.ok) return send(res, r.status === 404 ? 404 : 403, { error: "forbidden" });
	const path = `${MEDIA}/${session}/${file}`;
	if (!existsSync(path)) return send(res, 404, { error: "not found" });
	const ext = file.split(".").pop().toLowerCase();
	res.writeHead(200, { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
	createReadStream(path).pipe(res);
}

const server = createServer(async (req, res) => {
	try {
		const url = new URL(req.url, "http://x");
		const f = req.method === "GET" ? url.pathname.match(FILE_RE) : null;
		if (f) return await serveFile(req, res, f[1], f[2]);
		const m = url.pathname.match(/^\/link\/([^/]+)(\/qr|\/status|\/code)?$/);
		if (!m) return send(res, 404, "not found", "text/plain");
		const [, token, sub] = m;
		const t = live(token);
		if (!t) return sub ? send(res, 410, { error: "expired" }) : send(res, 410, page("expired"), HTML);
		const { session: name, key } = t;
		if (!sub && req.method === "GET") {
			const before = await sessionStatus(key, name);
			if (before.status === "WORKING") {
				// Never relink a working session from a link (R4); if it is the expected number, the link is spent.
				if (idDigits(before.me) === t.phone && (await setLinking(key, name, null))) {
					update(token, { usedAt: new Date().toISOString(), linkedTo: before.me });
				}
				return send(res, 200, page("already", t), HTML);
			}
			await ensureStarted(key, name);
			return send(res, 200, page("open", t), HTML);
		}
		if (sub === "/status" && req.method === "GET") {
			const s = await sessionStatus(key, name);
			if (s.status === "WORKING") {
				if (idDigits(s.me) !== t.phone) {
					// A different phone linked: log it out at once so no bot ever answers its contacts.
					await waha(key, `/api/sessions/${S(name)}/logout`, { method: "POST" });
					update(token, { wrongAt: new Date().toISOString(), wrongCount: (t.wrongCount ?? 0) + 1 });
					console.error(`wrong number linked on ${name}; logged out`);
					await ensureStarted(key, name);
					return send(res, 200, { status: "WRONG", linked: false, wrongNumber: true });
				}
				// The token is spent only once the linking flag is cleared, so a failed clear is retried on the next poll.
				if (!(await setLinking(key, name, null))) {
					return send(res, 200, { status: "FINISHING", linked: false });
				}
				update(token, { usedAt: new Date().toISOString(), linkedTo: s.me });
				return send(res, 200, { status: s.status, linked: true });
			}
			if (s.status === "STOPPED" || s.status === "FAILED") await ensureStarted(key, name);
			return send(res, 200, { status: s.status, linked: false });
		}
		if (sub === "/qr" && req.method === "GET") {
			const r = await waha(key, `/api/${S(name)}/auth/qr?format=image`, { headers: { Accept: "image/png" } });
			if (!r.ok) return send(res, 409, { error: "no-qr" });
			return send(res, 200, Buffer.from(await r.arrayBuffer()), "image/png");
		}
		if (sub === "/code" && req.method === "POST") {
			const prev = lastCode.get(token) ?? 0;
			if (Date.now() - prev < 60_000) {
				return send(res, 429, { error: "wait", seconds: Math.ceil((60_000 - (Date.now() - prev)) / 1000) });
			}
			lastCode.set(token, Date.now());
			// Only the token's expected number; the browser cannot choose another (R4).
			const r = await waha(key, `/api/${S(name)}/auth/request-code`, { method: "POST", body: JSON.stringify({ phoneNumber: t.phone }) });
			const b = await r.json().catch(() => null);
			if (!r.ok || typeof b?.code !== "string") return send(res, 502, { error: "no-code" });
			return send(res, 200, { code: b.code });
		}
		return send(res, 405, { error: "method" });
	} catch (e) {
		console.error("link error", e?.name ?? "error");
		return send(res, 500, { error: "server" });
	}
});

async function newToken() {
	const [, , , session, label, rawPhone, hours = "24"] = process.argv;
	const admin = process.env.ADMIN_KEY ?? "";
	const phone = normalizePhone(rawPhone);
	if (!session || !label || !phone || !admin) {
		console.error("usage: ADMIN_KEY=… node server.mjs new <session> <label> <expected phone> [hours]");
		process.exit(2);
	}
	const s = await sessionStatus(admin, session);
	if (s.config === null) {
		console.error(`session ${session} not found in WAHA: create it first`);
		process.exit(3);
	}
	if (s.status === "WORKING") {
		console.error(`session ${session} already works (${maskPhone(idDigits(s.me))}): no link made`);
		process.exit(4);
	}
	const k = await waha(admin, "/api/keys", {
		method: "POST",
		body: JSON.stringify({ isAdmin: false, session, isActive: true, actions: { read: true, control: true, setting: true } }),
	});
	const kb = await k.json().catch(() => null);
	if (!k.ok || typeof kb?.key !== "string") {
		console.error("could not make the session key");
		process.exit(5);
	}
	const expires = Date.now() + Number(hours) * 3600_000;
	if (!(await setLinking(admin, session, Math.floor(expires / 1000), phone))) {
		console.error("could not set the linking flag");
		process.exit(6);
	}
	const token = randomBytes(24).toString("base64url");
	const all = load();
	all[token] = {
		session,
		label,
		phone,
		key: kb.key,
		keyId: kb.id,
		createdAt: new Date().toISOString(),
		expiresAt: new Date(expires).toISOString(),
	};
	save(all);
	console.log(`https://waha.nadavc.ai/link/${token}`);
}

/** Operator: delete the session keys of spent or expired tokens and drop tokens older than 30 days. */
async function cleanup() {
	const admin = process.env.ADMIN_KEY ?? "";
	if (!admin) {
		console.error("usage: ADMIN_KEY=… node server.mjs cleanup");
		process.exit(2);
	}
	const all = load();
	let deleted = 0;
	for (const [token, t] of Object.entries(all)) {
		const over = t.usedAt || Date.parse(t.expiresAt) < Date.now();
		if (over && t.keyId && !t.keyDeletedAt) {
			const r = await waha(admin, `/api/keys/${encodeURIComponent(t.keyId)}`, { method: "DELETE" });
			if (r.ok || r.status === 404) {
				t.keyDeletedAt = new Date().toISOString();
				delete t.key;
				deleted++;
			}
		}
		if (over && Date.parse(t.expiresAt) < Date.now() - 30 * 86400_000) delete all[token];
	}
	// Re-read right before saving and apply only this run's changes, so a link made or spent meanwhile is kept.
	const fresh = load();
	for (const [token, t] of Object.entries(all)) {
		if (fresh[token] && t.keyDeletedAt) {
			fresh[token].keyDeletedAt = t.keyDeletedAt;
			delete fresh[token].key;
		}
	}
	for (const token of Object.keys(fresh)) {
		const t = fresh[token];
		if (!(token in all) && (t.usedAt || Date.parse(t.expiresAt) < Date.now()) && Date.parse(t.expiresAt) < Date.now() - 30 * 86400_000) delete fresh[token];
	}
	save(fresh);
	console.log(`keys deleted: ${deleted}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain && process.argv[2] === "new") {
	await newToken();
} else if (isMain && process.argv[2] === "cleanup") {
	await cleanup();
} else if (isMain) {
	server.listen(PORT, HOST, () => console.log(`waha-link on ${HOST}:${PORT}`));
}
