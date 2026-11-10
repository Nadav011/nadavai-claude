# Working from a reference Nadav gave

When Nadav points at something and says "like this" (a site, a screen recording, a screenshot,
another app), the job is to build that, not a concept inspired by it. Three times he answered a
concept with "אפילו לא קרוב" (nadavc.ai 26.10 and 27.10.2026, Camstore 5.11): each time the agent
had replaced his reference with ideas of its own and showed him nothing until all of it was done.

This file applies in every track and mode, whenever a reference exists. It is mandatory in the
`site` track.

## The rule

1. **Deconstruct before designing.** The first deliverable is `REFERENCE.md` (template:
   `redesign/templates/REFERENCE.md`), not a mockup: one row per section or effect of the
   reference, in the order a visitor meets them.
2. **Build the first row and show it.** One section (the hero first), on the real page, at a
   link he can open. Nothing else is built until he has answered that row.
3. **Then row by row, in order, on the same page.** He judges one cohesive page, not isolated
   effect modules.
4. **No alternatives, no metaphor "worlds", no extra layers** (a site-wide particle field was
   rejected the same day) unless he asks for them.
5. **A row closes only with his numbered answer.** "Built" is not closed. A row that differs
   from the reference on purpose needs his answer saying so.
6. **A fresh reviewer compares the built page with the reference before he sees each row**,
   using the frame pairs, and reports differences; it does not judge taste.

## What a row holds

| Column | Content |
|---|---|
| id | R-1, R-2 ... in the order a visitor meets them |
| what | the section or effect, in plain words ("big headline parts and his portrait opens in the middle") |
| how it moves | trigger (load, scroll position, hover, tap), what moves, from where to where |
| measured | durations, delays, easing, distances, sizes, fonts, colours: numbers from the procedure below, each with how it was measured; "not measured" is allowed and visible |
| needs | assets the row cannot be built without (a professional portrait, a video, a 3D model), and who supplies each |
| frames | the pair `reference/R-n.png` and `built/R-n.png`, same viewport |
| מצב | `פתוח` until he answers, then exactly `הוכרע · תשובה N` |

`python3 redesign/tools/decisions-open.py REFERENCE.md` counts the rows not yet closed (it reads
the «מצב» column, the same way it reads DECISIONS-OPEN.md). A gate that depends on the reference
reads that count, never a sentence.

Assets come first: a person-led hero is not built on a phone selfie. If a row's `needs` is not
met, that is said to him before the row is built, with what would be needed.

## Measuring a reference (the procedure, in this order)

A live site:
1. `dembrandt <url> --json-only` for colours, type, spacing, radii, shadows.
2. `/interfaces:explain-interface` on the section: computed styles, `document.getAnimations()`
   (duration, delay, easing, keyframes), scroll-linked timelines, whether it is DOM, canvas or
   WebGL. For a canvas or WebGL effect say so in the row: its shader cannot be read this way.
3. The `chrome-devtools` CLI for what loads and when (network, performance trace), and the
   `rea` web tools when the site's own bundle has to be read for a value.
4. Screens at the widths he will look at (a phone and a desktop), one frame per row.

A video or a screen recording (also the fallback for canvas and WebGL):
1. `ffmpeg -i ref.mp4 -vf fps=60 frames/%05d.png` (60 frames a second; state the source's real
   frame rate, since a 30 fps recording cannot give a 60 fps answer).
2. For each effect, find its first and last frame: duration = frames / fps.
3. Track one edge of the moving element across those frames (its pixel position per frame) and
   fit the curve: linear, ease-out, a spring that overshoots. Report the positions, not only the
   name of the curve.
4. `tesseract <frame> - -l heb+eng` for any text in the frame.

A measurement that could not be made is written as such. A guessed number is never written as
measured.

## Early show

Every round that produces something visible starts its report with one line: the link, what is
in it, what is not yet. `redesign/tools/early-show.sh <url> <commit>` checks the link before it
is sent: it is on one of his own domains or a claude.ai artifact (never `*.vercel.app`), the page
answers 200, a made-up path under it does not, and the page carries the round's commit id.
