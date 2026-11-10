# Working from a reference Nadav gave

When Nadav points at something and says "like this" (a site, a screen recording, a screenshot,
another app), the job is to build that, not a concept inspired by it. Three times he answered a
concept with "אפילו לא קרוב" (nadavc.ai 26.10 and 27.10.2026, Camstore 5.11): each time the agent
had replaced his reference with ideas of its own and showed him nothing until all of it was done.

This file applies in every track and mode, whenever a reference exists. It is mandatory in the
`site` track.

## The rule

1. **Deconstruct before designing.** The first deliverable is `REFERENCE.md` (template:
   `redesign/templates/REFERENCE.md`), not a mockup: what is always there (the light, the type,
   the accent, a fixed header or HUD), and one row per section or effect in the order they are
   seen.
2. **The ledger is checked before anything is built from it.**
   `python3 redesign/tools/reference-coverage.py REFERENCE.md --total <length>` fails when a
   stretch of the reference has no row. Then a fresh reviewer who did not write the ledger
   watches the reference with the ledger beside it and lists anything on screen that no row and
   no "always there" line describes. Both results are in the step's evidence.
3. **Build the first row and show it.** One section (the hero first), on the real page, at a
   link he can open. Nothing else is built until he has answered that row.
4. **Then row by row, in order, on the same page.** He judges one cohesive page, not isolated
   effect modules.
5. **No alternatives, no metaphor "worlds", no extra layers** (a site-wide particle field was
   rejected the same day) unless he asks for them.
6. **A row closes only with his numbered answer.** "Built" is not closed. A row that differs
   from the reference on purpose needs his answer saying so.
7. **A fresh reviewer compares the built page with the reference before he sees each row**,
   using the frame pairs, and reports differences; it does not judge taste.

What he takes from a reference is his to say: the style and the mechanics, or the layout too.
When his words do not settle it, that is the understanding check (`shared/rules.md`, «His
words»), asked with two marked frames of the reference, before the ledger is written.

## What a row holds

| Column | Content |
|---|---|
| id | R-1, R-2 ... in the order they are seen (K-1, K-2 ... in the "always there" table) |
| what | first the stretch it covers, `[t0–t1 s]` of a video or `[y0–y1 px]` of a page, then the section or effect in plain words ("big headline parts and his portrait opens in the middle"), with the text on screen quoted |
| how it moves | trigger (load, scroll position, hover, tap), what moves, from where to where, and whether it runs on a clock or follows the scroll |
| measured | durations, delays, easing, distances, sizes, fonts, colours: numbers from the procedure below, each with how it was measured; "not measured" is allowed and visible |
| needs | assets the row cannot be built without (a professional portrait, a video, a 3D model), and who supplies each |
| frames | the pair `reference/R-n.png` and `built/R-n.png`, same viewport |
| מצב | `פתוח` until he answers, then exactly `הוכרע · תשובה N` |

`python3 redesign/tools/decisions-open.py REFERENCE.md` counts the rows not yet closed (it reads
the «מצב» column, the same way it reads DECISIONS-OPEN.md). A gate that depends on the reference
reads that count, never a sentence.

A recording that scrolls back shows a section twice. Rows follow what is seen, so both showings
are rows, and the second says which row it repeats.

Assets come first: a person-led hero is not built on a phone selfie. If a row's `needs` is not
met, that is said to him before the row is built, with what would be needed.

## Measuring a reference (the procedure, in this order)

Write the ledger's "How it was measured" block first: every number depends on it.

### A live site

1. `dembrandt <url> --json-only` for colours, type, spacing, radii, shadows.
2. `/interfaces:explain-interface` on the section: computed styles, `document.getAnimations()`
   (duration, delay, easing, keyframes), scroll-linked timelines, whether it is DOM, canvas or
   WebGL. For a canvas or WebGL effect say so in the row: its shader cannot be read this way,
   and its motion is measured from a recording, as below.
3. The `chrome-devtools` CLI for what loads and when (network, performance trace), and the
   `rea` web tools when the site's own bundle has to be read for a value.
4. Screens at the widths he will look at (a phone and a desktop), one frame per row. Stretches
   are page pixels at the stated width.

### A video (also the fallback for canvas and WebGL)

1. **What kind of video.** `ffprobe` gives the size, the real frame rate and the length. Then
   look at one contact sheet (`ffmpeg -i ref.mp4 -vf "fps=2,scale=270:-2,tile=6x6" sheet.png`)
   and say which it is:
   - a screen recording: the page fills the frame;
   - a film of a screen (a phone filming a laptop, a reel with a caption): find the area of the
     frame that is the page and write it down; measure how much the camera moves by tracking
     something fixed on the page (its top bar) and state that drift, since it is the error of
     every position below; colours and fonts are then "not measured", because a filmed colour
     is the camera's, not the page's.
2. **Frames at the source's own rate**, extracted once: `ffmpeg -i ref.mp4 -vf
   "fps=<source rate>,scale=<width>:-2" frames/%05d.png`. A 30 fps source cannot give a 60 fps
   answer. Row boundaries read from a contact sheet are only as precise as the sheet's rate;
   say so.
3. **Text** with `tesseract <frame> - -l <language of the reference>` (`eng` for an English
   site; `heb+eng` only when Hebrew is on screen) on a frame at source resolution, cropped to
   the page. Small text and running counters stay unreliable: quote what was read and mark it.
4. **Timing, by script.** For each effect that is timed:
   - track one edge of the moving element across its frames and write the positions to
     `track-R-n.csv`. Template matching on the element holds up on blended or doubled frames
     (common in reels), where frame-to-frame correlation does not;
   - when the tracked edge leaves the screen, continue with another edge of the same element
     and say so;
   - duration = (last frame − first frame) / frame rate, with both frame numbers written;
   - fit the curve (linear, ease-out, a spring that overshoots) and state the error of the fit.
     Report the positions, not only the name of the curve.
5. **Clock or scroll.** A motion that fits no single curve, has more than one burst of speed,
   or moves in step with a counter or with the page is following the scroll, not a clock. It
   has no duration: the row records what moves per unit of scroll, as well as it can be read,
   and says that this is a reading.

A measurement that could not be made is written as such. A guessed number is never written as
measured.

## Early show

Every round that produces something visible starts its report with one line: the link, what is
in it, what is not yet. `redesign/tools/early-show.sh <url> <commit>` checks the link before it
is sent: it is on one of his own domains or a claude.ai artifact (never `*.vercel.app`), the page
answers 200, a made-up path under it does not, and the page carries the round's commit id.
