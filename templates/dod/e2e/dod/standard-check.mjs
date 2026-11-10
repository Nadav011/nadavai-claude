// The experience standard's static checks (nadav-design `standard/experience.md`, "The
// automated checks"): the ones read from files, not from a page. Called by
// `routes.mjs --check` when e2e/dod/standard.json exists.
//
//   state-coverage   every route not flagged `static` has ?state=empty and ?state=error variants
//   help-route       with `helpDir` set: every such route has a help file, named by its slug
//   brand-assets     PRODUCT.md has a Brand section, and every file path it names exists
//   both-directions  with more than one entry in `languages`: routes.json covers each language
import fs from "node:fs";
import path from "node:path";

/** Same as routeSlug in dod-shared.ts: the report's file name for a route. */
export const routeSlug = (route) =>
  route
    .replace(/^\//, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "root";

const routeOf = (e) => (typeof e === "string" ? e : e.route);
// `static` exempts a page from state-coverage. `noHelp` (a reason) exempts it from the help
// checks; `static: true` with no `noHelp` key is the old form and still exempts both.
const isStatic = (e) => typeof e === "object" && e.static === true;
const noHelp = (e) => typeof e === "object" && (typeof e.noHelp === "string" || (e.static === true && e.noHelp === undefined));

/** "/x?b=2&state=empty" -> { key: "/x?b=2", state: "empty" }: the route a variant belongs to. */
const splitState = (route) => {
  const [p, q = ""] = route.split("?");
  const sp = new URLSearchParams(q);
  const state = sp.get("state");
  sp.delete("state");
  sp.sort();
  const rest = sp.toString();
  return { key: rest ? `${p}?${rest}` : p, state };
};

/**
 * @param {{ root: string, entries: (string | { route: string, static?: boolean })[], patternOf?: Map<string, string> }} o
 *   patternOf maps a measured route ("/orders/1") to the pattern it was filled from ("/orders/[id]").
 * @returns {null | { mode: string, failures: { check: string, message: string }[] }}
 *   null when the project has no e2e/dod/standard.json.
 */
export function standardCheck(o) {
  try {
    return check(o);
  } catch (err) {
    // A file the checks could not read is a finding to fix, not a crash: in report mode it is
    // printed and the check still passes.
    return { mode: "report", failures: [{ check: "standard-check", message: `could not run: ${err.message}` }] };
  }
}

function check({ root, entries, patternOf = new Map() }) {
  const file = path.join(root, "e2e", "dod", "standard.json");
  if (!fs.existsSync(file)) return null;
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return { mode: "enforce", failures: [{ check: "standard.json", message: `not valid JSON: ${err.message}` }] };
  }
  const mode = cfg.mode ?? "report";
  const failures = [];
  const fail = (check, message) => failures.push({ check, message });
  if (mode !== "enforce" && mode !== "report") fail("standard.json", `mode must be "enforce" or "report", not ${JSON.stringify(mode)}`);
  if (cfg.coreUnit && !entries.some((e) => routeOf(e) === cfg.coreUnit.route))
    fail("standard.json", `coreUnit.route ${cfg.coreUnit.route} is not in routes.json, so core-unit would never run`);
  for (const e of entries)
    if (typeof e === "object" && e.noHelp !== undefined && e.noHelp !== false && (typeof e.noHelp !== "string" || !e.noHelp.trim()))
      fail("standard.json", `${e.route}: "noHelp" is a reason (a non-empty string) or false`);
  const legacy = entries.filter((e) => typeof e === "object" && e.static === true && e.noHelp === undefined);
  if (legacy.length)
    console.log(
      `dod-standard: deprecated: "static": true without "noHelp" also exempts the help checks (${legacy.length} entr(ies)); ` +
        'add "noHelp": "<reason>", or "noHelp": false for a static page that has a help door.',
    );

  // The screens themselves: entries with no `state` in their query, not flagged static.
  const all = entries.map((e) => ({ e, route: routeOf(e), ...splitState(routeOf(e)) }));
  const screens = all.filter((x) => x.state === null && !isStatic(x.e));

  // state-coverage (T-01)
  for (const s of screens) {
    for (const want of ["empty", "error"]) {
      if (!all.some((x) => x.key === s.key && x.state === want))
        fail("state-coverage", `${s.route} has no ?state=${want} variant in routes.json (or flag it "static": true)`);
    }
  }

  // help-route (G-09): <helpDir>/<slug of the route pattern>.<any extension>
  if (cfg.helpDir) {
    const dir = path.join(root, cfg.helpDir);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    for (const s of all.filter((x) => x.state === null && !noHelp(x.e))) {
      const pattern = patternOf.get(s.key.split("?")[0]) ?? s.key.split("?")[0];
      const slug = routeSlug(pattern);
      if (!files.some((f) => f.replace(/\.[^.]+$/, "") === slug))
        fail("help-route", `${s.route} has no help file ${path.join(cfg.helpDir, slug)}.* (named by the route pattern ${pattern})`);
    }
  }

  // brand-assets (B-01)
  const productFile = path.join(root, "PRODUCT.md");
  if (!fs.existsSync(productFile)) fail("brand-assets", "PRODUCT.md not found at the project root");
  else {
    const lines = fs.readFileSync(productFile, "utf8").split("\n");
    const start = lines.findIndex((l) => /^#{1,6}\s+(Brand|ה?מותג)(?!\p{L})/iu.test(l));
    if (start < 0) fail("brand-assets", 'PRODUCT.md has no "Brand" section (a heading "## Brand")');
    else {
      const level = lines[start].match(/^#+/)[0].length;
      let end = lines.findIndex((l, i) => i > start && /^#+\s/.test(l) && l.match(/^#+/)[0].length <= level);
      if (end < 0) end = lines.length;
      const body = lines.slice(start + 1, end).join("\n");
      // A file path is a markdown link target with an extension, or an inline code span that
      // looks like a path: it has a "/" or an asset extension. `oklch(0.2 0 0)` or `--primary`
      // in a code span is a value, not a file. URLs and anchors are never paths.
      const ASSET = /\.(svg|png|jpe?g|webp|avif|gif|ico|pdf|woff2?|ttf|otf|eps|ai)$/i;
      const named = [
        ...[...body.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]).filter((p) => /\.[a-z0-9]{2,5}$/i.test(p)),
        ...[...body.matchAll(/`([^`\s]+)`/g)].map((m) => m[1]).filter((p) => (p.includes("/") && /\.[a-z0-9]{2,5}$/i.test(p)) || ASSET.test(p)),
      ].filter((p) => !/^([a-z]+:|#|\/\/)/i.test(p));
      for (const p of new Set(named)) {
        if (!fs.existsSync(path.join(root, p))) fail("brand-assets", `PRODUCT.md's Brand section names ${p}, which does not exist`);
      }
    }
  }

  // both-directions (B-02): each language has at least one measured route.
  const langs = Array.isArray(cfg.languages) ? cfg.languages : [];
  if (langs.length > 1) {
    const of = (l) => (r) =>
      l.routePrefix ? r === l.routePrefix || r.startsWith(l.routePrefix.replace(/\/$/, "") + "/") || r.startsWith(l.routePrefix + "?")
      : l.query ? (r.split("?")[1] ?? "").split("&").includes(l.query)
      : null;
    const marked = langs.filter((l) => l.routePrefix || l.query);
    for (const l of langs) {
      const matches = of(l);
      // A language with neither prefix nor query is the default: the routes no other language claims.
      const covered = all.some(({ route }) =>
        l.routePrefix || l.query ? matches(route) : !marked.some((m) => of(m)(route)),
      );
      if (!covered) fail("both-directions", `no route in routes.json is measured in ${l.lang} (${l.dir ?? "?"})`);
    }
  }

  return { mode, failures };
}
