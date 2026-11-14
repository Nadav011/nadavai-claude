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

The app is built from zero by the landed process: `built-once.md`, `standalone-demo-to-app.md` for a standalone demo
(MediZen, the social studio), the modes. A run keeps two records, each beside that project's build plan and committed
with it (MediZen: the redesign output repo `Nadav011/medizen-redesign`; the social studio: `~/social/spec/v5/` beside
`08-build-plan.md`; SHIFTS: the stuck log only, in the build session's own repo, below):
- **`STUCK-LOG.md`**: every instruction of the skill that could not be followed, was ambiguous, contradicted another
  or cost far more than its step is worth: its file and line, what happened, what the agent did instead, time lost. A
  fault also goes where «Where a fault goes» says.
- **`LOOK-RECORD.md`**: per unit, its route and any fall-back with its reason, the gate reading per variant and state
  (builder's first and last, reviewer's pass), the look-over, hand corrections, time, instrument runs and the tools'
  commits; per run, the completeness line (demo variants / gated / open).
- Both records list each unit's open behaviour cases: id, the two sides, traced or not, asked on which date.

**Behaviour differences** and anything undecided go by «Whose decision a differing behaviour is» [N, 14.11.2026]
(`standalone-demo-to-app.md`): a reviewer checks each from outside and recommends; he decides, never the builder.

## What still protects live users

Unchanged by his pick: the build lives in the app's preview on invented data until the plan's cut-over unit, behind a
flag off for users, and demo code and invented data never reach the build users get (`built-once.md`, «An app is built
once», points 2 and 4); a screen with an open behaviour case does not cut over; each unit lands by its own PR; gated
actions stay behind `rules/working-style.md`, Approval gates. A run works in its own worktree.

## Which route carries the look

Nadav's ask [N, 14.11.2026], to the choice between copying and measuring and writing by hand and measuring: «1 או 2 מה
שאתה חושב באמת שהכי נכון שיביא 100 אחוז ומבלי לוותר גם על רכיבים שיש בדמו ואין בפאליקציה כי בסופו של דבר זה רכיב שאמור
לעבוד ולהיות קיים בצורה מלאה מקצה לקצה». His: the bar is 100%, and no part the demo has and the app lacks is given up.
The routes below are [I, chosen by the nadav-design session on Nadav's delegation of 14.11.2026]. Why: the bar is held
by the gate and the look-over below, not by the route, so the route with fewest transcription errors goes first
(SportChat: hand-rewritten styling drifted in 9 of 20 frames; copied styling read faithful once, by its builder).
- **Look of a part the app lacks: the converter** (the one exception in `standalone-demo-to-app.md`:8-11). Input: the
  rules the cascade applies to each specimen element at the tag (CDP `CSS.getMatchedStylesForNode`) and the demo's
  resolved values. Output, in the app's own form, three files (MediZen: `src/components/ui/<name>.styles.ts`,
  generated, the `cva` and its Tailwind classes; `<name>.corrections.ts`, hand corrections; `<name>.tsx`, by hand, the
  component and its behaviour, importing both); values through the app's tokens (an arbitrary value only where none
  exists, listed); logical properties only; one variant per variant of the checked entry. The generated file is
  committed first and never edited: the unit's checks regenerate it from the tag and find it equal. Colour literals in
  it meet the repo's lint as the project decides, noted in the record [I].
- **Where the tools live.** Every unit depends on the converter and the instrument, so they belong in a repo with a
  remote: proposed, `plugins/nadavai/skills/nadav-design/redesign/tools/from-zero/` in nadavai, by a separate reviewed
  change [I]; the first converted unit's builder writes the converter, reviewed with that unit; until then
  `~/design-redesign/from-zero/` (local git), each record naming each tool's commit.
- **Behaviour of every part, new or existing: written in the app** as a real component: every variant and state,
  keyboard and focus, name and role, RTL, loading, empty and error where it has them, real data, tests where the repo
  keeps them. Nothing of the demo's script moves.
- **Existing shared parts** (the button, the fields): restyled by hand in the app, behind the plan's mechanism.
- **The gate, for every component unit, whatever its route:** the instrument of unit 0 reads zero differences between
  the demo and the app for every variant of the checked entry, in each state, size, theme, width and direction the
  demo defines for it, on the lists the measurer wrote; the unit's reviewer's rerun on those lists is the pass. A unit
  not at zero is not done. The gate claims only what its contract and planted list cover; the look-over covers the
  items it names; a difference both miss is, once found, a new planted case or a new look-over item (unit 0).
- **The look-over**, by the unit's reviewer, the tagged specimen beside the app's component at each width and theme
  (`standalone-demo-to-app.md`, «Components»): what a canvas or image draws inside its box, hit areas, stacking
  between unrelated parts, motion (every animation, looping or on entry), pseudo-elements the instrument cannot read,
  icons the pair list hands over, and the part's text and attributes. Passes when none differ visibly.
- **Fallback:** a converted part whose hand share passes 10% [I] (non-blank lines, corrections file over generated
  file; `<name>.tsx` adds no class or style beyond the two imports, grepped by the unit's checks), that misses the
  gate at its cap, or that the converter cannot express in the app's form, is written by hand and passes the same
  gate; the record says which and why. A part that reaches the gate by neither route comes to Nadav with its record.
- **No part given up, counted per variant.** The unit of counting is each variant, state, size, theme and vertical
  override the demo defines for a component. Before a component's unit, the measurer checks its inventory entry
  against its class family at the tag in both directions (`standalone-demo-to-app.md`, part B) and fixes it (MediZen's
  `COMPONENTS.md`, an agent's reading of the CSS: 16 errors in 8 of 51 entries). The family comes uncapped
  (`component-family.mjs`:34 at `c001527` cuts contexts at 25): from the root of an export of the tag, `sed
  's/\.slice(0, 25)//' tools/local/component-family.mjs > tools/local/component-family-nocap.mjs; node
  tools/local/component-family-nocap.mjs <class>` (it finds `proto/` from its own path), `:is(` contexts expanded by
  hand (at `c001527`: `.pbtn` 64 contexts, among them `.tp-inv .pbtn`, `v2.html`:2207; `.fld` 31; `.ev` 12). Before
  rerunning the gate, the unit's reviewer runs that command at the tag itself, same expansion, and matches its list
  against the measurer's: a variant on the reviewer's list and not on the measurer's is an open item. Where the demo
  has no such command, the reviewer lists the variants on its own from the demo's source. The cut-over unit's reviewer
  checks the run's completeness line against the sum of those lists. With no inventory, the demo's components page
  stands in. Every variant maps to an app variant with a passed gate, to an open item holding cut-over, or to Nadav's
  merge or drop in DECISIONS-ANSWERED.md; one with none at cut-over fails the run.

## The first three component units (MediZen)

After unit 0 (the instrument), unit 1 (the preview) and the token unit, MediZen's build plan puts these three
component units first, each under the gate; their numbers go to `LOOK-RECORD.md`. Demo anchors are on the tagged
demo's components page `#/components` (at `c001527`; if parts A and B left specimen anchors at the tag, those).

**Unit A, the shared button (`src/components/ui/button.tsx`), by hand.** The new look sits behind one mechanism the
plan names (for example a root attribute and a Tailwind variant built like the app's `dark` variant, `index.css`:8).
- Off check: every computed longhand of every element of each sample equal between the unit's base commit and its
  head, both served by the preview on the same invented data, in five contexts: the clinic, `[data-vertical="salon"]`,
  RetroBarber `[data-vertical="salon"][data-salon-theme="retro"]`, `.dark`, `[data-vertical="salon"].dark`; states
  rest, hover, focus-visible, active, disabled; 375 and 1280 px. Sample, with counts: every variant at every size on
  `/styleguide`; preview routes rendering every direct `buttonVariants(` caller (9 in 6 files at `18ee8ad8`), the 10
  most frequent `asChild` class texts and the literal class texts that set size, radius, border, shadow, ring, opacity
  or colour; a text on no route is "not covered", and the record counts them.
- Gate, with the look on, at least, plus every variant and context of the checked C01 entry (64 contexts at
  `c001527`): `default`, `outline`, `secondary`, `destructive` against `.pbtn.pri`, `.pbtn`, `.pbtn.soft`,
  `.pbtn.danger` (`r10/comp.js`:60-67, :72); sizes `default` and `sm` against `.pbtn` and `.pbtn.sm`; `ghost` against
  C04 (:68), `link` against C06 (:70). `lg` and `icon` are C02 and C05, gated in their own units. Salon, as Nadav's
  #128 decides (`tf2-r12/DECISIONS-ANSWERED.md`:138, 1.11 [A]; spec SF-11): the new components with the salon's own
  token block (the tagged demo's `proto/v2-kit.css`, `html[data-vertical="salon"]`, read on `proto/v2-salon.html`),
  gated the same way. RetroBarber is outside #128: off check only.
- Done: off check all equal and the gate at zero. An off difference means the mechanism reaches today's users; the
  record names property, element, route and context.

**Unit B, a part the app lacks: C44 calendar appointment tile (`ev`), by the converter.** Definition:
`research/closing/tokens/COMPONENTS.md`:455-462 at `c001527`, checked first. Converter output:
`calendar-tile.styles.ts`, with `calendar-tile.tsx` (drag, resize handle, keyboard, accessible name) and its
corrections file. The components page draws `.no`, `.req`, `.past`, `.cx` and `.block` (`r10/comp.js`:167-175); every
other variant gets a demo-side recipe: `.pending`, `.lift`, `.unsaved`, `.fresh`, `.restored`, `.s30`/`.s45`/`.s60`,
`.fit1` to `.fit4` and `flt-off` as classes added to a specimen tile at read time; `phone-week`, `day-columns` and
`blur-names` as the calendar screen in that state, driven by input. Gate, at least: one tile per status group
`evStyle()` maps, an owned-service fill and a palette fill, every variant above, the start-edge bar, the resize handle
`.rz` and its `::after` under focus, stacking inside the part (`.ev .rz` above the content, `.ev:hover` and `.ev.lift`
above an overlapping tile), and every modifier and context of the class-family run (43 and 12 at `c001527`); light and
dark; 375 and 1280 px. The tile's salon look is an open item: `proto/v2-salon.html` draws no `.ev`.

**Unit C, an existing part: C19 text field (`src/components/ui/input.tsx`, `textarea.tsx`), by hand.** Behind unit A's
mechanism. Off check as unit A, with `<Input>` and its 20 most frequent literal class texts. Gate, at least: the four
skins of the checked entry (COMPONENTS.md:253-262): the sheet field `.tp-f` (`r10/comp.js`:100; `v2.html`:1783-1791),
the popover field `.fld` (259 class-string uses), the closing-sheet field `.ck-fr` and the bare textarea; the size
ladder 36, 40, 42, 44, 48 with the dense (pointer fine) and touch sizes; rest, hover, focus-visible (each skin's focus
offset), disabled, invalid (`aria-invalid`), with a placeholder and filled; every modifier and context of `.fld` (6
and 31 at `c001527`); light and dark; both widths. A skin the app gives another component maps to that unit.

**Order.** No screen is measured before the shared parts it uses and the app's shell have passed the gate, or are
listed open and the screen's reading says so: the landed order puts components before screens (`modes/redesign.md`,
step 8). SportChat's second pilot found 0 of 56 to 85 blocking lines on one frame the screen's own (`$P` =
`~/sporchat-v4-tmp/v4-system/fast/review/PILOT-S-A4a-2026-11-13.md`:21-24, its executor's own). **Until a unit is
done** the build goes on only with units that do not depend on it (on unit A: none using its mechanism).

## Unit 0: the instrument, proven by planted differences

Not built yet: the first unit of the first run, written where «Where the tools live» says by a measurer who builds no
measured unit (Playwright 1.60.0, runs through `heavy-slot --`). A gate reading counts only from an instrument commit
an independent code review approved against the planted list below, every case reported (off reads too); a later run
reuses the latest approved commit. A difference both missed joins the planted list or the look-over's (above) by a
reviewed change of this file, the only way a list changes; that change's reviewer picks the list (what a
computed-style, box or pixel reading can tell is a planted case; the rest, a look-over item) and checks the units
named below. A planted case gets the instrument fixed and approved again on the whole list. Either way the measurer
names in `LOOK-RECORD.md` every passed unit it can affect (all of them, when unsure); each counts as not done, and no
screen using it cuts over, until its reviewer (or a fresh one) reruns it on the newly approved commit at zero or, for
a look-over item, passes that item's look-over. A named unit already on a live screen is rechecked first in the order
of work; a difference there is a fault on a live screen: the miss goes where «Where a fault goes» (`built-once.md`)
sends a tool's fault, the fix lands as a new unit under the gate and approval gates, and the next report of the
session that finds it tells Nadav which live screens it affected and what a user would have seen. Nothing rolls back
by itself (a deploy's own roll-back on a failed health check is unchanged). **Contract.**
- **Inputs.** Other repos only as `git archive <sha>` exports after a fetch; never `worktree add`, `checkout`,
  `switch`, `pull`, `stash`, `reset`, `clean` or edit in another checkout. Each sha goes into `LOOK-RECORD.md` first.
- **What is compared.** The demo at its tag against the component as the app's preview renders it (not any of its
  files). Before the builder starts, the measurer writes from the tagged demo alone, per variant, a demo-side recipe
  (the specimen element, and the classes, attributes, context, state or input that draw it) and a pair list (each
  element of the part's whole subtree, by its role in the part, to its app element). A variant with no recipe is open,
  not gated. An element with no pair on either side is a difference unless the list declares it with a reason; an icon
  drawn as a CSS mask in the demo (`r10/icons.css`) against an `<svg>` in the app is such a declared pair, compared by
  its box, its colour and the pixels of its own box, or handed to the look-over by name.
- **What is read**, for every element of the subtree: every computed longhand, and every pseudo-element the part's
  rules in the demo style (found from the cascade, not a fixed list); each box (inline-start and block-start offsets
  and size, relative to the part's root); the order of the children; `z-index` as the rank order among the part's own
  positioned elements, and between two instances where a recipe overlaps them; a `url()` by the bytes of the file it
  loads, not its path; `transition-*` and `animation-*` timing (property, duration, delay, curve, iteration count,
  direction, fill mode). Not read: `--*` custom properties (names differ by design; their effect is read);
  `animation-name` (likewise) and `animation-play-state` (the settle sets it); `will-change` (draws nothing); text
  content and attributes (the behaviour rule or the look-over); a vendor-prefixed longhand only when its unprefixed
  twin is read and equal to it on both sides. Where the demo and the app legitimately differ in timing, the pair goes
  to Nadav as «Whose decision a differing value is» says. Colours are normalised to 8-bit sRGB through a 2D canvas,
  also inside shadows and gradients, and `font-family` to its first family, as `redesign/tools/parity-check.mjs` does
  at `e818a8a` (:257-264, :374; unmerged branch, cited for its method).
- **States and settling.** `:hover`, `:focus-visible` and `:active` through CDP `CSS.forcePseudoState`, `disabled` by
  the attribute (or `aria-disabled`), real input where forcing fails (recorded). The resting look is read with every
  finite animation and transition finished and every looping one paused at the frame the recipe states.
- **Page and scale.** Both sides at device scale factor 3 [I], loaded at the width read and never resized. The demo in
  each theme it has (light: palette `forest`, empty storage; dark: `mz-v2-theme` set to `dark` before the load, so the
  boot script sets `data-pal="dark"`, `v2.html`:3868), at 375 px in a touch context (the boot's `(max-width:760px)`
  test adds `html.m`) and at 1280 px in a desktop context (where the boot adds `nav-open`, the recipe states it);
  `dir="ltr"` is set after the boot, which sets `dir="rtl"` on every load, wherever the demo has rules for it
  (`v2.html`:58). Each on-read sample sits in a wrapper matching the demo sample's parent (inline size, `font-*`,
  `color`, `line-height`, `letter-spacing`, `direction`); images are the demo's own files (`$P`:23, :37); both sides
  load the demo's `proto/r10/fonts.css`, injected, never committed. The harness refuses a read when the wrapper width,
  the font file, the device scale or the measured viewport differ between the two sides (`$P`:146-147: 393 read as
  390). Elsewhere the measurer records this project's equivalents of these settings before the first read.
- **The demo's values.** Every `--*` name the demo's stylesheets declare, resolved on `<html>` in the context read,
  stored in the record; no hand-picked ranges (at `c001527` they come from `v2.html`:19, :1689, :2346, :2830, :3250,
  :2873 and `r10/dense.css`:8-14). A difference caused by a value the app's token unit lacks still counts: the unit is
  not done until the token unit carries it and the entry reads zero, or it goes to Nadav as an open pair; the record
  names it a harness gap, so it is not counted against the builder.
- **Tolerance.** Colour channels within 1 of 255 (conversion rounding). Lengths: a value both sides resolve to a
  multiple of 0.5 px is compared exactly; only laid-out box offsets and sizes may differ by up to 0.5 px.
- **Off reads** (the same codebase before and after a unit): every enumerated property, raw, exact. A sample whose
  class token is missing from the built CSS is "not covered".
- **Runs.** One read per sample per run. A run keeps its pids and after a crash stops those only, never by command
  text (`$P`:237, :265). Builders may run it as often as they like; every run is logged and counted in the unit's
  hours. A unit stops when the gate reads zero or at its cap [I]: a converted part after one working day falls back to
  hand; a hand-written part after two comes to Nadav with its record. First and last readings are recorded.

**Planted differences, each of which must be reported** (the starting list):
1. Two runs of the same page: nothing reported. One planted change of one property on one element: that alone.
2. A start-edge bar, or an icon, on the wrong side in right to left; two children in swapped order.
3. An element present on one side only, and an element of the subtree missing from the sample list.
4. A pseudo-element missing or different on one side: `::before`, `::after`, `::placeholder`, `::marker`,
   `::backdrop`, `::selection`, `::file-selector-button`.
5. An icon drawn as a CSS mask on one side and an `<svg>` on the other with a different glyph, size or colour.
6. An outline of 1.5 px against 1 px; a hairline border against none.
7. Stacking: `.ev .rz` at `z-index:2` against none; `.ev:hover` (4) or `.ev.lift` (12) against an overlapping tile.
8. A looping animation, or an entry animation, on one side only; a different duration or curve.
9. A `-webkit-line-clamp` or another prefixed-only property set differently.
10. A value that differs only through a custom property; a variant gated in one theme, one direction or one size only.
11. A different wrapper width, font file, device scale or viewport between the two sides: the harness refuses to read.
12. An image `url()`: the same file under another path (a hashed app asset) reads equal; a different file is reported.
13. A context variant (`.tp-inv .pbtn`) read in its context wrapper, the context rule missing on one side; an `:is(`
    context dropped from the measurer's list (the reviewer's class-family run reports it).
14. An off read with one property changed under the flag off.
15. The demo at 1280 px with and without the boot's `nav-open` (`v2.html`:3868): refused or reported.

## The social studio

Its run is its own build once its stack is decided (PROPOSED, `~/social/spec/v5/02-architecture.md`:9-11 at
`66503dd`). Without the measurement below, the runs show whether each route works, not which is better.

**Optional: copy against hand on the first screen.** The only measurement comparing the routes, if the studio's plan
includes it. It runs in `~/design-redesign/from-zero/social-ab/` and never lands. The measurer picks the closed screen
nearest the median `K.*` count of the 30 modules in `demo-v2/assets/js/screens/` (180 to 185 at `66503dd`), content
area only, writes recipes and pair list as unit 0 says, and caps (button half a day per arm, screen two). Arm A (own
executor): a converter turns the `K.*` calls into JSX and carries their kit CSS. Arm B (another): by hand. Button
first (`K.btn`, kinds p, s, q, d, qd, with `busy`, `disabled`, `block`, `icon`, `main`, `reason`), then the screen.
"Closer": fewer gate entries at the last reading (a screen tie goes to fewer differing pixels at 375 px, light).
Converter hours over N = 1, 10, 30 screens (N = 30 assumes it covers all 55 `K.*` functions; recorded). Thresholds
[I], unmeasured: hand share under 10%, converter at most 2 days, A per screen not slower than B; A closer with all met
passes (a screen is outside the one exception), closer with one missed goes to Nadav, not closer stops.

## SHIFTS

SHIFTS is already being built, and this file changes nothing in its plan [I]. Its build plan is
`~/Projects/mexicani-shifts/docs/plan/BUILD-PLAN.md`: Nadav approved draft 21 on 13.11.2026 («מאשר הכול», by the
plan's own record and `STATUS.md` beside it; later drafts carry their own closing checks), and the build session
builds from it in `~/Projects/shifts-app`, where units have landed on main. No unit of that plan is added, reordered
or gated anew by this file. Its demo lives inside the app's repo (`~/Projects/mexicani-shifts`, branch
`design/direction-and-demo`: 134 files under `src/demo` at `9300c90`, none on `main`), so there is nothing to copy and
no look route to choose; it is not a standalone demo, so `standalone-demo-to-app.md` does not apply, except «Whose
decision a differing behaviour is», which binds every from-zero run (above). What this file adds to SHIFTS's run is
two things: the stuck log, kept by the build session in its own repo (`~/Projects/shifts-app`, at a path that session
names; the plan's folder is the planning session's and is not in git) and reported as above, and that rule on
behaviour. Unit 0 and the component gate reach SHIFTS only if a round of its own plan adopts them (the demo side would
then be `src/demo` at the plan's tag); a change to a plan he approved is that plan's round, and goes to him where it
changes what he approved. His pick of 14.11 named SHIFTS among the three projects, and this section gives SHIFTS
almost none of the new method; whether its plan adopts unit 0 and the gate is his to decide and was put to him on
14.11.2026. Until he answers, the approved plan stands as it is [I].

## When a whole run pauses

Provisional [I]. A run pauses and comes to Nadav with both records when unit A's off check fails twice (a fix round or
a second mechanism included), three converted parts in a row fall back to hand, or the stuck log shows the same
instruction failing in two projects. A pause never stops SHIFTS's build, which follows its approved plan: there the
same finding is reported to its sessions and to Nadav. Nothing here becomes a rule by passing: a route Nadav decides
from the records needs a new reviewed change.
