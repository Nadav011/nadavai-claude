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
4. the tour inventory (G-19): every screen and every important action, each with its tour or
   the reason it has none, and which screens are the core screens (at most five) whose tour
   opens by itself.

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
לסיור", 10.11.2026 [A]). On a core screen the tour opens first and the card appears when it
ends or is skipped; the card then stays until she closes it, and after that "הראו לי" lives in
the panel and in the list. One thing with several ways in.

**Tours (G-07, G-08, G-16, G-19, G-20).** Nadav's answers of 10.11.2026, as typed or picked. In
the planning session, after he played three built versions on a copy of MediZen's demo:
- which style: "a ו B משולב ותשלח את זה גם לסשן של העיצוב שיכניס את זה שגם אצלו זהי יה הככה"
  [N]. A is "shown to you" (the screen dims, a light circle, one sentence, "הבא"); B is "do it
  together" (she does the step herself on the sample record);
- shown the built combined version (the screen dims and a light circle marks the real control;
  she presses the real control herself inside the circle, on the sample patient; a step that
  only explains, or points at a control that tells a real person, gets "הבא" or "הבנתי" and the
  tour never presses it): "כן מעולה ותמיד מקצה לקצה ותמיד הכי מקיף שיש ומסביר וקולע בול" [N];
- shown "every screen and every important action has its own tour, up to four steps and twelve
  words a step, under a minute; in help a list like levels in a game; the owner sees who on the
  team learned what": "כן מעולה מבחינתי לכל דבר שיהיה סיודר ואז יהיה אפשר לעושת תא הרישמה
  הזאת" [N] for a tour for every thing and for the list; the numbers and the owner's view came
  inside that option [B];
- the card and the tour: he picked "הכרטיס הוא הכניסה לסיור", whose text was: on the first
  visit the tour opens by itself once; afterwards the card stays on the screen with "הראו לי",
  which starts the same tour; one thing, two ways to reach it [A].

In the design-skill session, the same evening:
- which tours open by themselves: he picked "רק במסכים המרכזיים" [A];
- who sees "who learned what": "רק בעל העסק, וכל אחד רואה את שלו" [A]; what it shows: "לכל סיור:
  סיים או עוד לא" [A];
- on the four-step cap he asked "למה רק עד 4 ? כמה שלבים שצריך לא ?"; shown chapters against one
  continuous tour, "נראה ליא אחד וגם לשני כי 4 זה נשמע קצר מידי לא יודע תחשוב על זה אתה מה כי
  נכון לעושת"; and then "זה גם לא נכון לעצור באמצע מדריך כי זה 4 או לא להראות משהו שלוקח לו
  יותר מ4 וחשוב כי זה 4" [N]. So there is no cap on steps: a number never cuts a tour and
  never drops something important. How a long job is laid out (chapters, below) he left to
  this session [I].

**How long, and a long job.** A tour takes as many steps as its job needs to reach a result the
person can see ([N], above). What keeps it light is not a count. It is one sentence a step, at
most twelve words ([B]); her doing the step, not reading about it; and breaking a long job
where the job itself has results. "סגירת טיפול ותשלום" has three: the treatment is closed, the
payment is taken, the receipt is sent. Each is a chapter that ends when its result is on the
screen; its finish starts the next in one tap, the progress shows the whole ("פרק 2 מתוך 3"),
and a person who stops between chapters has finished something whole and comes back to the
next one. A chapter is never broken at a count, and a job with one result is one tour however
many steps it takes. Why break at results at all: the more steps in one sitting, the fewer
people finish (Chameleon's 2024 benchmark: tours of more than four steps complete below the
average, five-step tours about 21.6%, https://www.chameleon.io/benchmark-report-24; Produktly's
2026 figures as reported: three to five steps 38%, six to eight 25%, nine or more 8%,
https://produktly.com/research/saas-onboarding-benchmarks-2026). Those are "next, next" tours
and ours has her do the step, so our own numbers decide: every tour's skip rate and the step
where people leave are measured in the product (#100), and a tour people leave is rewritten.

**When a tour opens by itself.** Only on a core screen, once, on the first visit (#100 [A], and
his pick of 10.11.2026 [A]); not inside the setup wizard, and at most one automatic start a day
(#485 [A]). It waits for a plain arrival: the screen's data and the first target are on screen,
no sheet is open, and she has typed or tapped nothing since arriving ([B], MediZen's spec); a
tour that takes the screen from a person in the middle of typing is worse than no tour. On a
short screen the tour still opens, because its card lies over the dimmed screen and takes no
room from the work; the first-visit card keeps G-15 ([I]). When the tour ends or is skipped the
first-visit card appears, with "הראו לי". Every other tour is started by the person.

**A step.** Each step is classed before the tour is written: its action on the sample record
is safe to do (G-20); or it tells a real person; or it is permanent or charges. On the first
kind the person does the step herself and the step moves on only when the screen shows the
result the step names (a condition written in the manifest, not a timer). On the other two the
step says what the control does, has "הבנתי", and the tour never presses it and never moves on
because it was pressed.

**Safe to do is proven, never assumed (G-20).** The built demo held the notice back in the
browser only. In a real app the sample patient has the therapist's own phone (#93), and
MediZen's spec records nine automatic senders that fire on a future sample appointment. So a
step is "do it yourself" only with a test on the real app showing that nothing leaves for that
action on the sample record, now or later, that it is held on the server by the sample flag,
and that what the step created is removed when the tour ends and never takes a slot a real
person can see. Until that test exists the step is a "הבנתי" step. An "undo" toast is not
"safe": a notice held for ten seconds leaves after the tour has moved on.

**The rest of the screen does not respond**, and that is done with the platform's own
mechanism (`inert`, or `aria-hidden` on the siblings), which also stops the app's keyboard
shortcuts and a screen reader's activation; see-through blocks over the page stop a finger
only. The tour's card is not `aria-modal` over the control it points at, or a screen-reader
user cannot do the step. The step's result is announced in a live region. With the on-screen
keyboard open, the card and the lit control are both above it. A do-it-yourself target that
cannot be reached by keyboard makes the step a showing step. A tap outside the light pulses it
again and says where to press.

Also part of the contract, from the built version ([B]): "דילוג" on every step and progress
dots; a skipped tour does not open by itself again; "הראו לי שוב" resumes at the same step and
puts the person back where she was (a window reopened, the sample record selected again), never
over something she chose or typed since; focus stays between the card and the lit control, and
Esc ends the tour; with reduced motion the light does not pulse. With no sample record a tour
only shows where to press, and offers to bring the sample back only where the project allows
one at that moment (a clinic that imported its data has none). A missing target degrades to a
centred card with "הבא", never to a broken overlay.

**The tour list (G-17, G-18).** The help panel lists every tour like the levels of a game: how
many were learned out of how many, what is left, and a tap starts one. It is built from the
inventory (G-19), so a screen or an action without a tour shows up as a gap when the list is
generated, not when a user looks for it. The owner of the business sees, per tour, who finished
it and who has not yet; only the owner sees the team, each team member sees her own, and there
is no total per person, no score and no ranking (his picks, 10.11.2026 [A]). It is a view of
staff activity: who else may see it is a permission, asked of Nadav, and the request of any
other role for it is refused by the server and tested.

Not tested when this was written: WebKit, a real phone and a screen reader; the chapter
finish; and how the list and the owner's view look, which no demo has drawn yet.

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
(G-19) and the list (G-17, G-18) are work-tool rules. A tour that a consumer app does have
keeps every limit of G-07 and follows G-08 and G-16; with no sample record its steps only show
and never ask her to do. If a consumer screen
needs an explanation to be used, the first fix is the screen.
