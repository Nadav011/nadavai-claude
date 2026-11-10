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
const isStatic = (e) => typeof e === "object" && e.static === true;

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
export function standardCheck({ root, entries, patternOf = new Map() }) {
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
    for (const s of screens) {
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
    const start = lines.findIndex((l) => /^#{1,6}\s+(Brand|מותג)(?!\p{L})/iu.test(l));
    if (start < 0) fail("brand-assets", 'PRODUCT.md has no "Brand" section (a heading "## Brand")');
    else {
      const level = lines[start].match(/^#+/)[0].length;
      let end = lines.findIndex((l, i) => i > start && /^#+\s/.test(l) && l.match(/^#+/)[0].length <= level);
      if (end < 0) end = lines.length;
      const body = lines.slice(start + 1, end).join("\n");
      // A file path is a markdown link target or an inline code span that names a file:
      // it has an extension and is not a URL.
      const named = [
        ...[...body.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]),
        ...[...body.matchAll(/`([^`\s]+)`/g)].map((m) => m[1]),
      ].filter((p) => !/^([a-z]+:|#)/i.test(p) && /\.[a-z0-9]{2,5}$/i.test(p));
      for (const p of new Set(named)) {
        if (!fs.existsSync(path.resolve(root, p))) fail("brand-assets", `PRODUCT.md's Brand section names ${p}, which does not exist`);
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
