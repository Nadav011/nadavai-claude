# Approved examples

Work Nadav approved in his own words, kept as examples to start from. An entry is never the bar
and never a template: another product, his own included, is one example among others
(`rejected.md`, "Another product as the bar"), and a project's own approved look wins over it.
Read it beside `rejected.md` before proposing anything visual, and say which example a proposal
starts from.

How an entry is added: only with words he typed about that work, quoted character for character,
typos included, each quote on one line so it can be compared with its record, with the date and
the file that records them. Hebrew in plain quotation marks is his; «» marks a label on a screen. An agent's account of his approval, without his words, is not an entry
(the study of 14.11.2026 found several such, among them MediZen's r10 prototype as the model of a
working product and the Camstore owner board's direction demo, each called approved only in an
agent's words). Each entry says what it is an example of and what it is not, so it is not copied
past its point. A reading of his words that he has not confirmed is marked as one, and `[I]` marks
this skill's own reading, as in `experience.md`.

## SportChat's partner demo

- **Where:** https://demo.sporchat.app/app/, behind a password gate: Nadav gives the code when it
  is needed, and it is never written into a file. The source is
  `~/sporchat-design-backup-2026-09-22/scratchpad/v4/partner/` at commit `8f94ad8` (11.10.2026), a
  local folder on the LENOVO whose git repo has no remote, so no other machine has it: `shell.js`
  (router, panel and walkthrough engine), `shell.css`, `tours.json` (seven walkthroughs, 40 steps)
  and `build-partner.py` (builds the page and fails when a step's target is not on its screen).
- **His words, 14.11.2026:**
  - "מגניב לחלוטין גם הדרך של הכרטסיות וגם הדמו של האפליקציהגם השלבים כמו מה שאנחנו עושים ב MEDZIEN"
  - asked what to do with it in this skill: "להכניס את זה כדוגמא יהיה מעניין לראות ודוגמאות אחלרות אבל זה בין הטובים בנוסף הסיור אפשר ללמוד מממנו לסיורים שאנחנו בונים לא ? כי הוא מאוד נוח וטוב"
- **Record:** memory `feedback-demos-playable-not-catalog` (`~/.claude/projects/-home-nadavcohen/memory/`).
- **What it is:** one phone that plays like the app; beside it a panel with one sentence on the
  product, how to play, light and dark, «התחלה מחדש» (which puts back everything the visitor
  changed), a card per walkthrough (an icon, a title, one line), then the screens by area. A
  walkthrough dims the phone, lights one place per step and shows a small bubble with the
  walkthrough's name, a title, one or two lines, dots for its length, «הקודם» and «הבא».
- **An example of:** a playable demo whose first door is the walkthroughs, not a catalog
  (`redesign/README.md`, step 3); the walkthrough card; a walkthrough step that lights one place
  with one small bubble and shows how long the walkthrough is; for the tours we build in apps,
  something to learn from, as he asked, through `help-system.md` and never by copying its engine.
- **Not an example of:**
  - an in-app tour: its «הבא» presses the control for the visitor, which a tour in a live app never
    does (`experience.md`, G-08), and a tap on the lit area counts as «הבא», while in an app the lit
    control of a showing or stop step does not respond (G-16);
  - a length rule: its build holds a walkthrough to four to seven steps, and a tour here has no cap
    (G-07);
  - a fixed template, or the bar for other products (`rejected.md`, "Another product as the bar",
    #177, #194);
  - the defects found by reading its code (the study of 14.11.2026,
    `~/.omc/plans/agent-reports-2026-11-10/sporchat-demo-tour-study.md`, §5), which nothing copies: a
    new step is not announced, only its count is, so a screen-reader user hears a number and not the
    step; focus goes to the phone's screen when the walkthrough closes, not back to the card that
    started it; a tap outside the light gives no feedback; a tap on the lit area always counts as
    «הבא», so a visitor who pressed the control thinks she used it; the walkthrough's name is not in
    the bubble's accessible name; the bubble is `aria-modal` while the side panel still takes a
    mouse; the start cards are `aria-pressed` toggles that do not toggle; the empty-tap hint is
    visual only; its message bridge checks no origin; the address follows the screens, so a reload
    or a shared link mid-walkthrough loses it; and 8 of its 40 step texts run over twelve words,
    which `tour-shape` fails in a manifest.
- **Reading not confirmed with him:** "הכרטסיות" = the walkthrough cards in the panel; "השלבים" =
  the steps inside a walkthrough.

## MediZen's combined tour

- **Where:** the built version he played in the planning session of 10.11.2026, on a copy of
  MediZen's demo: the screen dims and a light marks the real control; she presses the real control
  herself inside it, on the sample patient; a step that only explains, or points at a control that
  tells a real person, gets «הבא» or «הבנתי», and the tour never presses it.
- **His words, 10.11.2026:** "כן מעולה ותמיד מקצה לקצה ותמיד הכי מקיף שיש ומסביר וקולע בול".
- **Record:** `standard/help-system.md`, "Tours (G-07, G-08, G-16, G-19, G-20, G-21)", his answers
  of 10.11.2026.
- **An example of:** the in-app tour this standard is built on (`help-system.md`, G-07, G-08,
  G-16): dim, light the real control, she does the step herself on the sample record, a stop step
  at a control that tells a real person, and the job taught to its end ("תמיד מקצה לקצה").
- **Not an example of:** a number of steps: the option he approved that day said up to four steps a
  tour, and the same evening he rejected that cap (`help-system.md`, "Tours", the four-step
  answers, G-07).

## SportChat v4 and MediZen as default starting points

- **Where:** SportChat v4's design (the demo's repo,
  `~/sporchat-design-backup-2026-09-22/scratchpad/v4/`, local to the LENOVO) and MediZen's design
  (`~/design-redesign/tf2-r12`, round 13 on that day).
- **His words, 11.11.2026,** correcting an agent's line that SportChat's geometry is his line for
  all apps:
  - "זה לא נכון תמיד פתוח להצעות אבל כן בין הדברים הכי יפים וגמורים שלי גם MEDZIEN שיסגר אבל כבר בסבב 13 ועוד כאלה שיהיו הברירת מחידךל"
- **Record:** memory `feedback-design-defaults-open-to-proposals`
  (`~/.claude/projects/-home-nadavcohen/memory/`).
- **An example of:** the starting point for a new screen or app when nothing else is decided, with
  the proposal saying which one it starts from; later finished designs join them
  ("ועוד כאלה שיהיו").
- **Not an example of:** a fixed line for every app, which is the reading he corrected; MediZen
  before it closes ("שיסגר"); something a project's own approved look must yield to (the memory's
  reading, not his words: cash chose its own palette on 18.10.2026) [I].

## The new SHIFTS and MediZen as the level of a new app's components

- **Where:** the new SHIFTS (its DESIGN.md; the memory points at the «Ink & Volt» look in
  `~/design-redesign/shifts-look.git`) and MediZen's BRIEF, «Shared components» and «Motion»
  (`~/design-redesign/tf2-r12/BRIEF.md`).
- **His words, 14.11.2026,** on the Camstore owner board:
  - "תלמד עקרונות של SHIFTS החדש ושל MEDZIEN להוספה של עוד דברים"
  - then "גם מבחינת איכות קוננטים עשיוראת של וזה"
  - asked what rich meant, against three options: "1 2 כן 3 רק אם צריך בלי מה שלא צריך". The options
    were (1) every component with all its states and behaviours: yes; (2) a richer look toward
    SHIFTS' new one (cards lifted on a soft shadow, heavier titles, one coloured card for what is
    next): yes, shown to him before and after; (3) more kinds of components: only when a screen
    needs one.
- **Record:** memory `feedback-rich-components-like-shifts-medizen`
  (`~/.claude/projects/-home-nadavcohen/memory/`).
- **An example of:** the level of a new work tool's components: each with its full list of states
  and behaviours, on a maintained library, and a richer look than an austere one, shown to him
  before and after.
- **Not an example of:** more kinds of components than the screens need ("3 רק אם צריך"); a licence
  to change a look he already approved without showing him (the memory's reading, not his words)
  [I].
