# The experience standard

What every screen Nadav ships has to do for the person using it, beyond looking right. It began
in the MediZen redesign ("help next to everything", the box that guides you when you did
something wrong, the AI helper) and he made it the bar for every app: "נראות פשטות ומקסימום
יכולות והכי נוח לשימוש". It applies to a screen being built or changed, in a new project and an
existing one. An existing app is brought up to it by `audit`, which measures every screen against
this file and writes the gaps into `docs/ui-audit/PLAN.md` by priority.

This file is the contract. It is not a process (the modes of nadav-design are the process), not
a visual language (each project's BRIEF.md and DESIGN.md hold that), and not the action contract
(`nadavai:action-safety` owns completion truth and recovery for business actions; rules here
point to it).

## How to read a rule

Every rule has an id, a source tag and a check.

Source tags:
- **[N]** Nadav decided it or said it himself. Never overridden without asking him.
- **[A]** Nadav chose it among options. Same weight as [N].
- **[B]** Written by an agent in a brief or plan he approved as a whole (MediZen's BRIEF, the
  rebuild plan of 10.11.2026). A default.
- **[I]** Inferred by an agent under a general go-ahead. A default.
- **[P]** Proposed by this skill; he has not seen it as a rule. A default, and the first
  candidate to drop if it gets in the way.
- **floor** The rule applies a gate of Nadav's global rules to this standard
  (`action-safety.md`; `working-style.md`, Approval gates: no message to a real person, no
  charge and nothing that cannot be undone without a decision). Not a default: a project
  relaxes it only by asking him. Its wording is improved in this file only, never in a
  project's BRIEF.
A project may override a [B], [I] or [P] default by writing the override and its reason in its
BRIEF.md. Decision numbers (#99) refer to `~/design-redesign/therapy-flow-v2/DECISIONS-ANSWERED.md`
unless another source is named. "Tour answers 10.11.2026" are his answers on first-visit tours,
quoted in [help-system.md](help-system.md).

Checks:
- **auto: `<id>`** a check that can fail, listed in the table at the end.
- **walkthrough** the task walkthrough (one tour per main job).
- **ledger** the capability ledger of a redesign (what exists today against what the design keeps).
- **action-safety** the `nadavai:action-safety` skill's own verification of the action.
- **reviewer** a fresh reviewer reads the screen against the rule; no machine check exists.
- **none** nothing checks it yet.
A rule without an automated check erodes: in SportChat v4, 24 of 183 must-fix findings were
checks that could not fail. So `audit`, `screen` and `ship` print how many rules of this file
were checked by `reviewer` or `none` on the screens they covered.

Which rules apply depends on the project's profile: [profiles.md](profiles.md). Rules marked
*(work tool)* apply to that profile only.

Terms used below. A **screen** is the top layer a person is looking at: the page, or the dialog
or sheet open over it, alone. **Accent-filled** means filled with the project's action colour
token. A **core screen** is one of the at most five screens the BRIEF names as the product's
daily work. An **unclear field** is one whose label alone does not tell a first-time user what to
enter or what will happen; the spec lists them per screen. A **short screen** is a viewport under
720px high. **Small** (E-07) means one list item or one field that can be restored in place.

Markers the checks read (web): help entries carry `data-help="door"` (top bar), `"screen"`
(header) or `"what"` (beside a field); a state root carries `data-state` with `empty`, `clear`
(nothing is waiting, which is good news), `filtered-empty`, `loading`, `error`, `offline`,
`no-access` or `read-only`. A screen's empty and error variants are the `?state=empty` and
`?state=error` routes that setup step 12 already puts in `e2e/dod/routes.json`.

## 1. Guidance: the person always knows what this screen is for and what to do

| Id | Rule | Source | Check |
|---|---|---|---|
| G-01 | Help sits in the same place on every screen: one labelled door ("עזרה") in the top bar, and one entry in the screen header ("מה עושים כאן"; on a phone a question-mark icon in a circle at the end of the header card). | #99 [A], #510 [A] | auto: `help-door` |
| G-02 | Every door opens the same panel, fed by one content source per screen. No second help surface. | #99 [A] | reviewer |
| G-03 | *(work tool)* An unclear field or label has "מה זה?" beside it: a small (i) with the words, a 44px hit area, opening the panel at that paragraph. There is no cap on how many, so each one is quiet and never takes a row of its own on a phone. | #345 [A] | reviewer |
| G-04 | A tooltip is never the only explanation of anything: tooltips fail on touch. | [B] | auto: `tooltip-only` |
| G-05 | Help is offered once per place, not three or four times on a screen. Beyond G-01 and G-03, no legend of "?" buttons, no repeated help links. "הראו לי" on the first-visit card, in the panel and in the tour list is one thing with several ways in (G-06). | [B], from the r10 critique; one thing with several ways in: tour answers 10.11.2026 [A] | reviewer |
| G-06 | First visit to a screen shows one small card ("ככה זה עובד") with what the screen is for. On a screen that has a tour the card is the way into it: it carries "הראו לי", which starts that screen's tour. On a core screen the tour opens first (G-21), and the card appears when the tour ends or is skipped; while the tour's automatic start waits (G-21), the card shows at once, alone, and a card she closed then does not come back after the tour. On a short screen the card never appears by itself (G-15), also after a tour: "הראו לי" is in the panel and in the list. The card stays on the screen until the person closes it; once closed it never returns, and the same content and "הראו לי" stay behind G-01. | #330 [N] (closed for good), #401 [N], tour answers 10.11.2026 [A] (the card is the way into the tour and stays with "הראו לי"); the card while a start waits: MediZen's spec, HL-02 [I] | reviewer |
| G-15 | That card sits inside the page flow, never above the work: one line on a phone, and it does not open by itself on a short screen. | [B], from the r10 and r11 critiques | auto: `core-unit` |
| G-07 | How long a tour is. It runs as many steps as its job needs to reach its result: it is never cut in the middle because of a number, and nothing important is left out to keep it short. A result is a change to the record that the screen shows and that the help article names as the task's outcome (a visit is booked, a note is saved); selecting, opening or filling something is not a result. A tour is kept light by its words, at most twelve a step (a step that needs more becomes two steps, never a trimmed one), and by where it breaks: a job that has several results of its own is taught as chapters that follow one another. A chapter ends only at a result or at a stop step (G-16), never at a count; its finish says what she did and offers the next chapter as its main button, with stopping as the quiet one, and the progress shows the whole ("פרק 2 מתוך 3"). Every step can be skipped, and a tour resumes at the step where she stopped (G-20 says when it resumes at the chapter's first step instead). The skip rate of every tour and the step where people leave it are measured, and a tour most people leave is examined again: the BRIEF names the skip rate at which that happens. Each tour has a switch that stops it opening by itself; using it on a core screen is asked of Nadav, who chose that those open by themselves (#100). | no cut and nothing left out because of a number: tour answers 10.11.2026 [N]; #100 [A] (skip, resume, measured, examined again when most skip; its "at most five steps" gives way to his words of 10.11.2026); chapters, what a result is and the chapter finish: he asked this session to decide [I]; the switch and a named skip rate: MediZen's spec, HL-03 [I]; twelve words came inside the option he approved [B] | reviewer (`tour-shape` once a project has a tour manifest) |
| G-21 | When a tour opens by itself. Only on a core screen (Terms: at most five), once per person and screen, never while a setup wizard is open or set aside in the middle of a step, at most one a day, and only on a plain arrival: she came by the menu, the bar or the home screen after login (not by a deep link, Back, an alert or a login redirect), the screen's data and the first target are on screen, no sheet is open, and she has typed or tapped nothing since arriving. A start that waits for any of these is not spent: the card shows meanwhile (G-06), and the tour opens on her next plain arrival, on a later day when another tour already ran today. A screen's tour opens by itself only for a person whose account was created after that tour shipped; whoever used the app before meets it once in "what's new" and in the list (G-12, G-17). Every other tour starts from the card (G-06), from "הראו לי" in the panel or from the list (G-17). | #100 [A] (once per core screen), #485 [A] (one a day, not in the wizard), tour answers 10.11.2026 [A] (only core screens open by themselves); the plain arrival, a waiting start that is not spent, and no automatic start for people who used the app before (G-12): [I]. MediZen's spec says it per clinic ("existing clinics get no automatic tour", citing #293:HELP-03); per person and per tour is this skill's reading, so a new team member of an old clinic gets one; a project's own spec wins over this reading, and in MediZen no one in an existing clinic gets an automatic tour until Nadav says otherwise | reviewer (`tour-shape` once a project has a tour manifest), and `tour-auto-start-age` in the project's own tests |
| G-19 | *(work tool)* Every screen and every important action has its own tour, or a written reason why it has none. An important action is a numbered task of the screen's help article; a screen with more important actions than its article holds lists the rest in the inventory. The list of them is the tour inventory. | a tour for every thing: tour answers 10.11.2026 [N]; what counts as an important action, and the written reason: this skill's [I] | reviewer (`tour-inventory` once a project has a tour manifest) |
| G-16 | How a tour step looks and moves on. Every step dims the screen, lights the real control and says one sentence (a chapter's finish, and a step whose target is missing, is a centred card). On a step that is safe to do (G-20) the person does it herself on the sample record: only the lit control and the tour's card respond, there is no "הבא", and the step moves on when the screen shows the result the step names. A step that only explains has "הבא". A step that points at a control that tells a real person, saves for good, charges or cannot be undone is a stop step and has "הבנתי": the tour never presses that control and never moves on because it was pressed. "הבנתי" goes on to a step that does not need the control pressed, or ends the chapter or the tour; the result is then the sentence that says what the control does, not the screen. On a step that only explains and on a stop step nothing on the screen responds, the lit control included; only the tour's card does, and only a do step's own target is live [I]. | the combined style (dim, light the real control, she does it herself on the sample record): tour answers 10.11.2026 [N] ("a ו B משולב", confirmed on the built version); the classes and the buttons are that built version's [B]; where a stop step leads: from the reviews of this rule [P]; nothing responds on a showing or a stop step, the lit control included: the built version made the target inert on those steps [B], written here from the fourth review of the manifest [I] | reviewer; `tour-anchors` (a test of the built engine presses the lit control of a stop step and shows that nothing happens) [I] |
| G-20 | When a step is safe to do. Only when a test on the real app performs that action on the sample record and shows that nothing leaves, now or later: no message, no charge, no calendar or webhook call, and no business event (a booking, a payment, an activation) counted in a report or in analytics; the tour's own step and skip events are counted. The test can show that only where every outbound effect of the app (messages, charges, calendar sync, webhooks, scheduled jobs) passes through one place that checks the sample record's flag: a check fails a sender that goes around it, and the test runs the scheduled jobs past the latest reminder. The hold is on the server, never on the screen; the flag cannot be changed by a user and the record's contact fields cannot be edited. Putting the hold into the senders changes who is messaged, so it goes through the replay of `action-safety.md` and is switched on only after Nadav's yes. Never safe to do on the sample in the business's real books, whatever a test shows: a step that issues a numbered document (a receipt, an invoice, a credit), takes or records a payment, or closes a record for good. The real books are every place in the live account where a document number is taken or the documents provider is called; a separate numbering inside the live account is not outside them unless Nadav says so. The one place she does them herself, to the end, is a practice mode of the project in which no document number is taken and no provider can be reached, proven by that mode's own tests: she enters it by her own tap from the tour's card, or is already in it; the tour never switches mode by itself; and outside the mode the step stays a stop step, held by the server, which refuses an action marked practice-only outside a practice session. Inside the mode the tour still runs on the sample record's copy, never on the copy of a real person's record. The manifest marks such a step practice-only and names the mode's test that shows no number is taken and no provider reached for that action; without that test the step is a stop step in the mode too. Leaving the mode, or its expiry, discards the copy: that is the removal, and a resume starts the chapter again from its first step. What a step created is removed when she finishes the job's last chapter, or at the end of the day on which she left the tour and did not come back to it; a resume after the removal starts at the first step of the chapter she was in, and a chapter she finished stays finished in the list. The removal is an action too: the test runs it and shows it tells no one (no cancel notice), and it never touches the practice data that came with the sample record. What a step created never takes availability a real person can see. An action with no such test is treated as telling a real person and gets "הבנתי". | floor (the global rules on messages to real people, on charges, on tax documents and on what cannot be undone); the wording came from the independent reviews of this rule and is changed in this file only; permanent steps done to the end inside practice mode: Nadav picked it for MediZen on 11.11.2026 [A], and it holds for another project whose mode gives the same proof [I]; how she enters the mode, the sample record's copy, the server's refusal and the named test: [I]; MediZen's spec records nine senders that fire on a future sample appointment | reviewer, and the test this row names |
| G-08 | A tour never presses a button that commits something: the person presses it herself on the sample record (G-16, G-20), or the step points at the button, says what it does in one sentence, and does not press it. The only things a tour does by itself are bringing her, when it starts, to its start state (go to its screen, set the view and the date, close a window that holds no unsaved input; go to the sample record and no named one [I], open no window [I], and with unsaved input ask first [I]; it never saves, sends or discards anything) [I], and putting her back where she stopped (reopen a window, select the sample record again), never over something she chose or typed since: then it asks. Tours run on the sample record, never on real data. Practice data that a tour or a later chapter stands on (a past visit, an open treatment) comes with the sample record, made by the app, never by a tour. With no sample record a tour only shows where to press; it offers to bring the sample back in one tap only where the project allows a sample record at that moment. | [B]; the built version he confirmed on 10.11.2026 [B]; never over what she typed since, the sample brought back only where allowed, and standing practice data: from the reviews of this rule [P]; going to its screen: the built version did it at every start; setting the view and the date and closing windows: where the tour needed it [B]; the sample record instead of a named one, opening no window, and asking before unsaved input: this skill's reading [I] | auto: `tour-no-commit` (half: `standard/tours/tour-check.mjs` judges from the manifest a resume action other than the two above, a `start` key other than `screen`, `record`, `view`, `date` and `close`, a do step that does not say `on` (`"sample"`, or `"none"` when it acts on no person's record), a do step that opens a person's record (`recordOpen`) and does not carry `on: "sample"`, and, with `--inventory`, `on: "none"` on a control the inventory lists on a person's record or row (`recordAnchors`, on any of its screens); it reads only the flag, so which record the bindings really pick, and whether `recordAnchors` lists every such control, is judged in the running app (`tour-anchors`); whether the engine itself presses anything, and asks before closing a window with unsaved input, needs the running app) [I] |
| G-09 | Every route a person can reach from the menu has a help entry. | plan of the help system [B] | auto: `help-route` |
| G-10 | Help content follows the reader's role and plan: nobody reads how to do what they cannot do. | [B] | reviewer |
| G-11 | *(work tool)* A new account gets a sample record to learn on, removable, never counted in reports. | #93 [A] | reviewer |
| G-12 | An existing user meets a change once, in a "what's new" entry that also lives in the help panel; it is never stacked above the work. | #96 [A], #395 [A] | reviewer |
| G-13 | A problem screen links to its own explanation ("מה זה אומר"); a reason that needs more than one sentence ends in "מה זה?". | [B] | reviewer |
| G-14 | There is a named way to reach a person, with hours, from the help panel. | #101 [A] | reviewer |
| G-17 | *(work tool)* The help panel lists every tour of the app like the levels of a game: how many the person learned out of how many ("למדת 7 מתוך 23"), what is left, and a tap starts one; chapters of one job sit one after another. The list is built from the tour inventory (G-19) and follows role and plan (G-10). | tour answers 10.11.2026 [N] (the list); how it looks is the option he approved [B] | reviewer |
| G-18 | *(work tool)* The owner of the business sees, for each tour, which team members finished it and which have not yet. Only the owner sees the team, and each team member sees only her own. It shows no total per person, no score and no ranking. Showing it to anyone else, or showing a count per person, is asked of Nadav, not written into a BRIEF. | tour answers 10.11.2026: the view came with the option he approved [B]; owner only, each sees her own, and finished or not yet per tour: he picked both [A] | reviewer, and `team-learning-access` in the project's own tests |

The help panel, the first-visit card, tours, videos and the AI helper are specified in
[help-system.md](help-system.md), with what went wrong when MediZen built them.

## 2. When the person goes wrong: the screen says what happened and leads to the fix

| Id | Rule | Source | Check |
|---|---|---|---|
| E-01 | A field error sits beside its field, in plain Hebrew, and says what is needed with an example ("מספר טלפון צריך להיות 10 ספרות, למשל 050-123-4567."). What was typed stays. On submit the focus moves to the first error; several errors get a summary with links. | #120 [N]; wording [B] | auto: `error-field` |
| E-02 | A disabled control always shows why, in a visible line. | [B] | auto: `disabled-reason` |
| E-03 | When the system knows the exact repair, the control becomes the repair: "אין מספר טלפון בכרטיס" with "הוספת מספר טלפון", not a dead "שליחה". | [B] | reviewer |
| E-04 | How a problem looks (what must be true of the action behind it is `nadavai:action-safety`'s). A problem screen says, in this order: what happened; what the problem is, or that it is not yet known; what was kept or already happened; the next safe step as the primary button, with a way out. Never "אופס", "משהו השתבש", a raw code, English, or blame. | #120 [N], #176 [N]; anatomy [B] | auto: `forbidden-words`; reviewer |
| E-05 | An error never disappears by itself and never sits in a toast. A toast confirms an outcome or offers undo. | [B]; the undo toasts are #43 [A], #69 [A] | auto: `error-toast` |
| E-06 | Success is shown only after the server confirmed it, and "sent" only after the provider confirmed. An uncertain outcome is shown as uncertain, with no retry that could send or charge twice. See `nadavai:action-safety`. | #423 [A] | action-safety |
| E-07 | Small and reversible beats "are you sure": the thing happens at once and a toast offers "ביטול" for about ten seconds. A dialog confirms only what cannot be undone or what reaches a person or money (E-08, E-09). This is the reading of the house line "dialogs confirm destructive actions". | #69 [A] ("דפוס כללי לכל רשימה") | reviewer |
| E-08 | Anything that reaches a real person, moves money or deletes for good shows the exact preview and waits for a yes (the contract is action-safety's; this is what the person sees). A change that messages someone says so inside the dialog, with a visible checkbox that names the person. | #423 [A], #43 [A] | reviewer; action-safety |
| E-09 | A confirmation names the thing in its title, states the consequence and what does not change, and offers an outcome pair ("ביטול התור" · "השארת התור"), never "כן / לא". The destructive button is never the default. | [B] | reviewer |
| E-10 | A screen a person has no access to explains who it is open to. It is neutral, not red, says who can change that, and a link to a closed screen lands on this state, never on a 404. | first sentence #116 [A]; the rest [B] | reviewer |
| E-11 | Offline is said under the top bar with the time of the cached data; a control that writes shows the reason instead of failing. | #107 [A] | reviewer |
| E-12 | Closing with unsaved changes asks, and "המשך עריכה" is the default. | [B] | reviewer |
| E-13 | Where the system did something by itself and a person may wonder why (a skipped message, an automation that did not answer), a "למה זה קרה?" gives the reason from a fixed list. | #472 [I] | none |

## 3. Input help: the form meets the person halfway

| Id | Rule | Source | Check |
|---|---|---|---|
| I-01 | A label above every field. A placeholder is never the label. A hint line under the label carries the format or the reassurance. | [B] | auto: `placeholder-label` |
| I-02 | Accept before rejecting: a phone with dashes, spaces or +972; a date as 1.2.26 or 01/02/2026; pasted text with stray spaces. | [B] | reviewer |
| I-03 | Every field carries the `type` and `inputmode` that fit its content, so the phone shows the right keyboard. A field for the person's own details (sign-up, login, checkout, profile, a one-time code) carries the matching `autocomplete`; a field where staff type someone else's details carries `autocomplete="off"`, so the browser does not offer their own. Input text is 16px or more, so iOS does not zoom the page. | [B] | auto: `input-attrs` |
| I-04 | A screen that saves by itself has no save button; one line tells the truth ("שומרים… / נשמר / עוד לא נשמר"). | #60 [A] | reviewer |
| I-05 | A form is short by default, with "עוד פרטים" for the rest. | #259 [A], #280 [A] | reviewer |
| I-06 | "Not set" is a real state. A default is never saved as if the person chose it, and nothing is pre-selected where the choice matters; the primary button lights after the choice. | #292 [A]; [B] | reviewer |
| I-07 | The form remembers: the last choice a person made is offered next time, and what the system already knows is filled in. | [P] | none |
| I-08 | A long form keeps a draft: closing the tab or losing the connection does not lose the typing. | [P] | none |

## 4. Simplicity against capability: every capability, without the weight

| Id | Rule | Source | Check |
|---|---|---|---|
| S-01 | Design for the least confident user first, without slowing the fluent one: explanation and large text first, shortcuts and fewer steps second. The BRIEF names who the least confident user is. | #134 [N] | reviewer |
| S-02 | On a phone, a task of several steps moves by a button from screen to screen. It is not one long page to scroll. | Nadav on the salon booking, 7.11.2026, as typed: "שזה גלילה ולא כפתור מסך פכתור מסך" [N] | walkthrough |
| S-14 | In such a task the primary action is visible without scrolling, a choice visibly changes what is in front of the person, and there is a place marker, a way back and a summary before the commit. | [B], from the review of that booking flow | walkthrough |
| S-03 | One accent-filled action per screen (the house rule in `templates/ui-rules/ui.md`; a dialog is its own screen). | he approved it for the house template, 10.11.2026 [A] | auto: `one-primary` |
| S-04 | Nothing a screen does today disappears or changes behaviour without his numbered answer. Many actions are grouped, not cut. | #222 [N], #262 | ledger |
| S-05 | Whatever is on the screen works from day one. A thing that promises what it does not do, or that nobody uses, is removed, with a redirect and its data kept. | #211 [A]; he said it himself about the public page, #146 [N] | reviewer |
| S-06 | A phone has at most five destinations in its bottom bar; the rest is under "עוד". A count is a number on the icon, never a bare dot. | #105 [A]; [B] | auto: `nav-count` |
| S-07 | A desktop has a labelled side menu: never icons alone, never a hamburger. | [B]; look of the menu #326 [N] | reviewer |
| S-08 | Three layers: what a person sees on day one, what opens as they use it, and what stays behind "עוד". The BRIEF lists which capability sits in which layer. | [B] | reviewer |
| S-09 | One thing is shown once, and one thing has one count everywhere; handling it anywhere clears it everywhere. | [B] | reviewer |
| S-10 | A number is on the screen only if it changes a decision and leads somewhere. A zero becomes a sentence; no wall of zero cards. | [B] | reviewer |
| S-11 | The chrome above the work stays small. The BRIEF defines the core unit of work at the real small screen (how many calendar hours, rows or messages must be visible) and every round measures it. | [B], adopted through #534 | auto: `core-unit` |
| S-12 | Text big, chrome small: text size and chrome size are tuned separately, and density switches on the pointer type, never on the width. | #408 [N], #534 [N] | reviewer |
| S-13 | *(work tool)* Home opens on today's work, with one strip of what is waiting; when nothing waits it is one calm line. | #10 [A] | reviewer |

## 5. States: every state is a designed screen

| Id | Rule | Source | Check |
|---|---|---|---|
| T-01 | Every screen is designed in every state it can be in: empty, filtered with no results, loading, error, partly loaded, stale, offline, no access, read-only, and its own. The error state is shown to Nadav like any other screen. | #120 [N], #176 [N] | auto: `state-coverage` |
| T-02 | Empty says the status, gives one cue and one action. Never "אין נתונים", never an apology. It never shows while loading or after a read failed. | [B] | auto: `empty-action` |
| T-03 | A filter with no results is a different state: "אין תוצאות למסנן הזה." with "ניקוי המסנן". A remembered filter always shows that it is on. | [B] | reviewer |
| T-04 | A loading skeleton has the geometry of the content, appears only after a delay (about 300 ms for a list, a second for a page), and after ten seconds becomes a sentence with a way out. | [B] | reviewer |
| T-05 | The screen tells the truth about what it shows: "מוצגות 50 מתוך 957" under a cut list, the age of cached data, "חלק מהשורות לא נטענו". | [B] | reviewer |

## 6. Words

| Id | Rule | Source | Check |
|---|---|---|---|
| C-01 | Gender-neutral Hebrew: action nouns on buttons, menus and tabs ("שמירה", "קביעת תור"); impersonal hints and errors ("אפשר לנסות שוב", "צריך להזין"); direct address only where it has no gender ("שלך"), and a plural imperative only where he chose one ("הראו לי", #103). No slash or dot forms. | #18 [N] | auto: `forbidden-words` |
| C-02 | One word per concept, plain words for technical ideas, and the project's glossary is part of its help. | #35-#38 [A], #104 [A] | reviewer |
| C-03 | Never: "נא", "אנא", "ניתן" (use "אפשר"), "כעת", "אופס", exclamation marks, emoji, English or technical words in the interface, a claim the system cannot back. | [B], from #18 and #81 | auto: `forbidden-words` |
| C-04 | Success is said as what changed and where it went, once it happened ("הקבלה הופקה ונשלחה למיכל ברק."). | [B] | reviewer |
| C-05 | Icons come from one set (Lucide), one icon per idea, never emoji. The real logo and real marks are used, never initials or a typed wordmark. | icons #414 [N] and SportChat 22.9.2026 [N]; logo #410 [N] | reviewer |

Formats (dates, numbers, ₪, LTR islands) and RTL mechanics are owned by `.claude/rules/ui.md`
in each project and by the `hebrew-i18n` and `hebrew-rtl-best-practices` skills; not restated.

## 7. Brand and second language

| Id | Rule | Source | Check |
|---|---|---|---|
| B-01 | PRODUCT.md has a Brand section: where the real logo files are, the colours, the voice, and what is not done with them. A design step that needs a logo reads it from there. | [B] | auto: `brand-assets` |
| B-02 | An app in Hebrew and English is designed and checked in both directions: every screen in the walkthrough and the mechanical probe runs once per language. | [B] | auto: `both-directions` |

## What does not transfer from MediZen

Its calendar anatomy, clinical privacy rules, tax documents, the light default (chosen for a
40-65 reading audience) and its desktop density numbers (measured for a 1280x648 reception PC)
are that project's. Another project decides its own in its BRIEF.

## The automated checks

Built in the steps named in the rebuild plan (`A2-checks` for the first group, `B` for the
walkthrough). Until a check exists, its rules count as `none`. The built checks live in the DoD
template (`templates/dod`): the page checks run in every DoD entry once a project has
`e2e/dod/standard.json`, the file checks in `routes.mjs --check`; its README says how each is
configured. A condition marked deferred below is not measured, and its rules count as `none`
for that part. The tour checks that need no browser are this skill's
`standard/tours/tour-check.mjs` ([help-system.md](help-system.md), "The tour manifest"), run on
a project's `tours.json` [I].

| Check id | What fails it | Rules | Built |
|---|---|---|---|
| `help-door` | a measured route, other than one with `"noHelp": "<reason>"` in `routes.json`, with no `[data-help="door"]` in its top bar or no `[data-help="screen"]` in its header | G-01 | yes (top bar: inside a `header` or `[role="banner"]`, or in the first 120px of the page). The exemption is now its own flag, `"noHelp": "<reason>"`; `static` exempts state coverage only, and the old `static` still exempts both with a deprecation note |
| `help-route` | a route reachable from the menu with no help content file | G-09 | yes, for every route without `noHelp` in `routes.json` (the menu is not read) |
| `tooltip-only` | a control or hint whose only text is in `title` or a hover tooltip: no visible text, no `aria-describedby` pointing at visible text, and not a `[data-help]` entry | G-04 | half: a `title` attribute with no visible words, and an element described only by a hidden `[role="tooltip"]` that is in the DOM; a tooltip mounted only on hover (Radix) is not seen |
| `tour-no-commit` | from the tour manifest: the tour engine itself dispatches a click, a submit or a key on a step target (other than reopening a window or selecting the sample record again); or a tour's `start` that asks for anything other than going to its screen and the sample record, setting the view and the date, and closing a window that holds no unsaved input [I]; or a practice-only step, or a do step that opens a record, that does not run on the sample record (G-08, G-20) [I]; or a do step that does not say whose record it acts on, or says no one's on a control of a person's record or row, or saves (class S) and does not run on the sample record [I]; or a do-it-yourself step whose target is classed as telling a real person, permanent or charging (a numbered document, a payment and a close for good are always that class), unless it is classed P (permanent or charging; a step that tells a real person never is) and the manifest marks the step practice-only and names the practice mode's test for that action and the test that it is a stop step outside the mode (G-20), or has no reference to the test of G-20; or a stop step ("הבנתי") that is followed by a step depending on that control having been pressed | G-08, G-16, G-20 | half, by `standard/tours/tour-check.mjs` from the manifest: a do step classed T, practice-only or not, and a do step classed P that is not practice-only, a practice-only step without both tests named in a manifest at `"stage": "app"` (at `"demo"` it may be `{}`, and their count is printed as a note) or that does not carry `on: "sample"`, a do step that does not say `on` (`"sample"`, or `"none"` when it acts on no person's record), a do step whose result opens a person's record (`recordOpen`) and does not carry `on: "sample"`, with `--inventory` `on: "none"` on a control the inventory lists on a person's record or row (`recordAnchors`, on any of its screens, since a tour reaches screens it does not list; without it the count of such steps is printed as a note), a do step classed S (it saves) that does not carry `on: "sample"`, a do step that names no test of G-20 (`safeTest`, or a practice-only step's mode test) in a manifest at `"stage": "app"` (at `"demo"`, where no real app exists to test, it prints their count as a note), a resume action other than reopening a window or selecting the sample record again, a `start` with a key other than `screen`, `record`, `view`, `date` and `close`, and, with `--require-stage app`, a manifest still at `"demo"`. The app's own check run always passes `--inventory inventory.json --require-stage app`; `--require-stage app` without `--inventory` is a usage error (exit 2), never a pass. The engine itself dispatching a click, a submit or a key, and doing more at a start than its `start` says, needs the running app; only the `on` flag is read, so whether a flagged step really reaches the sample's record, which the bindings pick, and whether `recordAnchors` lists every control on a person's record or row, are `tour-anchors`' to judge in the running app; whether a step's class is right, a stop step followed by a step that depends on that control having been pressed, and whether the named tests exist and pass are not checked [I] |
| `tour-shape` | from the tour manifest: a step with more than twelve words (the fix is two steps, never a trimmed one), a step with no skip, a do-it-yourself step with no result condition, a chapter that ends neither at a result condition nor at a stop step, a tour that opens by itself on a screen that is not a core screen, more than five core screens (G-21's Terms), counted per screen: keys one core entry groups count as one only where `inventory.json` marks them `viewOf` that screen [I]. It prints every tour of more than six steps with no chapter break; the reviewer checks only that a chapter break, if there is one, sits at a real result, and length alone is never a finding | G-07, G-16, G-21 | yes, by `standard/tours/tour-check.mjs` from the manifest; a tour of more than six steps with no chapter break is printed as a note, never a finding; a chapter is judged on each run, phone and computer: every step it can end at is a result or a stop step; core screens are counted with `--inventory`, where a core key's `viewOf` folds only when it names another screen of the inventory that is not a view, in the same core entry; a core key's `viewOf` that names a screen outside its entry, and any `viewOf` that names itself, a screen the inventory lacks or a view, is a finding; without the inventory more than five entries is a finding and more than five keys in fewer entries a note; whether a key marked `viewOf` really is a view of that screen is the reviewer's [I] |
| `tour-inventory` | a screen reachable from the menu, or a numbered task of a help article, with no tour and no written reason; a tour on a screen that `inventory.json` does not have [I] | G-19 | yes, by `standard/tours/tour-check.mjs --inventory`, from `inventory.json` (each screen, whether the menu reaches it, its article's numbered tasks) and the manifest's `extraTasks`; a screen's written reason covers its tasks; a key in a tour's `screens` that the inventory lacks is a finding, and so is a tour that names no screen and has no job that does, since where it stands, its articles, tasks and `recordAnchors` cannot be judged; a result that routes to a screen the inventory lacks is not read; that `inventory.json` lists every screen of the menu is the project's [I] |
| `tour-anchors` | in the running app: a step's anchor that does not resolve to a visible element on its screen when the step is reached (through `data-tour` or the environment's named resolver, with the bindings' visibility), or a step marked `on: "sample"` whose anchor or record binding resolves to a record that is not the sample's, or a `need` of `reopen` that puts back a record other than the tour's own (the last one open instead of the sample's), or a control on a person's record or row that the inventory's `recordAnchors` does not list, or a showing or stop step whose lit control responds (a test of the built engine presses the lit control of a stop step and shows that nothing happens: no click reaches the app and the step does not move on), or a result, condition, window or state id of the manifest that the environment's bindings do not implement, or an `anchors` entry or an article's anchor that does not resolve on its screen [I] | G-19 | no: needs the running app; planned for the DoD checks phase |
| `help-refs` | from the manifest and `inventory.json`: an article task that names an anchor (with its arg, where it has one) that no tour on that screen points at or names as a result and no `anchors` entry for that screen lists, or names a tour that does not exist or does not list that task on that screen [I] | G-02, G-19 | yes, by `standard/tours/tour-check.mjs --inventory` |
| `tour-auto-start-age` | in the project's own tests: a tour that opens by itself for a person whose account is older than that tour | G-21 | no: a test in the project's own suite, not in this kit |
| `team-learning-access` | in the project's own tests: a request for the team's tour progress by any role other than the owner that the server does not refuse, or a team member's request that returns another member's | G-18 | no: a test in the project's own suite, not in this kit |
| `error-field` | after submitting a form with a bad value: an `aria-invalid` field with no `aria-describedby` message, or focus not on the first invalid field | E-01 | half: the `aria-invalid` field with no visible message, as the page renders; submitting a form and the focus half are deferred |
| `disabled-reason` | a disabled control that is not waiting on its own action (`aria-busy`) and has no `aria-describedby` pointing at visible text | E-02 | yes, the link read on the control or its group; not judged where the place is the reason (the current page, a numbered calendar day, a pager's, calendar's or carousel's previous/next, a menu's back/forward, a +/- or stepper-word button beside a number) or where an option's own text gives the reason, two words or more, in brackets or after a dash |
| `error-toast` | a `[data-state="error"]` or `role="alert"` inside the toast region, or an error element that leaves the DOM by a timer | E-05 | yes (an error element that leaves the DOM while nobody touches the page) |
| `placeholder-label` | an input with a placeholder and no visible `<label>` or `aria-labelledby` | I-01 | yes |
| `input-attrs` | an input with no `autocomplete` attribute at all; phone, email or number content without the matching `type` or `inputmode`; computed input text under 16px | I-03 | yes (content read from the field's name, id, label and `autocomplete`) |
| `one-primary` | more than one accent-filled action in the top layer (the page alone, or the open dialog or sheet alone) | S-03 | yes |
| `nav-count` | more than five items in the phone bottom bar; a badge with no number | S-06 | yes |
| `core-unit` | at the BRIEF's real small screen, fewer of its core units visible than it requires; this is also what catches a card stacked above the work | S-11, G-15 | yes |
| `state-coverage` | a route not flagged `static` in `routes.json` that has no `?state=empty` or no `?state=error` variant there | T-01 | yes, and a listed `?state=empty` or `?state=error` variant that does not render that `data-state` fails it too |
| `empty-action` | a `[data-state="empty"]` root with no button or link inside it (a `[data-state="clear"]` line needs none) | T-02 | yes |
| `forbidden-words` | a banned word or form in a user-facing string or a message template | E-04, C-01, C-03, O-01 | half: the listed Hebrew words, "!", emoji and gender forms in the interface's visible text on measured routes (text marked `data-user-content` is people's, not the interface's); English and technical words (C-03), strings not on a measured screen, and message templates are deferred |
| `brand-assets` | PRODUCT.md without the Brand section, or the section pointing at a file that does not exist | B-01 | yes |
| `both-directions` | a bilingual app whose measured routes cover one language only | B-02 | yes |
| `probe` | sideways scroll, text under the project's floor, a word broken mid-word, an icon covered by its badge, a touch target under 44px, at 320, 390, 768, 1024 and 1280x648 | the mechanical floor under every rule above | yes, except an icon covered by its badge (deferred); touch targets at 320, 390 and 768 |
