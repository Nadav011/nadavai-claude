# The help system

The part of the standard Nadav called the differentiator: "a non-technical therapist manages
alone: explanation, video, AI helper on every screen" (#181 [N], #3 [N]), so that people manage
end to end without calling him. Rule ids (G-01 ...) refer to [experience.md](experience.md);
decision numbers to `~/design-redesign/therapy-flow-v2/DECISIONS-ANSWERED.md`; source tags as
defined there. The detailed spec this was distilled from is
`~/design-redesign/tf2-spec/spec/01-shell-help.md` (HL-01 to HL-12) and MediZen's BRIEF.md.

No live app has built this yet (MediZen's app has no `src/help/` on 2026-11-10). So this file is
a contract and a set of warnings, not a component. When MediZen's first wave builds it, the
reusable parts are extracted and this file points at them.

## Decide in the first design round, not at the end

Help caused three of the five high-severity findings in MediZen's tenth round, because it was
added on top of finished layouts. In the first round of any work-tool design, decide and draw:
1. the one door in the top bar and the one entry in the screen header (G-01), on a phone and on
   the real small screen;
2. what a first visit looks like (G-06) and that it sits inside the page flow;
3. where the panel opens (docked beside the work on a desktop, a sheet on a phone).

## The contract

**Entry points (G-01, G-03).** A fixed "עזרה" on every screen, "מה עושים כאן" in the screen
header, and "מה זה?" beside unclear fields; all three open the same panel (#99 [A]). On a phone
the header entry is one icon, because a header with both entries overflowed at 320 (#510 [A]).
A labelled word beats an icon alone in the top bar ([B], kept by the r11 critique).

**The panel (G-02).** One panel for every door ([B]): docked at the inline-end on a desktop so
the work stays usable beside it, a tall sheet on a phone. It holds the screen's article (what the
screen is for, then three to five numbered tasks), "הראו לי" (closes the panel and starts the tour
on the live screen), related articles, "what's new", and the question field. Content is filtered
by role and plan (G-10).

**One source (G-02, G-09).** One content file per screen, under one folder (MediZen planned
`src/help/`), from which the panel, the public help centre, the tours and the videos are all
built (#104 [A]). A test fails when a route reachable from the menu has no file (`help-route`).
Screenshots in help are synthetic, never real data.

**First visit (G-06).** A small card, once per screen, never again after it is closed (#330 [N]).
He liked it enough to ask for it on every screen (#401 [N]). It is one quiet card inside the
page, one line on a phone, and never opens by itself on a short screen ([B]).

**Tours (G-07, G-08).** Once per core screen, skippable, resumable, at most five steps (#100
[A]); not inside the setup wizard, at most one automatic start a day (#485 [A]). Each task is
classed: reversible in place, tells a real person, or permanent. On the last two the tour stops
at the button. A manifest check fails a tour that clicks a committing control (`tour-no-commit`).
A missing target degrades to a centred card, never to a broken overlay. Step text is at most
about twenty words.

**Videos (optional per project).** Generated from the same manifest as the tours, on synthetic
data, so a video never shows an old menu. Captions always on, never autoplay, a numbered step
list as the text alternative (#102 [A]). Voice ships only after Nadav has heard samples;
captions alone are the floor. Never recorded against production: issuing a document there
creates a real one.

**Setup wizard and start list (work tool).** Full and explanatory, "אעשה אחר כך" on every step,
never blocks entry; what was skipped falls to a start list (#94 [N]). The start list shows
progress, one row per step with its state, and one continue button (#331 [N] after he called the
first one "גרועה").

**A person (G-14).** A named channel with hours (#101 [A]), reached from the panel through
"עדיין צריך עזרה".

## The AI helper: a contract, decided per project

It lives inside the help panel, not in a floating bubble, and is called just "עזרה" (#103, #127
[A]). It answers only from the written help and shows the article it used. It offers "הראו לי".
It hands over to a person. It never receives personal data and never writes anything. It has a
monthly cost cap, and at the cap it falls back silently to article search (#174 [A]).
Turning it on in a project starts a running cost: that is asked of Nadav at that moment, with the
measured cost per question.

## What went wrong, so it is not repeated

- Help was offered three or four times on one screen (a top-bar word, a header link, rows of
  lone "?", a legend of nine "?" buttons) and read as "not finished". One door, one header entry,
  quiet "מה זה?" only where a field is unclear (G-05).
- A help card, a what's-new card and a waiting strip stacked above the calendar left 1.5 hours
  of it visible at 1280x648. First-visit content appears once, never above the work, and
  "what's new" lives in the panel (G-06, G-12, S-11).
- A phone header with both "מה עושים כאן" and "עזרה" overflowed by 30px at 320. One icon.
- Many "?" were first read by a reviewer as a sign of an unfinished product; he still chose "?"
  beside every unclear field with no cap (#345 [A]), so they are designed quiet.
- Video and voice were the slowest part of the whole system. Plan them last and keep captions
  as the floor.

## For a consumer app

The door and the panel stay (G-01, G-02), short. No "מה זה?" beside every field, no sample
record, and a tour only when the first screens cannot be made obvious. If a consumer screen
needs an explanation to be used, the first fix is the screen.
