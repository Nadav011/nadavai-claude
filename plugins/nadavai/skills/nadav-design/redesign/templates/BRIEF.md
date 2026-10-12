# <App> redesign brief (<date>)

> **לנדב, בקצרה:** שלוש עד חמש שורות בעברית פשוטה: מה האופי של האפליקציה, איך היא תיראה, מה נשאר כמו היום, ומה אתה מאשר כאן.
> **אושר:** <date> (תשובה <n> ב־DECISIONS-ANSWERED.md). עד שהשורה הזאת מלאה, שום מסך לא נבנה.

## Where the look comes from
- The app's own character: who uses it, when, in what mood, what it must feel like (from the code, PRODUCT.md,
  the users, Nadav). One paragraph, concrete.
- Built on: DESIGN.md / PRODUCT.md when they exist (name what is kept and what changes, and why).
- Not from: another app's look, or the generic "Impeccable look". A reference app may inform ONE named aspect
  (for example "grouped lists like iOS Settings"), stated here with the reason.

## Colour roles
| Role | Token | Dark | Light | Measured contrast |
|---|---|---|---|---|
| Screen background | `--bg` | | | |
| Surface / raised | `--surface` / `--surface-2` | | | |
| Text / secondary text | `--ink` / `--ink-2` | | | ≥ 4.5:1 on bg and surface |
| Primary action (one per screen) | `--accent` / `--accent-ink` | | | |
| Accent as text | `--accent-text` | | | ≥ 4.5:1 |
| Success: the app's own (DESIGN.md), never a default green | `--ok` | | | |
| Live / now (when the app has a live state) | `--live` | | | |
| Warning / danger | `--warn` / `--danger` | | | |
The values go into redesign.json "theme" (its template values are placeholders); this table is where they are argued,
each ratio measured with `tools/contrast.py`. When the app gives a colour one meaning (green = live, gold = success),
the roles follow the app, not the template.

**Light theme:** when the app has no live light theme (off by an owner decision, or never built), step 1 asks Nadav:
designed but off, or dark only. Dark only = no `theme.light` and `themes: ["dark"]` for the rounds.

## Type
Families (no new font without asking Nadav), the size ladder (every size the demo may use), weights, numerals
(`tabular-nums` for scores, times, counts), line heights, how long names wrap (never clipped).

## Shape, space, density
Radii (one shape per job), the spacing scale, row heights, the 44px target rule, safe areas (status bar, tab bar,
home indicator).

## Shared components (one per job, identical on every screen)
Top bar · tab bar (items, order from the start edge, active treatment) · list group and row · card · primary,
quiet and danger buttons · chips and pills · segmented control · sheet and dialog · toast · banner · empty,
loading (skeleton), error, offline and permission states · form field with its error. For each: anatomy, sizes,
states. They live in `parts/00-head.html`; a screen never restyles one locally.

## Motion
Where motion is allowed and what it means; reduced-motion behaviour.

## Voice
Form of address, tone, glossary (one term per concept), date/time/number formats for the locale, how errors speak.
Builds on PRODUCT.md «Voice» when it exists.

## Rules every screen keeps
- RTL-first, logical properties only; numbers, phones and Latin names in `dir="ltr"` islands.
- Nothing today's screen has is lost unless an answer removes it (INVENTORY.md lists every control).
- Real copy and plausible real data; one timeline for the whole demo (dates, scores, names agree everywhere).
- Every state of every screen is designed: empty, loading, error, offline, permission, and the screen's own.

## Never
What this redesign must not do (for example: a second accent colour, a new font, a feature not in FEATURES-PROPOSED.md).
