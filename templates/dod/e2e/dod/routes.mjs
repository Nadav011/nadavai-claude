#!/usr/bin/env node
// Enumerate every route of the app and keep e2e/dod/routes.json complete.
//
//   node e2e/dod/routes.mjs            write routes.json (merges: keeps extra entries you added)
//   node e2e/dod/routes.mjs --check    exit 1 if the app has routes routes.json does not cover
//
// Detects Next app router (app/**/page.tsx), Next pages router (pages/**) and,
// in a Vite app, React Router (<Route path="..."> and { path: "..." } inside a
// createBrowserRouter / useRoutes file). Dynamic segments take a sample value
// from e2e/dod/route-params.json, e.g. { "id": "1", "slug": "demo" }.
//
// One app usually reuses the same param name for unrelated entities — an app
// where /admin/bookings/[id] wants a booking and /receipt/[id] wants a receipt
// cannot be described by a single "id". So a key that looks like a route
// pattern carries its own values and wins over the bare name:
//
//   { "id": "1", "/receipt/[id]": { "id": "70000000-..." } }
//
// A segment with no sample is a hard error in --check, not a note: an
// unmeasured page is never a passing page, and a skipped route is invisible
// in the score precisely because it never appears in it.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIR = path.join(ROOT, "e2e", "dod");
const OUT = path.join(DIR, "routes.json");
const PARAMS = path.join(DIR, "route-params.json");
const params = fs.existsSync(PARAMS) ? JSON.parse(fs.readFileSync(PARAMS, "utf8")) : {};
/**
 * Routes the gate must not measure, with the reason beside each one in
 * route-params.json under `_exclude`. Two kinds qualify, and only two:
 *   * a route that cannot exist in the build under test — a development-only
 *     screen, when the gate measures a production build;
 *   * a bare path whose real screen needs a query parameter, where that
 *     parameterised entry is already in the list.
 * Anything else belongs in the score. An exclusion is a decision someone has to
 * read, which is why it lives in the file with its reason rather than in code.
 */
const EXCLUDE = new Set(Object.keys(params._exclude ?? {}));
const skipped = [];
const MISSING = "%%MISSING%%";
const SKIP_FILE = /\.(test|spec|stories|d)\.[tj]sx?$/;
const SKIP_DIR = /^(node_modules|\.next|dist|build|__tests__|__mocks__|e2e|tests)$/;

const walk = (dir, acc = []) => {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIR.test(e.name)) walk(p, acc);
    } else if (!SKIP_FILE.test(e.name)) acc.push(p);
  }
  return acc;
};

/** Per-route values win over the bare param name; see the note at the top. */
const sampleFor = (route, key) => {
  const scoped = params[route];
  if (scoped && typeof scoped === "object" && scoped[key] !== undefined) return scoped[key];
  const bare = params[key];
  return typeof bare === "object" ? undefined : bare;
};

const fill = (route, source) => {
  const out = route.replace(/\[{1,2}\.{0,3}(\w+)\]{1,2}|:(\w+)\??/g, (_m, a, b) => {
    const key = a || b;
    const v = sampleFor(route, key);
    if (v === undefined) {
      skipped.push(`${route}  (no sample for "${key}"; add it to route-params.json)  <- ${source}`);
      return MISSING;
    }
    return v;
  });
  return out.includes(MISSING) ? null : out || "/";
};

// A route path, not prose: no spaces, no angle brackets, not a file path or URL.
const looksLikeRoute = (v) =>
  v.length > 0 &&
  v.length < 120 &&
  !/[\s<>{}]/.test(v) &&
  !/^https?:/.test(v) &&
  !/\.(tsx?|jsx?|css|json|png|svg)$/.test(v);

const routes = new Set();
const add = (r, src) => {
  if (!looksLikeRoute(r)) return;
  const f = fill(r.startsWith("/") ? r : "/" + r, src);
  if (f) routes.add(f);
};

// Next app router: app/**/page.*; (groups), @slots and _private do not appear in the URL.
for (const base of ["app", "src/app"]) {
  for (const f of walk(path.join(ROOT, base))) {
    if (!/[\\/]page\.(tsx|ts|jsx|js)$/.test(f)) continue;
    const rel = path.relative(path.join(ROOT, base), path.dirname(f));
    const segs = rel
      .split(path.sep)
      .filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith("@") && !s.startsWith("_"))
      // Intercepting routes — (.)[id], (..)foo, (...)bar — are not URLs of their
      // own: they render at the path they intercept, which the normal page
      // already contributes. Strip the marker and let the Set dedupe.
      .map((s) => s.replace(/^(\(\.{1,3}\))+/, ""))
      .filter(Boolean);
    add("/" + segs.join("/"), path.relative(ROOT, f));
  }
}

// Next pages router. Only in a Next project: in a Vite app `src/pages/` holds components, not routes.
const pkg = fs.existsSync(path.join(ROOT, "package.json"))
  ? JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"))
  : {};
const isNext = Boolean({ ...pkg.dependencies, ...pkg.devDependencies }.next);
for (const base of isNext ? ["pages", "src/pages"] : []) {
  for (const f of walk(path.join(ROOT, base))) {
    if (!/\.(tsx|ts|jsx|js)$/.test(f) || /[\\/](_app|_document|api[\\/])/.test(f)) continue;
    const rel = path
      .relative(path.join(ROOT, base), f)
      .replace(/\.(tsx|ts|jsx|js)$/, "")
      .replace(/[\\/]index$/, "");
    add("/" + rel.split(path.sep).join("/"), path.relative(ROOT, f));
  }
}

// React Router in a Vite app: JSX <Route path="x"> anywhere, object routes only in a router file.
if (!routes.size) {
  for (const f of walk(path.join(ROOT, "src"))) {
    if (!/\.(tsx|jsx|ts|js)$/.test(f)) continue;
    const src = fs.readFileSync(f, "utf8");
    const rel = path.relative(ROOT, f);
    if (/<Route\b/.test(src)) {
      for (const m of src.matchAll(/<Route[^>]*\spath=["'`]([^"'`]+)["'`]/g)) add(m[1], rel);
    }
    if (/createBrowserRouter|createHashRouter|createMemoryRouter|useRoutes/.test(src)) {
      for (const m of src.matchAll(/\bpath:\s*["'`]([^"'`]+)["'`]/g)) add(m[1], rel);
    }
  }
}
routes.delete("/*");

const found = [...routes].filter((r) => !EXCLUDE.has(r)).sort();
const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : [];
const covered = (r) => existing.some((e) => e === r || e.startsWith(r + "?"));
const missing = found.filter((r) => !covered(r));

if (process.argv.includes("--check")) {
  if (skipped.length) {
    console.error(`dod-routes: ${skipped.length} dynamic route(s) have no sample value:`);
    for (const s of skipped) console.error("  " + s);
    console.error("A route with no sample is never measured, so it silently sits outside the score.");
    process.exit(1);
  }
  if (missing.length) {
    console.error(
      `dod-routes: ${missing.length} route(s) of the app are missing from e2e/dod/routes.json:\n  ` +
        missing.join("\n  "),
    );
    console.error("Run `node e2e/dod/routes.mjs` to add them. The DoD score must cover every screen.");
    process.exit(1);
  }
  console.log(`dod-routes: ${found.length} app routes, all covered by routes.json (${existing.length} entries).`);
  process.exit(0);
}

// Write every app route, keeping extra entries already there (state variants such as "?state=error").
const merged = [...new Set([...found, ...existing])].filter((r) => !EXCLUDE.has(r)).sort();
fs.writeFileSync(OUT, JSON.stringify(merged, null, 2) + "\n");
for (const s of skipped) console.log("skipped " + s);
console.log(
  `dod-routes: wrote ${merged.length} entries to e2e/dod/routes.json (${found.length} app routes, ${merged.length - found.length} extra).`,
);
