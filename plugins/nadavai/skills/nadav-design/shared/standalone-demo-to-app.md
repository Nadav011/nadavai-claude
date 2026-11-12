# From a standalone demo to the app: values, components, screens

For one case only: a standalone demo that already exists when `rules.md`, «An app is built once», starts to apply to
its app (a page made before that rule, as MediZen's is). It allows no new standalone demo, and it changes nothing in
that rule: nothing of the page's code moves into the app. What moves is the page's design values, its component
definitions as a specification, and its screens as the tagged reference the app's preview is compared with. Where this
file and that rule differ, the rule holds and the difference is a fault to report («Where a fault goes»).

Source [I]: MediZen's measuring lane of 11-12.11.2026 (repo `Nadav011/medizen-redesign`, branch `design/r12`, commit
`dad4c83`: files in `research/closing/tokens/`, tools in `tools/local/`). That lane measured and changed no demo file,
so what this file says about measuring was run once, on one demo, and the rest has not been run (see "Not run yet").
The steps and their order are the choice of the session that wrote them, not Nadav's decision. The tools are that
repo's and are not in this skill: a second project that needs them reports it («Where a fault goes») and does not
write its own.

## When each part runs

The tag of point 3 of the rule divides the path. Nothing here moves the approvals of point 2: the page is approved and
tagged, the build plan is approved, and only then does a build session start, with the preview as its unit 1.

- **Before the tag, inside the demo, only when Nadav asked for it.** Parts A (values) and B (components) order the
  page itself and move no pixel of it. They are not a design round. For MediZen he asked: on 11.11.2026, to the
  question whether to order the whole demo now (design values and components) so it moves to the app without being
  built again, he picked «עכשיו, במה שכבר סגור» [N] (the option read: inside the demo, without moving a pixel; each
  colour and size goes to one place; each component gets a name and a specimen page with all its states; a check
  confirms the demo looks the same before and after; screens that are still moving are ordered when they close). So A
  and B run there on closed screens only, and a screen still in a review round waits until it closes. A and B on a
  screen are finished before the commit he approves, as part of that round's fix run, so the commit that is tagged is
  the one he approved; a screen not ordered by then is tagged as written and treated as the last bullet here says. A
  shared name that changes (the demo taking the app's name) touches open screens too: the old name stays as an alias
  of the new one until the last screen that uses it closes. An alias still there at the tag is not carried to the app:
  its uses are mapped to the new name in part C.
- **The tag freezes all of it.** The tagged page, its token file and its specimen pages are read-only reference from
  then on (point 3; `modes/screen.md`: the demo at its tag is never edited). No part of this path edits the page after
  the tag, and the tagged page never reads a file that can change later: the app keeps a copy of the token file as it
  is at the tag as its reference, imported by nothing, and part C fills the app's own token file from it; from then on
  the app's own file is the one that changes.
- **After the tag, in the app, as units of the build plan Nadav approved.** Unit 1 is the preview (point 4;
  `modes/redesign.md` step 8). Part C comes after it, in that step's order: the token file, then the shared
  components, then the screens. A plan that puts the token file or the components before the preview is corrected
  before it is approved.
- **If he did not ask for A and B before the tag**, the page is tagged as it was written. The census, the map and the
  inventory are still taken from the tagged page (reading it changes nothing), and the app's token file and components
  are written from them in part C. There is then no replacement in the demo, so no identity check, and no specimen
  page in the demo. Nobody has run this branch.

## A. Values (before the tag, in the demo)

- **Count first.** A census of every value as it is written (custom properties defined and used, raw colours, px
  values, inline styles), which the same tool prints for any commit, so that before and after can be shown. MediZen:
  63 files, 356 property names, 544 raw hex colours, 5,499 px values.
- **Map in three tiers**: primitive (a raw scale step), semantic (what a value is for), component (one component's own
  value). Where the app already has a name for the same meaning, the demo takes that exact name and keeps its own
  value; a new name follows the app's scheme. The demo's values live in one CSS token file, written by hand, with no
  generator.
- **One name, one value in each theme, from the first commit.** Two names that carry the same value in both themes are
  a free merge (33 groups there); two names equal in one theme and different in the other are not.
- **A token holds the value exactly as it is written.** A derived colour keeps its function inside its token (`rgba()`
  and `color-mix()` of the same colour do not compute to the same string), because the judge below compares computed
  values.
- **Near-duplicates are listed and none is merged.** Two values that differ slightly (76 groups there) are a look
  decision: merging one moves pixels, so the merge is his. The list is offered to him once, the most visible groups
  first, as numbered questions; a group he does not answer stays as two values, which moves nothing.
- **The judge is computed-style identity, not screenshots.** Every rendered element, with its `::before` and
  `::after`, on every state the demo's existing checks already reach (no second list of states), at both widths and in
  both themes, compared property by property before and after the replacement. The check counts only after two proofs
  on the tree in hand: two runs of the same tree compare equal (there: 2,968 snapshots, 1,441,901 element paths, 0
  differences, with the clock started at a fixed instant, setup chains waited for and running animations paused), and
  a change of one property is reported and nothing else is (there: one margin of 1px, reported in the 8 snapshots that
  draw it). A full run took about 55 minutes on a loaded machine and runs through `heavy-slot --`; one area takes
  minutes. The pair of proofs is run on the whole page once, and again when the tool, the list of states or the setup
  changes; a replacement unit records, before and after, every state its changed rules can draw: a unit that changes
  the token file or a rule used outside its own area records the whole page (through `heavy-slot --`, about 55
  minutes), and `--only` is for a unit whose changed selectors, found by a search of the markup and the scripts, are
  drawn only in its area. A class that a script builds by joining strings is not found by a search (that demo's
  scripts do so), so a selector with such a class, or any case the search does not settle, records the whole page. A
  unit's "before" may be the previous unit's "after" when both were recorded on the same commit. The tool names
  Playwright by a path inside one machine's checkout of the app (`style-identity.mjs:27`), so on another machine that
  path is set first.
- **What that check cannot see is listed in the unit's report, found by a search and not from memory.** It records the
  53 properties named in the tool (`PROPS` in `style-identity.mjs`) and nothing else. Every other property is outside
  it, and the rule is that one, not the examples here: offsets (`top`, `right`, `bottom`, `left`, `inset`), `min-*`
  and `max-*` sizes, `flex-basis`, grid templates, background position and size, an animation's curve and delay (the
  tool records its name and duration only), `accent-color`, the offset and thickness of an underline, scroll padding,
  masks, cursor, font variants, writing modes, scrollbar colours. A replaced offset changes no recorded property of
  its element, so the check passes while the element moves (the reviews of this file counted, in that demo's CSS, 233
  offset declarations with a px or rem length, 99 of background position, background size or grid templates, 24
  `animation` shorthands that carry the curve token and 15 `accent-color`). It also cannot see hover and pressed,
  focus that no state's script leaves, a declaration that never wins or that no state draws, and pseudo-elements other
  than `::before` and `::after`. The report lists every replaced declaration whose property, after shorthands are
  expanded and logical properties and sizes are mapped to their physical forms (`inline-size` to `width`), is not one
  of the 53, found by comparing each replaced property with `PROPS` and not from the examples above, and every one in
  a state the check does not reach; each is marked "read by a person, not checked". That list is read before the
  commit goes to Nadav for approval, and anything it shows moved is put back, or, when the move is meant, offered to
  him as a numbered question like a near-duplicate and named in what he approves.

## B. Components (before the tag, in the demo)

- **The inventory is listed by a tool from the CSS, not written by reading.** For each component the tool lists its
  class family: every rule that names the class, wherever it is (there: `component-family.mjs`). MediZen's inventory
  was written by an agent reading the CSS section by section, with selectors and line numbers, and no such tool. Eight
  of its 51 entries were then checked by hand against the class family and held sixteen errors (five, four and three
  in the three most complex entries, none or one in the others): classes and states left out, a theme rule or a phone
  rule written as a variant, a restated value written as a variant, states put on a variant axis, two app pairs
  missing, one wrong computed value. No line it cited was wrong: reading the cited lines confirms what an inventory
  says and finds nothing it left out.
- **Three kinds are kept apart in every entry**: a variant (a named look someone chooses), a state (rest, hover,
  pressed, focus, disabled, loading, selected, error), and a context (theme, width). A theme rule or a phone rule is
  not a variant, and a value that reads like a state is folded into the states before the anchors are frozen.
- **A screen's override of a component is sorted, not copied**: a variant to name; a finding (an off-ladder size, a
  restated base value, a dead patch layer, a literal where a token exists); or placement only (margin, order, grid
  area), which is counted apart. A finding whose fix would move pixels is his in the same way: offered once, and left
  as it is drawn when he does not answer.
- **Each entry names what it becomes in the app**: the app's own component file, or "new".
- **MediZen's counts are from before the class-family check** and are not settled: 51 components, 508 restyling
  overrides (337 variants to name, 171 findings), 139 placement-only, 31 mapped to a file under `src/components/ui/`
  (4 of them inferred, the file not read in detail) and 20 new. 43 of the 51 entries were never checked, and the lane
  expects one or two errors in each, more in the big families.
- **An entry is verified in two steps, neither of them a second reading.** Before its specimen is built, the entry is
  compared with its class family (`component-family.mjs`) in both directions, which finds what it left out; a specimen
  is drawn from the entry, so it has no anchor for a class, a variant or a state the entry lacks. The specimen
  comparison then checks the values. Neither finds a state no rule draws. The specimen page is a page of the demo. It
  draws every variant in every state, each anchored (`data-specimen="<component>.<variant>.<state>"`), and each anchor
  is compared by computed style with a use of the same component on a screen of the same demo. An entry with no such
  use says so.

## C. In the app (after the tag, after the preview)

- **The token file.** The app's token file is filled from the token file at the tag, not replaced by it: a name both
  have takes the tag's value (under the decision line below), a name only the app has is kept, a name only the tag has
  is added (an alias of part A excepted: its uses take the new name), and the tag's theme selector is mapped to the
  app's (that demo switches themes with a selector of its own, the app with `.dark`). MediZen: 40 rows of the map, on
  23 of the app's names (20 colour names, 3 motion names), carry another value in the app (34 colour rows, for example
  `--primary` `#6A7B60` in the app and `#1F6B4F` in the demo; 6 motion rows).
- **Nothing reaches customers unit by unit.** In an app with live users, the token file and every change to a
  component that users' screens already use reach users only as point 2 says (the preview's mode, a flag that is off
  for users, or the long branch the plan names with its reason) until the plan's cut-over unit. Landing a token file
  or a restyled shared component for everyone as "values only" is the fault this line exists to stop (there, 31 of the
  51 components map to an existing app file, most of them used by live screens: `button.tsx` is imported by more than
  400 files).
- **Whose decision a differing value is** [I, recommended, not decided by Nadav]: a value the tagged page draws (a
  colour) is settled by his approval of the tag, since that is the look he approved; a pair the tag does not show at a
  glance (a timing, a curve) goes to him as a numbered question and is not settled by whichever side is built first;
  while it is open the unit uses the tag's value and its report marks it open, which is safe because of the line
  above. The cut-over unit does not run while such a pair is open unless its `go` question to him lists each open pair
  as a numbered question and says that a pair left unanswered ships with the tag's value. A pair he already answered,
  before the tag or to the lane's questions, is recorded in the project's DECISIONS-ANSWERED.md and is not asked
  again. A name the page draws with two values (there, before ordering: `--primary-hover` and
  `--muted-foreground-subtle`, main page against kit) is settled before the tag by "one name, one value" in part A,
  and goes to him where the page was tagged as written. There the lane sent him three such motion pairs; the 40 rows
  above and each entry's "demo has, app lacks" list are the differences in all.
- **Components.** Each is built once, in the app's own code, against its specimen at the tag, in the order the build
  plan gives. Nothing judges a component unit against its specimen by machine, and step 8b compares screens with
  phones, not a component with a specimen: until a check exists, the unit draws each variant and state of the specimen
  on the app's own component page (the styleguide route of `setup`), under the same anchors, its reviewer is given the
  specimen's shots at the tag beside that page, and the unit's report says that this was by eye.
- **Screens.** Built in the app's preview from those components, as point 2 says; each screen the tagged demo drew is
  compared with it as point 3 says (`modes/screen.md` step 8b), and a screen it did not draw is designed in the
  preview.
- **What judges a screen of the app against the tag.** Only the verifier of step 8b, by eye, which the rule calls the
  weaker check. The identity check of part A compares two runs of one page; it does not compare the app with the demo,
  and nothing in this skill or in that repo does so by machine.

## Not run yet

Nobody has run these; the first project that does reports what it found to the session that maintains this skill.

- The replacement itself: raw values swapped for tokens in a demo, with the identity check before and after.
- A guard that enforces "one name, one value": the lane says it belongs in the method, and no tool has it.
- The class-family check on the other 43 entries of MediZen's inventory.
- A specimen page built from an inventory, and its anchors compared with uses on the demo's screens.
- An app taking a token file from a tag, and its differing values held in the preview's mode until cut-over.
- Any comparison by machine of the app with the tagged demo, by computed style or otherwise, for a screen or for a
  component against its specimen.
- A page ordered on some screens and tagged as written on others.
- The branch where Nadav did not ask for A and B before the tag.
- The identity check on a second demo: its states come from that demo's own checks, and a demo with none has no list
  to record.
