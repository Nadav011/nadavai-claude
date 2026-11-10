# The help system

The part of the standard Nadav called the differentiator: "a non-technical therapist manages
alone: explanation, video, AI helper on every screen" (#181 [A], #3 [N]), so that people manage
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
3. where the panel opens (docked beside the work on a desktop, a sheet on a phone);
4. the tour inventory (G-07): every screen and every important action, each with its tour or
   the reason it has none, and which one or two are core screens whose tour opens by itself.

## The contract

**Entry points (G-01, G-03).** A fixed "עזרה" on every screen, "מה עושים כאן" in the screen
header, and "מה זה?" beside unclear fields; all three open the same panel (#99 [A]). On a phone
the header entry is one icon, because a header with both entries overflowed at 320 (#510 [A]).
A labelled word beats an icon alone in the top bar ([B], kept by the r11 critique).

**The panel (G-02).** One panel for every door (#99 [A]; its anatomy below is [B]): docked at the inline-end on a desktop so
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
page, one line on a phone, and never opens by itself on a short screen ([B]). On a screen with a
tour the card is the way into the tour: it carries "הראו לי" (he picked "הכרטיס הוא הכניסה
לסיור", 10.11.2026 [A]). The card and the tour are one thing with two ways in, never two things
shown one after the other.

**Tours (G-07, G-08, G-16).** His answers of 10.11.2026, given in the planning session after he
played three built versions on a copy of MediZen's demo, and recorded with the questions in
`~/.omc/plans/medizen-tour-answers-2026-11-10.md` on the LENOVO:
- the style: "a ו B משולב" [N], and on the built combined version, "כן מעולה ותמיד מקצה לקצה
  ותמיד הכי מקיף שיש ומסביר וקולע בול" [N]. A is "shown to you" (the screen dims, a light
  circle, one sentence, "הבא"); B is "do it together" (she does the step herself on the sample
  record). Combined: every step looks like A, and a step that is safe to do is done like B;
- how many and how long: shown "every screen and every important action has its own tour, up
  to four steps and twelve words a step, under a minute, and a list in help like levels in a
  game", he answered "כן מעולה מבחינתי לכל דבר שיהיה סיודר ואז יהיה אפשר לעושת תא הרישמה הזאת"
  (as typed) [N]. The caps and the owner's view came with the option he approved [A].
  This replaces "at most five steps" of #100 and the "about twenty words" this file had.

A tour is short and there are many of them: one long tour does not teach. Each covers one job
from its first tap to its result. A tour opens by itself only on a core screen, once, on the
first visit (#100 [A]); not inside the setup wizard, and at most one automatic start a day (#485
[A]). Every other tour is started by the person: from the card, from "הראו לי" in the panel, or
from the list.

Each step is classed before the tour is written: its action on the sample record is reversible
in place and tells no one; or it tells a real person; or it is permanent. On the first kind the
person does the step herself: the lit control is live, the rest of the screen does not respond
(a tap elsewhere pulses the light again and says where to press), and the step moves on only
when the screen shows the result. On the other two the step says what the control does, has
"הבנתי", and the tour never presses it and never moves on because it was pressed. The class
comes from the action's contract (`nadavai:action-safety`): booking for the sample record counts
as reversible only where that contract shows no reminder, message or charge leaves for it.

Also part of the contract, from the built version ([B]): "דילוג" on every step and progress
dots; a skipped tour does not open by itself again; "הראו לי שוב" resumes at the same step and
puts the person back where she was (a window reopened, the sample record selected again), which
is the only thing a tour does by itself; with no sample record the tour offers to bring it back
in one tap, or only shows where to press, and never practises on real data; focus stays between
the card and the lit control, and Esc ends the tour; with reduced motion the light does not
pulse. A missing target degrades to a centred card with "הבא", never to a broken overlay. A tour
that clicks a committing control fails the manifest check (`tour-no-commit`).

**The tour list (G-17, G-18).** The help panel lists every tour like the levels of a game: how
many were learned out of how many, what is left, and a tap starts one (10.11.2026 [A]). It is
built from the inventory, so a screen or an action without a tour shows up as a gap when the
list is generated, not when a user looks for it. The owner of the business sees which tours
each team member finished ([A]). That view is about learning: it is not a score and not a
ranking, only the owner and the managers he names see it, and a team member sees what it shows
about her ([P]; a project decides this with its permissions, and it is listed in the BRIEF).

Not tested when this was written: WebKit and a real phone; and how the list and the owner's
view look, which no demo has drawn yet.

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
record, and a tour only when the first screens cannot be made obvious; "a tour for every thing"
(G-07) and the list (G-17, G-18) are work-tool rules. A tour that a consumer app does have
follows G-08 and G-16; with no sample record its steps only show and never ask her to do. If a consumer screen
needs an explanation to be used, the first fix is the screen.
