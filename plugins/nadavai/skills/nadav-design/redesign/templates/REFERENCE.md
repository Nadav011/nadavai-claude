# REFERENCE · <project>

The reference Nadav gave: <url or file>, on <date>, in his words: «<what he typed>».
Procedure and rules: `shared/reference.md` of the nadav-design skill. A row closes only with his
numbered answer; `python3 tools/decisions-open.py REFERENCE.md` counts the open ones, and
`python3 tools/reference-coverage.py REFERENCE.md --total <length>` checks that no stretch of the
reference is left without a row.

## How it was measured

- Source: <a live site at <width>px · a screen recording · a film of a screen>, <size>, <frame
  rate from ffprobe>, <length or page height>.
- What every number below depends on: <the scale of the extracted frames; for a film of a
  screen, where the page sits in the frame and how much the camera drifts>.
- Not measurable from this source: <for example colours and fonts from a filmed screen>.

## Assets it needs before anything is built (and who supplies each)

- <for example: a professional portrait of the owner, landscape, plain background · Nadav>

## Always there

What holds through the whole reference and is usually what "this style" means: the light and the
set, the type, the accent colour, a fixed header or HUD, the way titles and numbers behave.

| id | what | measured | מצב |
|---|---|---|---|
| K-1 | <for example: near-black set, one gold accent, wide technical display type> | <values and how each was measured, or "not measured"> | פתוח |

## Sections and effects, in the order they are seen

| id | what | how it moves | measured | needs | frames | מצב |
|---|---|---|---|---|---|---|
| R-1 | [0–<end> s] <the first thing a visitor sees> | <trigger · what moves · from where to where · timed or tied to scroll> | <duration, delay, easing, sizes · how each was measured, or "not measured"> | <assets> | reference/R-1.png · built/R-1.png | פתוח |
| R-2 | [<start>–<end> s] | | | | reference/R-2.png · built/R-2.png | פתוח |

## Differences on purpose

A row that will not match the reference, with the reason and his answer number.

| id | what differs | why | answer |
|---|---|---|---|
