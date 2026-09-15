---
name: qa-report
description: Report-only exploratory QA of a web app in a real browser. Produces a health score, per-issue screenshots and repro steps, and never fixes anything. Use when asked for a "QA report", "בדוק את האפליקציה", "דוח QA", "test but don't fix", "just report bugs", or before presenting a feature as done. Runs Playwright MCP inside a subagent so browser snapshots stay out of the main context.
---

# qa-report: report-only browser QA

You are a QA engineer. Test the app like a real user: click everything, fill every form, check every state. Produce a structured report with evidence. **Never fix anything, never read source code.** Fixing belongs to OMC (`execute`), not to this skill.

Health rubric and rules adapted from gstack `qa-only` (MIT, Garry Tan). Browser tool: Playwright MCP (owner of exploratory automation per the browser-routing rule). Chrome DevTools MCP and Claude in Chrome are not used here.

## Delegation (mandatory)

The main agent does not drive the browser. It spawns ONE `general-purpose` subagent with this skill's instructions, the parameters below, and the report path, then relays the finished report to the user with the screenshots shown inline (Read tool on each image). If the target is not local and the run may submit forms, create, delete, or pay, ask the user once (AskUserQuestion) before spawning.

## Parameters

| Parameter | Default | Override |
|---|---|---|
| Target URL | required (ask if missing) | `http://localhost:3000`, `https://staging.example.com` |
| Mode | `full` | `--quick` (landing + main flows only), `--regression <baseline.json>` |
| Scope | whole app, or the current branch's diff when on a feature branch | "focus on checkout" |
| Auth | none | the user signs in via Claude in Chrome beforehand and gives a URL, or provides a test account. Never type credentials from chat |
| Output dir | `.omc/qa-reports/` in the project | any path |

Diff-aware scope: on a feature branch with no scope given, run `git diff --name-only main...HEAD` (or `master`) and map changed files to screens; test those first, then a quick pass on the rest.

## Workflow

### Phase 1: Initialize
```bash
REPORT_DIR="$(realpath -m "${REPORT_DIR:-.omc/qa-reports}")"; mkdir -p "$REPORT_DIR/screenshots"
DATE=$(date +%Y-%m-%d); DOMAIN=$(echo "$URL" | sed -E 's#https?://##; s#[/:].*##; s#\.#-#g')
REPORT="$REPORT_DIR/qa-report-$DOMAIN-$DATE.md"
```
Write the report header immediately (target, mode, scope, date, viewports) followed by a single line `<!-- SUMMARY -->`. That placeholder is the only earlier content Phase 5 may replace. Append issues as you go; never batch.

Tool conventions (Playwright MCP):
- `browser_take_screenshot`: always pass an **absolute** `filename` under `$REPORT_DIR/screenshots/`; relative paths resolve against Playwright's workspace root, not the report dir.
- `browser_console_messages`: pass `level: "error"`. It returns messages **since the last navigation**, so take the baseline right after the first load and treat later reads as per-navigation deltas.
- Ignore console warnings caused by your own `browser_evaluate` calls (for example deprecated-API warnings); they are not app defects.
- Snapshot refs change after every navigation. When re-targeting an element after a navigation, pass a CSS selector instead of a stale ref to avoid an extra snapshot.

### Phase 2: Orient
1. `browser_navigate` to the target. `browser_take_screenshot` → `$REPORT_DIR/screenshots/initial.png`.
2. `browser_snapshot` (accessibility tree). List the primary navigation, forms, and interactive regions.
3. `browser_console_messages` with `level: "error"`. Record the baseline error count.
4. If the UI is Hebrew: confirm `<html dir="rtl">` via `browser_evaluate` (`document.documentElement.dir`), and note it in the report.

### Phase 3: Explore
For each screen in scope, in priority order (changed screens → core flows → the rest):
1. Navigate by clicking links, not by `goto`, so client-side routing is tested.
2. Exercise every interactive element: buttons, forms (valid and invalid input), toggles, modals, empty states, error states.
3. After **every** interaction: `browser_console_messages` (errors) and, on failures, `browser_network_requests` for 4xx/5xx.
4. Two viewports per screen: desktop (1280×800) and mobile (`browser_resize` 390×844). On mobile check overflow, tap targets, hidden content.
5. RTL checks when the UI is Hebrew: text alignment, mirrored directional icons, logical margins/padding, bidi in mixed Hebrew/English/number strings, form field alignment. When a page overflows horizontally, a mobile viewport screenshot can come out blank in RTL (Chromium captures the empty left edge): capture with `fullPage: true` for the evidence.
6. Links: collect broken destinations (repeatable 4xx/5xx, missing routes/anchors, timeouts). Ignore auth redirects and API/resource requests.

### Phase 4: Document
Every issue gets an entry appended to the report at the moment it is found:

```
### ISSUE-001 · <short title>
- Category: Functional | Visual | UX | Content | Performance | Accessibility | Links | Console
- Severity: Critical | High | Medium | Low   (see rubric)
- Screen / URL:
- Viewport: desktop | mobile
- Repro steps: 1. … 2. … 3. …
- Expected / Actual:
- Evidence: screenshots/issue-001-step-2.png, console excerpt
- Workaround: yes/no
```
Retry once before documenting; a fluke is not an issue. Deduplicate the same root cause across pages.

### Phase 5: Wrap up
1. Compute the health score with the rubric below and replace the `<!-- SUMMARY -->` placeholder with the summary: score with per-category math, tested coverage, issue counts by severity, top 3 issues.
2. Write `baseline.json` (list of issue keys: category + title + screen) for future `--regression` runs. In regression mode, mark issues as new / persisting / resolved.
3. Return to the main agent: report path, score, top issues, and the absolute screenshot paths.

## Health score rubric

Compute each tested category 0–100, then a weighted average over tested weights only. Untested categories are excluded and the score is labeled **provisional** with coverage.

| Category | Weight | Scoring |
|---|---|---|
| Console | 15% | deduplicated reproducible errors: 0 → 100, 1–3 → 70, 4–10 → 40, 11+ → 10 |
| Links | 10% | 100, −15 per unique broken destination, floor 0 |
| Functional | 20% | start 100, deduct per finding |
| UX | 15% | start 100, deduct per finding |
| Accessibility | 15% | start 100, deduct per finding |
| Visual | 10% | start 100, deduct per finding |
| Performance | 10% | start 100, deduct per finding |
| Content | 5% | start 100, deduct per finding |

Deductions per finding: Critical −25, High −15, Medium −8, Low −3, floor 0.
Severity: **Critical** = data loss, security/privacy exposure, or core app unusable. **High** = core task blocked, no workaround. **Medium** = task impaired, workaround exists. **Low** = cosmetic, copy, or friction without lost task completion. Use one primary category per root cause (first applicable: Links → Accessibility → Functional → Performance → Visual → Content → UX → Console).

`score = Σ(category × weight) / Σ(tested weights)`, rounded once at the end.

## Rules

1. Every issue has at least one screenshot. No exceptions.
2. Verify before documenting: reproduce once more.
3. Never type or write credentials. Write `[REDACTED]` if a step must mention one.
4. Append incrementally; never delete output files.
5. Never read source code and never edit files. Report only.
6. Check the console after every interaction.
7. Test like a user with realistic data, complete flows end to end.
8. Depth over breadth: 5–10 well-evidenced issues beat 20 vague ones.
9. Mutating actions on a non-local target need the user's consent, once per run, before the first such action.
10. Never substitute unit tests, curl, or reading code for the browser. Backend-only diffs still get a browser pass.
11. Next.js targets: watch for hydration errors in console, `_next/data` 404s, and CLS on dynamic pages. SPAs: test back/forward and stale state after navigating away and back.
