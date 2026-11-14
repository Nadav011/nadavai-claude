# From-zero runs: building an app by this skill's process and measuring as it goes

What a from-zero run is, what it records and how its first units are measured: the choice of the session that wrote
it [I] (14.11.2026), except Nadav's words quoted below. Its one exception to the landed path is written there
(`standalone-demo-to-app.md`:8-11, `built-once.md`:501-503); elsewhere they hold («Where a fault goes» there).

## What Nadav decided

- His words of 14.11.2026 [N] (as quoted in the brief of the round that wrote this file): «שתבין אנחנו תכף מצסיימים עם
  העיצוב של MEDZIEMN DEMO ואפשר להתחיל שם ניסוי הכל מ 0 גם של SHFITS וסושיאל».
- Asked how to run that from-zero trial in MediZen, SHIFTS and the social studio, he picked [A] (14.11.2026) «הכול
  מאפס, בלי בדיקה קודם», whose text read: start the real build directly by the new method in the three projects and
  measure as we go; faster by a day; in MediZen a mistake in the method shows up in the middle of a real build and not
  in a side folder. He accepted that risk. He waived nothing that protects live users.
- So the run is the real build, from zero, by the whole process, measured as it goes; no side probe, no precondition.

## What a run is

The app is built from zero by the process as landed: `built-once.md` (the detail of «An app is built once»),
`standalone-demo-to-app.md` where the demo is a standalone page (MediZen, the social studio), and the modes. A run
keeps two records, each beside that project's build plan and committed with it (MediZen: the redesign output repo
`Nadav011/medizen-redesign`; the social studio: `~/social/spec/v5/` beside `08-build-plan.md`; SHIFTS: beside its
build plan in `mexicani-shifts`):
- **`STUCK-LOG.md`**: every place an instruction of the skill could not be followed, was ambiguous, contradicted
  another, or cost far more than its step is worth. Each row: the file and line of the instruction, what happened,
  what the agent did instead, the time lost. A row that is a fault also goes where «Where a fault goes» says, so the
  skill is fixed.
- **`LOOK-RECORD.md`**: per component unit, its route and whether it fell back to hand (and why), the gate reading per
  variant and state (first and last), hand corrections, time and instrument runs; per run, the completeness count
  (demo components / mapped with a passed gate / open).
- Both records list each unit's open behaviour cases: id, the two sides, traced or not, asked on which date.

**Differences in behaviour** and anything no source decides follow «Whose decision a differing behaviour is»
(`standalone-demo-to-app.md`) [N, 14.11.2026]: a reviewer checks each from outside, not by the demo or his earlier
answers to the letter, and recommends to him; the builder never picks.

## What still protects live users

Unchanged by his pick. Everything the build makes lives in the app's preview on invented data until the plan's
cut-over unit (`built-once.md`, «An app is built once», points 2 and 4: redesigned screens behind a flag that is off
for users or reachable only through the preview's route; demo code and invented data never in the build users get,
proven by the no-demo check); a screen with an open behaviour case does not cut over; each unit lands by its own PR
under `rules/ci-policy.md`; deploys, migrations and anything else gated stays behind `rules/working-style.md`,
Approval gates. A run works in its project's own build branch and preview, as its build plan says. The scratch-folder
and export rules below apply only to the instrument's and the converter's own files and to reading another repo.

## Which route carries the look

Nadav's ask [N, 14.11.2026], to the choice between copying and measuring and writing by hand and measuring: «1 או 2 מה
שאתה חושב באמת שהכי נכון שיביא 100 אחוז ומבלי לוותר גם על רכיבים שיש בדמו ואין בפאליקציה כי בסופו של דבר זה רכיב שאמור
לעבוד ולהיות קיים בצורה מלאה מקצה לקצה». His: the bar is 100%, and no part the demo has and the app lacks is given up.
The routes below are [I, chosen by the nadav-design session on Nadav's delegation of 14.11.2026]. Why: the gate gives
the 100%, not the route, so the route with the fewest transcription errors goes first; SportChat's audit puts
hand-rewritten styling among the main causes of drift (9 of 20 frames), and its calibration read shows copied styling
faithful when the inputs are equal (the builder's own read, one frame).
- **Look of a part the app lacks: the converter** (the one exception in `standalone-demo-to-app.md`:8-11). Input: the
  rules the cascade applies to each specimen element at the tag (CDP `CSS.getMatchedStylesForNode`) and the demo's
  resolved values (the instrument below). Output, committed before any hand change: one component file in the app's
  own form (MediZen: `src/components/ui/<name>.tsx` with `cva` and Tailwind classes, as `button.tsx`), every value
  through the app's tokens as the token unit mapped them (an arbitrary value only where no token exists, listed),
  logical properties only (`ps-`, `pe-`, `inset-inline-*`, `text-start`), one variant per demo modifier the specimen
  shows. Never retyped by hand. The output is marked as generated and never edited: a check regenerates it from the
  tagged demo and finds it equal to the committed file; hand corrections live in a file of their own, which is what
  the hand share counts. Colour literals in generated output meet the repo's own lint as the project decides (an
  exemption for generated files, or tokens only), noted in the run's record [I]. The converter is a script in
  `~/design-redesign/from-zero/convert/` (a local git repo, no remote), written by the first converted unit's builder
  and used by later units at a recorded commit.
- **Behaviour of every part, new or existing: written in the app** as a real component: every variant and state the
  specimen shows, keyboard and focus, accessible name and role, RTL, loading, empty and error where the part has them,
  wired to real data in its unit, with tests where the repo keeps them. Nothing of the demo's script moves.
- **Existing shared parts** (the button, the fields): restyled by hand in the app, behind the plan's mechanism.
- **The gate, for every component unit, whatever its route:** the instrument reads zero entries outside the tolerance
  set against the demo's specimen, in every variant, state, theme and width the specimen has. The tolerance set,
  written before the first unit, holds only: lengths within 0.5 px (sub-pixel rounding), each 8-bit colour channel
  within 1 (rounding of the colour conversion), and every other value equal after the normalisations of the instrument
  (colours to sRGB, `font-family` to its first family). A unit not at zero is not done.
- **Fallback:** a converted part whose hand share passes 10% [I] (non-blank lines of its corrections file over the
  non-blank lines of its generated file), that misses the gate at its cap, or that the converter cannot express in the
  app's form, is written by hand and passes the same gate; the record says which and why. A part that reaches the gate
  by neither route comes to Nadav with its record.
- **No part given up:** at each run's end, every component in the tagged demo's inventory (part B of
  `standalone-demo-to-app.md`: the list from the class-family tool, MediZen's `COMPONENTS.md`; where a project has
  none, the tagged demo's components page) maps to exactly one app component with a passed gate, or to an open item
  that holds cut-over. A demo component with no app counterpart at cut-over fails the run. A part is merged into
  another or dropped only by Nadav's decision, recorded in DECISIONS-ANSWERED.md.
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
  rest, hover, focus-visible, active, disabled; 375 and 1280 px. Sample, listed with counts before the run: every
  variant at every size on `/styleguide` (`src/pages/StyleguidePage.tsx`); a list of preview routes, written before
  the run, on which every direct `buttonVariants(` caller (9 in 6 files at `18ee8ad8`), the 10 most frequent `asChild`
  class texts and the distinct literal class texts that set size, radius, border, shadow, ring, opacity or colour (553
  at `f9a0bba5`) render at least once; a text on no listed route is "not covered".
- Gate, with the look on: `default`, `outline`, `secondary`, `destructive` against C01 `.pbtn.pri`, `.pbtn`,
  `.pbtn.soft`, `.pbtn.danger` (`r10/comp.js`:60-67, :72); sizes `default` and `sm` against `.pbtn` and `.pbtn.sm`;
  `ghost` against C04 (:68), `link` against C06 (:70). `lg` and `icon` are C02 and C05, gated in their own units.
  Salon, as Nadav's #128 decides (`tf2-r12/DECISIONS-ANSWERED.md`:138, 1.11 [A]; spec SF-11): the new components with
  the salon's own token block (the tagged demo's `proto/v2-kit.css`, `html[data-vertical="salon"]`, read on
  `proto/v2-salon.html`), gated the same way. RetroBarber is outside #128: off check only.
- Done: off check all equal and the gate at zero. An off difference means the mechanism reaches today's users; the
  record names property, element, route and context.

**Unit B, a part the app lacks: C44 calendar appointment tile (`ev`), by the converter.** Definition:
`research/closing/tokens/COMPONENTS.md`:455-462 at `c001527`; specimen `.ev[data-cp="ev"]` (`r10/comp.js`:167-175) and
the calendar day view. Converter output: `src/components/ui/calendar-tile.tsx` as above, its variants the modifiers
the specimen shows; behaviour (drag, resize handle, keyboard, the tile's accessible name) written in the unit. Gate
sample: one tile per status group `evStyle()` maps, an owned-service fill and a palette fill, `.past`, `.pending`,
`.lift`, the start-edge bar (`::before`), the resize handle `.rz` and its `::after` under focus; light and dark; 375
and 1280 px.

**Unit C, an existing part: C19 text field (`src/components/ui/input.tsx`), by hand.** Restyled to the sheet field
(`.tp-f`, `r10/comp.js`:100; `v2.html`:1783-1791; COMPONENTS.md:253-262) behind unit A's mechanism. Off check as unit
A, with `<Input>` and its 20 most frequent literal class texts; gate at rest, hover, focus-visible, disabled, with a
placeholder and filled, light and dark, both widths.

**Order.** No screen is measured before the shared parts it uses and the app's shell have passed the gate, or are
listed open and the screen's reading says so: the landed order already puts components before screens
(`modes/redesign.md`, step 8). SportChat's second copy pilot (`$P` =
`~/sporchat-v4-tmp/v4-system/fast/review/PILOT-S-A4a-2026-11-13.md`, its executor's own, not reviewed) found 0 of 56
to 85 blocking lines per read on match#02 to be the screen's own; shared parts, the shell, roles and fixture images
held the rest (:21-24). **Until a unit is done** the build goes on only with units that do not depend on it (on unit
A: no unit that uses the mechanism). A done unit shows that part, at its commit, for its sample; not the other parts
or screens.

## The instrument

Its own files live in `~/design-redesign/from-zero/measure/` (a local git repo, no remote; `~/design-redesign` is not
inside a repo). The first run to reach a measured unit writes `measure.mjs` there; the others use it at a recorded
commit. Its author is a measurer who builds none of the measured units, with Playwright 1.60.0. It reads another repo
only as an export: `git -C <repo> fetch`, then `git -C <repo> archive <sha> <paths> | tar -x -C <folder>`; never
`worktree add`, `checkout`, `switch`, `pull`, `stash`, `reset`, `clean` or an edit in another session's checkout. The
demo is read at its tag, each sha written into `LOOK-RECORD.md` before anything runs. Runs go through `heavy-slot --`.
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
  the specimen has: light, palette `forest`, with empty storage; dark, with `mz-v2-theme` set to `dark` in storage
  before the load, so the boot script sets `data-pal="dark"`, `v2.html`:3868; loaded at 375 px in a touch context, so
  `html.m` applies, and at 1280 px in a desktop context, so `r10/dense.css` applies; never resized): each `--*` name
  its stylesheets declare, read with `getComputedStyle(document.documentElement)`, stored in the record. No
  hand-picked ranges: at `c001527` they come from many blocks (`v2.html`:19, :1689, :2346 with `--r-card:8px`, :2830,
  :3250; `html[data-pal="forest"]` :2873; `r10/dense.css`:8-14). A difference caused by a value the app's token unit
  lacks is a harness gap, never hand drift.
- **On reads** compare app and demo on the 53 `PROPS` (`tools/local/style-identity.mjs`:33-46 at `49bc59a`, imported
  from a `git show` copy; importing it runs nothing, :226-227), normalised as `redesign/tools/parity-check.mjs` does
  at `e818a8a`: colours to 8-bit sRGB through a 2D canvas (:257-264), also inside `box-shadow` and gradients;
  `font-family` to its first family, unquoted, lower case (:374); raw strings kept. The tolerance set is the gate's
  («Which route carries the look»), fixed before the first unit.
- **Proofs before any reading counts**, kept in the record: two runs of the same commit compare equal in every sample,
  context, state and width; one planted change (one property on one sample) is reported, and nothing else is; the
  measured viewport equals the requested one on both sides (`$P`:146-147: 393 read as 390).
- **Runs.** One read per sample per run. Each run keeps the pid of every process it starts; after a crash it stops
  those pids only, never by matching command text (`$P`:237, :265: about half the long runs crashed and left servers
  listening).
- **Who may run it.** The builder of a measured unit may run it as often as it likes, as a build with a comparer
  would; every run is logged with its time and counted in the unit's hours. A unit stops when the gate reads zero or
  at its cap [I]: a converted part after one working day falls back to hand; a hand-written part after two comes to
  Nadav with its record. The first and the last reading are both recorded.
- Not this instrument: `parity-check.mjs` (unmerged, `e818a8a`, `cssOf` :362-379): layout fields only, no states.

## The social studio

Its run is its own build once its stack is decided (PROPOSED at `66503dd`,
`~/social/spec/v5/02-architecture.md`:9-11), with the two records and the gate. Without the measurement below, the
runs show whether each route works, not which is better.

**Optional: copy against hand on the first screen.** The only measurement that compares the routes, if the studio's
plan includes it. It runs in `~/design-redesign/from-zero/social-ab/`, and nothing from it lands in the app (a screen
is outside the one exception). The measurer picks the closed screen whose module in `demo-v2/assets/js/screens/` has a
`K.*` call count nearest the median of the 30 modules (180 to 185 at `66503dd`), content area only, and writes from
the demo alone a pair list (`data-m="<id>"` per measured element), widths, states, tolerance and caps (button half a
working day per arm, screen two). Arm A, by its own executor: a converter turns the screen's `K.*` calls into JSX with
the same class names and carries the `kit.css`, `tokens.css` and `components.css` rules they use; its output is
committed before any hand change. Arm B, by another executor: the stack's own components, by hand. Button first
(`K.btn`, kinds p, s, q, d, qd, with `busy`, `disabled`, `block`, `icon`), then the screen. "Closer": fewer (id,
state, property) entries outside tolerance at the last reading; a screen-stage tie goes to fewer differing pixels at
375 px, light. Hand share as above; converter hours spread over N = 1, 10, 30 screens (N = 30 assumes it covers the
other modules' `K.*` functions; the record states the share of the 55 it handles). Thresholds [I], no measured basis:
hand share under 10%, converter at most 2 days, A per screen not slower than B. A closer with all met passes; closer
with one missed goes to Nadav (named); not closer stops, and the plan stays by hand.

## SHIFTS

Its demo already lives inside the app (`~/Projects/mexicani-shifts`, branch `design/direction-and-demo`: 134 files
under `src/demo` at `9300c90`, none on `main`), so there is nothing to copy and no look route to choose. Its run is
the process itself: the stuck log, behaviour logic written once apart from the screen (`built-once.md`, «An app is
built once», point 6), and each screen's INVENTORY.md row checked item by item (`modes/screen.md`, step 8b).

## When a whole run pauses

Provisional [I]. A run pauses and comes to Nadav with both records when any of these holds:
1. Unit A's off check fails twice (a fix round or a second mechanism included).
2. Three converted parts in a row fall back to hand.
3. The stuck log shows the same instruction failing in two projects.

## After the runs

Nothing here becomes a rule by passing. A change of route Nadav decides from the records is carried by a new,
independently reviewed change to `standalone-demo-to-app.md` (and `built-once.md` where needed); until then they hold.
