# From-zero runs: building an app by this skill's process and measuring as it goes

What a from-zero run is, what it records and how its first units are measured: the choice of the session that wrote it
[I] (14.11.2026), except Nadav's words quoted below. Its one exception to the landed path is written there
(`standalone-demo-to-app.md`:8-11, `built-once.md`:501-503); elsewhere they hold («Where a fault goes» there).

## What Nadav decided

- His words of 14.11.2026 [N] (as quoted in the brief of the round that wrote this file): «שתבין אנחנו תכף מצסיימים עם
  העיצוב של MEDZIEMN DEMO ואפשר להתחיל שם ניסוי הכל מ 0 גם של SHFITS וסושיאל».
- Asked how to run that from-zero trial in MediZen, SHIFTS and the social studio, he picked [A] (14.11.2026) «הכול
  מאפס, בלי בדיקה קודם», whose text read: start the real build directly by the new method in the three projects and
  measure as we go; faster by a day; in MediZen a mistake in the method shows up in the middle of a real build and not
  in a side folder. He accepted that risk. He waived nothing that protects live users.

## What a run is

The app is built from zero by the process as landed: `built-once.md` (the detail of «An app is built once»),
`standalone-demo-to-app.md` where the demo is a standalone page (MediZen, the social studio), and the modes. A run
keeps two records, each beside that project's build plan and committed with it (MediZen: the redesign output repo
`Nadav011/medizen-redesign`; the social studio: `~/social/spec/v5/` beside `08-build-plan.md`; SHIFTS: beside the
build plan its run writes first, below):
- **`STUCK-LOG.md`**: every place an instruction of the skill could not be followed, was ambiguous, contradicted
  another, or cost far more than its step is worth. Each row: the file and line of the instruction, what happened,
  what the agent did instead, the time lost. A row that is a fault also goes where «Where a fault goes» says, so the
  skill is fixed.
- **`LOOK-RECORD.md`**: per unit, its route and any fall-back with its reason, the gate reading per variant and state
  (builder's first and last, reviewer's pass), the look-over, hand corrections, time, instrument runs and the tools'
  commits; per run, the completeness line (demo variants / gated / open).
- Both records list each unit's open behaviour cases: id, the two sides, traced or not, asked on which date.

**Differences in behaviour** and anything no source decides follow «Whose decision a differing behaviour is»
(`standalone-demo-to-app.md`) [N, 14.11.2026]: a reviewer checks each from outside and recommends; he decides; the
builder never picks.

## What still protects live users

Unchanged by his pick: the build lives in the app's preview on invented data until the plan's cut-over unit, behind a
flag off for users, and demo code and invented data never reach the build users get (`built-once.md`, «An app is built
once», points 2 and 4); a screen with an open behaviour case does not cut over; each unit lands by its own PR
(`rules/ci-policy.md`); gated actions stay behind `rules/working-style.md`, Approval gates. A run works in its own
worktree of its project's build branch, never in another session's checkout.

## Which route carries the look

Nadav's ask [N, 14.11.2026], to the choice between copying and measuring and writing by hand and measuring: «1 או 2 מה
שאתה חושב באמת שהכי נכון שיביא 100 אחוז ומבלי לוותר גם על רכיבים שיש בדמו ואין בפאליקציה כי בסופו של דבר זה רכיב שאמור
לעבוד ולהיות קיים בצורה מלאה מקצה לקצה». His: the bar is 100%, and no part the demo has and the app lacks is given up.
The routes below are [I, chosen by the nadav-design session on Nadav's delegation of 14.11.2026]. Why: the gate gives
the 100%, not the route, so the route with fewest transcription errors goes first (SportChat: hand-rewritten styling
drifted in 9 of 20 frames; copied styling read faithful once, the builder's own read).
- **Look of a part the app lacks: the converter** (the one exception in `standalone-demo-to-app.md`:8-11). Input: the
  rules the cascade applies to each specimen element at the tag (CDP `CSS.getMatchedStylesForNode`) and the demo's
  resolved values (the instrument below). Output, committed before any hand change: one component file in the app's
  own form, as three files (MediZen: `src/components/ui/<name>.styles.ts`, generated, exporting the `cva` and its
  Tailwind classes; `<name>.corrections.ts`, the hand corrections; `<name>.tsx`, written by hand, the component and
  its behaviour, importing both), every value through the app's tokens as the token unit mapped them (an arbitrary
  value only where no token exists, listed), logical properties only (`ps-`, `pe-`, `inset-inline-*`, `text-start`),
  one variant per demo variant of the checked entry. The generated file is marked as such and never edited: the unit's
  checks regenerate it from the tagged demo and find it equal to the committed file; the hand share counts the
  corrections file. Colour literals in generated output meet the repo's lint as the project decides (an exemption for
  generated files, or tokens only), noted in the record [I].
- **Where the tools live.** The converter and the instrument are code every unit depends on, so they belong in a repo
  with a remote: proposed, `plugins/nadavai/skills/nadav-design/redesign/tools/from-zero/` in the nadavai repo, added
  by a separate reviewed change [I]. Until it lands they live in `~/design-redesign/from-zero/` (a local git repo),
  the first converted unit's builder writes the converter there, and each record names the commit of each tool it
  used.
- **Behaviour of every part, new or existing: written in the app** as a real component: every variant and state the
  specimen shows, keyboard and focus, accessible name and role, RTL, loading, empty and error where the part has them,
  wired to real data in its unit, with tests where the repo keeps them. Nothing of the demo's script moves.
- **Existing shared parts** (the button, the fields): restyled by hand in the app, behind the plan's mechanism.
- **The gate, for every component unit, whatever its route:** the instrument reads zero entries outside the tolerance
  set against the demo, for every variant of the checked entry (below), in each state, size, theme, width and
  direction the demo defines for it. It reads everything that draws the part: every computed longhand of each sampled
  element and of its `::before`, `::after`, `::placeholder` and `::marker` where present; each element's box (its
  inline-start and block-start offsets and its size, relative to the part's root); and the order of its children; in
  `dir="rtl"`, and in `dir="ltr"` where the demo has rules for it (`v2.html`:58). The tolerance set, written before
  the first unit, holds only: lengths and boxes within 0.5 px (sub-pixel rounding), each 8-bit colour channel within 1
  (rounding of the colour conversion), every other value equal after the instrument's normalisations. Excluded, by a
  list fixed before the first unit and stored in the record [I]: custom properties (`--*`: their names differ between
  page and app by design, and their effect is in the properties read); vendor-prefixed longhands that mirror an
  unprefixed one read beside them; `transition-*` and `animation-*` (the gate reads settled states); `z-index` (the
  app's stacking scale differs from the page's by design); `will-change` (draws nothing). Anything else counts. The
  unit's reviewer reruns the gate at the recorded commits; its reading is the pass. A unit not at zero is not done.
- **The look-over**, for what the gate cannot see: what a canvas or an image draws inside its box, hit areas, stacking
  between unrelated parts, motion between states. The unit's reviewer sets the tagged specimen beside the app's
  component at each width and theme (`standalone-demo-to-app.md`, «Components»): it passes when none of these differ
  visibly; a difference is fixed or open.
- **Fallback:** a converted part whose hand share passes 10% [I] (non-blank lines of its corrections file over the
  non-blank lines of its generated file), that misses the gate at its cap, or that the converter cannot express in the
  app's form, is written by hand and passes the same gate; the record says which and why. A part that reaches the gate
  by neither route comes to Nadav with its record.
- **No part given up, counted per variant.** The unit of counting is each variant, state, size, theme and vertical
  override the demo defines for a component. Before a component's unit, its inventory entry is checked against its
  class family at the tag in both directions (`component-family.mjs`; `standalone-demo-to-app.md`, part B) and fixed:
  MediZen's `COMPONENTS.md` was written by an agent reading the CSS, and 8 of its 51 entries, once checked, held 16
  errors. A project with no inventory uses its demo's components page and runs the same check. Every variant of the
  checked entry maps to an app variant with a passed gate, to an open item that holds cut-over, or to Nadav's merge or
  drop recorded in DECISIONS-ANSWERED.md; a variant with none at cut-over fails the run.
- Tokens carry the demo's values (the token unit); screens are built in the preview against the tag.

## The first three component units (MediZen)

After unit 1 (the preview) and the token unit, MediZen's build plan puts these three component units first, each under
the gate; their numbers go to `LOOK-RECORD.md`. Demo anchors are on the tagged demo's components page `#/components`
(at `c001527`; if parts A and B left specimen anchors at the tag, those are used instead).

**Unit A, the shared button (`src/components/ui/button.tsx`), by hand.** The new look sits behind one mechanism the
plan names (for example a root attribute and a Tailwind variant built like the app's `dark` variant, `index.css`:8).
- Off check: every computed longhand of every sampled element equal between the unit's base commit and its head, both
  served by the preview on the same invented data, in five contexts: the clinic, `[data-vertical="salon"]`,
  RetroBarber `[data-vertical="salon"][data-salon-theme="retro"]`, `.dark`, `[data-vertical="salon"].dark`; states
  rest, hover, focus-visible, active, disabled; 375 and 1280 px. Sample, with counts, before the run: every variant at
  every size on `/styleguide`; preview routes on which every direct `buttonVariants(` caller (9 in 6 files at
  `18ee8ad8`), the 10 most frequent `asChild` class texts and the literal class texts that set size, radius, border,
  shadow, ring, opacity or colour render at least once; a text on no route is "not covered".
- Gate, with the look on, at least (plus every variant of the checked C01 entry): `default`, `outline`, `secondary`,
  `destructive` against C01 `.pbtn.pri`, `.pbtn`, `.pbtn.soft`, `.pbtn.danger` (`r10/comp.js`:60-67, :72); sizes
  `default` and `sm` against `.pbtn` and `.pbtn.sm`; `ghost` against C04 (:68), `link` against C06 (:70). `lg` and
  `icon` are C02 and C05, gated in their own units. Salon, as Nadav's #128 decides
  (`tf2-r12/DECISIONS-ANSWERED.md`:138, 1.11 [A]; spec SF-11): the new components with the salon's own token block
  (the tagged demo's `proto/v2-kit.css`, `html[data-vertical="salon"]`, read on `proto/v2-salon.html`), gated the same
  way. RetroBarber is outside #128: off check only.
- Done: off check all equal and the gate at zero. An off difference means the mechanism reaches today's users; the
  record names property, element, route and context.

**Unit B, a part the app lacks: C44 calendar appointment tile (`ev`), by the converter.** Definition:
`research/closing/tokens/COMPONENTS.md`:455-462 at `c001527`, checked first; specimen `.ev[data-cp="ev"]`
(`r10/comp.js`:167-175) and the calendar day view. Converter output: `calendar-tile.styles.ts`, with
`calendar-tile.tsx` (drag, resize handle, keyboard, accessible name) and its corrections file. Gate sample, at least:
one tile per status group `evStyle()` maps, an owned-service fill and a palette fill; `.no`, `.req`, `.past`,
`.pending`, `.lift`, `.unsaved`, `.cx` and `.block` (`r10/comp.js`:174-175); the duration and fit sizes (`.s30`,
`.s45`, `.s60`, `.fit1` to `.fit4`); the screen variants `flt-off`, `phone-week`, `day-columns` and `blur-names`; the
start-edge bar (`::before`), the resize handle `.rz` and its `::after` under focus; and every other modifier and
context the class-family run lists (43 modifiers and 12 contexts for `.ev` at `c001527`); light and dark; 375 and 1280
px.

**Unit C, an existing part: C19 text field (`src/components/ui/input.tsx`, `textarea.tsx`), by hand.** Behind unit A's
mechanism. Off check as unit A, with `<Input>` and its 20 most frequent literal class texts. Gate, at least: the four
skins of the checked entry (COMPONENTS.md:253-262): the sheet field `.tp-f` (`r10/comp.js`:100; `v2.html`:1783-1791),
the popover field `.fld` (260 class strings), the closing-sheet field `.ck-fr` and the bare textarea; the size ladder
36, 40, 42, 44, 48 with the dense (pointer fine) and touch sizes; rest, hover, focus-visible (with each skin's focus
offset), disabled, invalid (`aria-invalid`), with a placeholder and filled; every modifier and context of `.fld` the
class-family run lists (6 and 25 at `c001527`); light and dark; both widths. A skin the app gives another component
maps to that component's unit.

**Order.** No screen is measured before the shared parts it uses and the app's shell have passed the gate, or are
listed open and the screen's reading says so: the landed order already puts components before screens
(`modes/redesign.md`, step 8). SportChat's second pilot (`$P` =
`~/sporchat-v4-tmp/v4-system/fast/review/PILOT-S-A4a-2026-11-13.md`, its executor's own) found 0 of 56 to 85 blocking
lines on match#02 the screen's own (:21-24). **Until a unit is done** the build goes on only with units that do not
depend on it (on unit A: no unit that uses the mechanism).

## The instrument

It lives where «Where the tools live» says (`measure.mjs`, written by a measurer who builds no measured unit, on
Playwright 1.60.0). It reads another repo only as an export: `git -C <repo> fetch`, then `git -C <repo> archive <sha>
<paths> | tar -x -C <folder>`; never `worktree add`, `checkout`, `switch`, `pull`, `stash`, `reset`, `clean` or an
edit in another session's checkout. The demo is read at its tag, each sha written into `LOOK-RECORD.md` before
anything runs. Runs go through `heavy-slot --`.
- **Settle.** After a state is forced: finish every finite animation and transition (`a.finish()` where
  `a.effect.getComputedTiming().iterations` is finite), set every infinite one (such as `.spin`) to `currentTime = 0`
  and pause it, then read.
- **States.** `:hover`, `:focus-visible` and `:active` through CDP `CSS.forcePseudoState`; `disabled` by the attribute
  (or `aria-disabled` where the component uses it); a state that cannot be forced is driven with real input and the
  record says which and how. Each element and its `::before` and `::after` are read.
- **Off reads**: every property `getComputedStyle` enumerates, raw strings, no tolerance. A sample with a class token
  missing from the built CSS is "not covered".
- **The page around an on-read sample.** It sits in a wrapper whose inline size, `font-*`, `color`, `line-height`,
  `letter-spacing` and `direction` equal those read from the demo sample's parent at the same width; the record lists
  them. Images on both sides are the tagged demo's own files (a crop or another picture reads as a difference;
  `$P`:23, :37). Both sides use the tagged demo's `proto/r10/fonts.css` (Heebo 400 to 700 as data URIs, family
  `Heebo`, which the app's `--sans-font` names first), injected by the instrument for the read and never committed to
  the app.
- **The demo's values.** Every custom property the tagged demo resolves on `<html>` in the sampled context (each theme
  the demo has: light, palette `forest`, with empty storage; dark, with `mz-v2-theme` set to `dark` in storage before
  the load, so the boot script sets `data-pal="dark"`, `v2.html`:3868; loaded at 375 px, so the boot script's
  `(max-width:760px)` test adds `html.m`, in a touch context, so `r10/dense.css`'s coarse block (:14) applies, and at
  1280 px in a desktop context, so its fine-pointer layer applies; never resized): each `--*` name its stylesheets
  declare, read with `getComputedStyle(document.documentElement)`, stored in the record. No hand-picked ranges: at
  `c001527` they come from many blocks (`v2.html`:19, :1689, :2346 with `--r-card:8px`, :2830, :3250;
  `html[data-pal="forest"]` :2873; `r10/dense.css`:8-14). An entry caused by a value the app's token unit lacks still
  counts: the unit is not done until the token unit carries the value and the entry reads zero (or it goes to Nadav as
  an open pair, `standalone-demo-to-app.md`, «Whose decision a differing value is»); the record names it a harness
  gap, so it is not counted against the builder.
- **On reads** compare app and demo on the gate's set (every longhand but the listed exclusions, boxes, child order;
  not only the 53 `PROPS` of `tools/local/style-identity.mjs`:33-46 at `49bc59a`, which leave out layout and
  position), normalised as `redesign/tools/parity-check.mjs` does at `e818a8a`: colours to 8-bit sRGB through a 2D
  canvas (:257-264), also inside `box-shadow` and gradients; `font-family` to its first family, unquoted, lower case
  (:374); raw strings kept. The tolerance set is the gate's («Which route carries the look»), fixed before the first
  unit.
- **Proofs before any reading counts**, kept in the record: two runs of the same commit compare equal in every sample,
  context, state and width; one planted change (one property on one sample) is reported, and nothing else is; the
  measured viewport equals the requested one on both sides (`$P`:146-147: 393 read as 390).
- **Runs.** One read per sample per run. Each run keeps the pid of every process it starts; after a crash it stops
  those pids only, never by matching command text (`$P`:237, :265: about half the long runs crashed and left servers
  listening).
- **Who may run it.** The builder of a measured unit may run it as often as it likes, as a build with a comparer
  would; every run is logged with its time and counted in the unit's hours; the reviewer's rerun is the pass. A unit
  stops when the gate reads zero or at its cap [I]: a converted part after one working day falls back to hand; a
  hand-written part after two comes to Nadav with its record. The first and the last reading are both recorded.

## The social studio

Its run is its own build once its stack is decided (PROPOSED, `~/social/spec/v5/02-architecture.md`:9-11 at
`66503dd`). Without the measurement below, the runs show whether each route works, not which is better.

**Optional: copy against hand on the first screen.** The only measurement that compares the routes, if the studio's
plan includes it. It runs in `~/design-redesign/from-zero/social-ab/`, and nothing from it lands in the app (a screen
is outside the one exception). The measurer picks the closed screen nearest the median `K.*` count of the 30 modules
in `demo-v2/assets/js/screens/` (180 to 185 at `66503dd`), content area only, and writes from the demo alone a
`data-m="<id>"` pair list and caps (button half a day per arm, screen two). Arm A, its own executor: a converter turns
the `K.*` calls into JSX with the same classes and carries the kit CSS they use, output committed first. Arm B,
another executor, by hand. Button first (`K.btn`, kinds p, s, q, d, qd, with `busy`, `disabled`, `block`, `icon`,
`main`, `reason`), then the screen. "Closer": fewer gate entries at the last reading (a screen tie goes to fewer
differing pixels at 375 px, light). Converter hours spread over N = 1, 10, 30 screens (N = 30 assumes it covers the
other modules; the record states the share of the 55 `K.*` functions it handles). Thresholds [I], no measured basis:
hand share under 10%, converter at most 2 days, A per screen not slower than B. A closer with all met passes; closer
with one missed goes to Nadav; not closer stops, the plan stays by hand.

## SHIFTS

Its demo already lives inside the app (`~/Projects/mexicani-shifts`, branch `design/direction-and-demo`: 134 files
under `src/demo` at `9300c90`, none on `main`), so there is nothing to copy and no look route to choose; it is not a
standalone demo, so `standalone-demo-to-app.md` does not apply. It has no build plan and no INVENTORY.md yet, so its
run starts at `modes/redesign.md` step 2 (INVENTORY.md, STORY.md, from the demo in the app) and writes the build plan
of step 8 before any build unit. Then: the stuck log, behaviour logic written once apart from the screen
(`built-once.md`, «An app is built once», point 6), and each screen's INVENTORY.md row checked item by item
(`modes/screen.md`, step 8b).

## When a whole run pauses

Provisional [I]. A run pauses and comes to Nadav with both records when any of these holds:
1. Unit A's off check fails twice (a fix round or a second mechanism included).
2. Three converted parts in a row fall back to hand.
3. The stuck log shows the same instruction failing in two projects.

## After the runs

Nothing here becomes a rule by passing: a route Nadav decides from the records needs a new reviewed change.
