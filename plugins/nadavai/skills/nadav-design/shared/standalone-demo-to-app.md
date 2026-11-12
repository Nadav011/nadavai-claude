# From a standalone demo to the app: values, components, screens

For one case only: a standalone demo that already exists when `rules.md`, «An app is built once», starts to apply to
its app (a page made before that rule, as MediZen's is). It allows no new standalone demo, and it changes nothing in
that rule: nothing of the page's code moves into the app. What moves is the page's design values, its component
definitions as a specification, and its screens as the tagged reference the app's preview is compared with. Where
this file and that rule differ, the rule holds and the difference is a fault to report («Where a fault goes»).

Source [I]: MediZen's measuring lane of 11-12.11.2026 (`~/design-redesign/tf2-r12`, files in
`research/closing/tokens/`, tools in `tools/local/`). That lane measured and changed no demo file, so what this file
says about measuring was run once, on one demo, and what it says about replacing values and building specimens has
not been run yet (see "Not run yet"). The steps are the choice of the session that wrote them, not Nadav's decision.
The tools are that repo's and are not in this skill: a second project that needs them reports it («Where a fault
goes») and does not write its own.

The three steps run in this order, each as a unit of its own with its check. Steps 1 and 2 move no pixel. Run inside
the demo before its approval they are not a design round, and they run there only when Nadav asks for them;
otherwise they are units of the build plan he approves.

## 1. Values

- **Count first.** A census of every value as it is written (custom properties defined and used, raw colours, px
  values, inline styles), which the same tool prints for any commit, so that before and after can be shown. MediZen:
  63 files, 356 property names, 544 raw hex colours, 5,499 px values.
- **Map in three tiers**: primitive (a raw scale step), semantic (what a value is for), component (one component's
  own value). Where the app already has a name for the same meaning, the demo takes that exact name; a new name
  follows the app's scheme. One CSS token file is the source for the demo and the app; no generator stands between
  them.
- **One name, one value in each theme, from the first commit.** The same value under two names is a free merge (33
  groups there). A name the demo and the app both use with different values is a conflict, and it is Nadav's.
- **A token holds the value exactly as it is written.** A derived colour keeps its function inside its token
  (`rgba()` and `color-mix()` of the same colour do not compute to the same string), because the judge below
  compares computed values.
- **Near-duplicates are listed and none is merged.** Two values that differ slightly (76 groups there) are a look
  decision: merging one moves pixels, so each group goes to Nadav as a numbered question.
- **The judge is computed-style identity, not screenshots.** Every rendered element, with its `::before` and
  `::after`, on every state the demo's existing checks already reach (no second list of states), at both widths
  and in both themes, compared property by property before and after the replacement. The check counts only after
  two proofs on the tree in hand: two runs of the same tree compare equal (there: 2,968 snapshots, 1,441,901
  element paths, 0 differences, with the clock started at a fixed instant, setup chains waited for and running
  animations paused), and a change of one property is reported and nothing else is (there: one margin of 1px,
  reported in the 8 snapshots that draw it). A full run took about 55 minutes on a loaded machine; one area takes
  minutes.
- **What that check cannot see is named in the unit's report as not checked**: hover and pressed, focus that no
  state's script leaves, a declaration that never wins or that no state draws, properties outside its set (grid
  templates, masks, cursor, scrollbar colours) and pseudo-elements other than `::before` and `::after`. A value
  replaced in one of those is read by a person, and the report says so.

## 2. Components

- **The inventory is taken from the CSS side.** For each component, list its class family: every rule that names
  the class, wherever it is. An inventory written by reading how screens use a component was checked by hand both
  ways on eight entries and held sixteen errors, about two an entry (classes and states left out, a theme rule or
  a phone rule written as a variant, states put on a variant axis, one wrong computed value), while no line it
  cited was wrong: reading the cited lines confirms what an inventory says and finds nothing it left out.
- **Three kinds are kept apart in every entry**: a variant (a named look someone chooses), a state (rest, hover,
  pressed, focus, disabled, loading, selected, error), and a context (theme, width). A theme rule or a phone rule
  is not a variant, and a value that reads like a state is folded into the states before the anchors are frozen.
- **A screen's override of a component is sorted, not copied**: a variant to name; a finding (an off-ladder size,
  a restated base value, a dead patch layer, a literal where a token exists); or placement only (margin, order,
  grid area), which is counted apart. A finding whose fix would move pixels goes to Nadav. MediZen: 51 components,
  508 restyling overrides (337 variants to name, 171 findings), 139 placement-only.
- **Each entry names what it becomes in the app**: the app's own component file, or "new" (there: 31 of 51 map to
  a file under `src/components/ui/`, 20 are new).
- **An entry is verified when its specimen is built, not by a second reading.** The specimen page draws every
  variant in every state, each anchored (`data-specimen="<component>.<variant>.<state>"`), and each anchor is
  compared by computed style with a live use of the same component on a screen. An entry with no live use to
  compare with says so.

## 3. Screens

Screens are built in the app's preview, from the app's own components on the token file of step 1, as point 2 of
the rule says, and each screen the tagged demo drew is compared with it as point 3 says (`screen` step 8b). A
screen the demo did not draw is designed in the preview. A difference between the demo and the app that predates
this path (there: three motion pairs) goes to Nadav as a numbered question and is not settled by whichever side
is built first.

## Not run yet

Nobody has run these; the first project that does reports what it found to the session that maintains this skill.

- The replacement itself: raw values swapped for tokens in a demo, with the identity check before and after.
- A specimen page built from an inventory, and its anchors compared with live uses.
- One token file read by both a demo page and an app's build.
- The identity check on a second demo: its states come from that demo's own checks, and a demo with none has no
  list to record.
