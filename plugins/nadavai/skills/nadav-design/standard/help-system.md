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
the panel and in the list. One thing with several ways in. While the tour's automatic start
waits (another tour ran today, the wizard is open, she started typing), the card shows at
once, alone, with "הראו לי" (MediZen's spec, HL-02 [I]): a core screen never shows neither. A
card she closed on such a day does not come back after the tour. On
a short screen the card does not appear by itself, also after a tour (G-15).

**Tours (G-07, G-08, G-16, G-19, G-20, G-21).** Nadav's answers of 10.11.2026, as typed or
picked. In the planning session, after he played three built versions on a copy of MediZen's demo:
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
- on the four-step cap he asked "למה רק עד 4 ? כמה שלבים שצריך לא ? מה איך עושים אתזה נכון
  וטטוב"; shown three ways (chapters, one continuous tour, or up to six steps), "נראה ליא אחד
  וגם לשני כי 4 זה נשמע קצר מידי לא יודע תחשוב על זה אתה מה כי נכון לעושת"; and then "זה גם
  לא נכון לעצור באמצע מדריך כי זה 4 או לא להראות משהו שלוקח לו יותר מ4 וחשוב כי זה 4 אתה מבי
  מה אני ארומר" [N]. So there is no cap on steps: a number never cuts a tour and
  never drops something important. How a long job is laid out (chapters, below) he left to
  this session [I];
- on 11.11.2026, asked whether a new person should practise closing a treatment, a payment
  and a receipt to the end somewhere safe, with the stop at "הבנתי" as the rule until then:
  he picked "כן, בתוך מצב התרגול" [A].

**How long, and a long job (G-07).** A tour takes as many steps as its job needs to reach its
result ([N], above). A result is a change to the record that the screen shows and the help
article names as the task's outcome (a visit is booked, a note is saved); selecting, opening
or filling something is not one, so a job is never chopped into chapters of a step or two.
What keeps a tour light is not a count. It is one sentence a step, at most twelve words ([B];
a step that needs more becomes two steps); her doing the step, not reading about it; and
breaking a long job where the job itself has results. A chapter ends at its result, or at a
stop step when the result is one a tour never lets her make (below). Its finish says what she
did and offers the next chapter as the main button, with stopping as the quiet one; the
progress shows the whole ("פרק 2 מתוך 3"); and a person who stops between chapters has
finished something whole. A chapter is never broken at a count, and a job with one result is
one tour however many steps it takes.

"סגירת טיפול ותשלום" in MediZen has three results: the treatment is closed, the payment is
taken, the receipt is sent. Its spec classes all three as permanent (HL-03: a receipt takes a
fixed number and is corrected only by a credit), and G-20 never lets a tour do them on the
sample in the clinic's real books. So in the real clinic each of the three chapters takes her
through the steps she can do and ends at "הבנתי" on its button, with the sentence of what
pressing it does. MediZen's sample patient has no payments and no receipts (#391), and nobody
adds one to make a chapter work: where the control does not exist on the sample, the step is a
centred card. To do the job to its end she goes into practice mode. Asked on 11.11.2026 whether
she should practise these to the end somewhere safe, Nadav picked "כן, בתוך מצב התרגול" [A]:
MediZen's spec has a practice mode (HL-12) in which every message lands in a "היה נשלח" tray,
every payment is pretend, no provider is called and no document number is taken, so there the
tour runs the payment and the receipt to the end and she issues a practice receipt herself. The
chapter's card offers it ("לתרגל את זה עד הסוף"), her tap opens the mode's own entry dialog, and
leaving the mode discards the copy. Three things are still for MediZen's spec to settle before
this chapter is built, as the review of this rule found on 11.11.2026: its practice copy does
not say it holds the sample patient, and the sample may hold no money (S4-34, #391), so there is
no record yet that the chapter can run on; the mode's own tests cover a card payment and a
message but none issues a receipt, so the proof G-20 asks for is not there yet for the receipt,
and until it is the receipt step stops in the mode too; and how the tour is carried into the
mode and back (the entry dialog, the wait, the eight-hour expiry).

Why break at results at all: the more steps in one sitting, the fewer people finish (Chameleon's
2024 benchmark: tours of more than four steps complete below the average, five-step tours about
21.6%, https://www.chameleon.io/benchmark-report-24; Produktly's 2026 figures as reported: three
to five steps 38%, six to eight 25%, nine or more 8%,
https://produktly.com/research/saas-onboarding-benchmarks-2026). Those are "next, next" tours
and ours has her do the step, so our own numbers decide: every tour's skip rate and the step
where people leave are measured in the product, and a tour most people leave is examined again
(#100). The BRIEF names the skip rate at which a tour is examined again (MediZen's spec: all
tours when 15 of the first 20 starts, from at least 5 clinics, are skips; one screen when 8 of
its first 10 are [I]). Each tour also has a switch that stops it opening by itself, for a long
tour that keeps opening at a front desk; using it on a core screen is put to Nadav, who chose
that those open by themselves (#100 [A]).

**When a tour opens by itself (G-21).** Only on a core screen, once (#100 [A], and his pick of
10.11.2026 [A]); not while the setup wizard is open or set aside in the middle of a step, and at
most one automatic start a day (#485 [A]). It waits for a plain arrival: she came by the menu,
the bar or the home screen after login (not by a deep link, Back, an alert or a login redirect),
the screen's data and the first target are on screen, no sheet is open, and she has typed or
tapped nothing since arriving (MediZen's spec, HL-03 [I]); a tour that takes the screen from a
person in the middle of typing is worse than no tour. A start that waits is not spent: the card
shows meanwhile, and the tour opens on her next plain arrival, on a later day when another tour
already ran today (the same spec [I]). A person whose account is older than a screen's tour gets
no automatic start of it: on the day a tour ships, each of them would meet a dimmed screen over
her work. They meet it once in "what's new" and in the list (G-12 [I]). MediZen's spec says this
per clinic ("Existing clinics get no automatic tour"); per person and per tour is this skill's
reading, so a new team member of an old clinic gets her tours, and a tour that ships later does
not open over the work of people who joined before it. A project's own spec wins over this [I]:
in MediZen no one in an existing clinic gets an automatic tour until Nadav says otherwise. On a
short screen the tour still opens, because its card lies over the dimmed screen and takes no
room from the work; the first-visit card does not follow it there (G-15). On every other core
screen the first-visit card appears when the tour ends or is skipped, with "הראו לי". Every
other tour is started by the person.

**A step.** Each step is classed before the tour is written: its action on the sample record is
safe to do (G-20); or it tells a real person; or it is permanent or charges. On the first kind
the person does the step herself and the step moves on only when the screen shows the result the
step names (a condition written in the manifest, not a timer). On the other two the step says
what the control does and has "הבנתי" (a stop step): the control is lit but does not respond,
the tour never presses it and never moves on because it was pressed. "הבנתי" goes on to a step
that does not need it pressed, or ends the chapter. A tour's sentence says that nothing goes
out, or that no one is told, only where that action's G-20 test, or the practice mode's test,
shows it [I]; otherwise it says what the control does in the real app.

**Safe to do is proven, never assumed (G-20).** The built demo held the notice back in the
browser only. In a real app the sample patient has the therapist's own phone (#93), and
MediZen's spec records nine automatic senders that fire on a future sample appointment. So a
step is "do it yourself" only with a test on the real app showing that nothing leaves for that
action on the sample record, now or later, and that it is held on the server by the sample
flag. "Nothing, from any sender" can be shown only where every outbound effect (messages,
charges, calendar sync, webhooks, scheduled jobs) passes through one place that checks the
flag: a check fails a sender that goes around it, so one added next month is caught, and the
test runs the scheduled jobs past the latest reminder. Putting that hold into the senders
changes who gets a message (a flag set wrongly drops a real patient's reminder), so it goes
through the replay of `action-safety.md` and is switched on only after Nadav's yes. Until the
test exists the
step is a "הבנתי" step. An "undo" toast is not "safe": a notice held for ten seconds leaves
after the tour has moved on.

Three things are never "do it yourself" in the business's real books, whatever a test shows:
issuing a numbered document (a receipt, an invoice, a credit), taking or recording a payment,
and closing a record for good. A practice receipt that took a real number cannot be removed. The
real books are every place in the live account where a document number is taken or the documents
provider is called; a separate "sample" numbering inside the live account is not outside them
unless Nadav says so. The one exception is a practice mode in which no document number is taken
and no provider can be reached, proven by that mode's own tests: there she does them herself, to
the end (his pick of 11.11.2026 for MediZen [A], in the example above; for another project whose
mode gives the same proof [I]). The rest of this paragraph is this skill's own [I]. She enters
the mode by her own tap from the tour's card, or is already in it; the tour never switches mode
by itself. Outside the mode a practice chapter ends at its first practice-only step, which is a
stop step there. A step that tells a real person is never done in the mode. The mode's test
shows that nothing leaves of any kind: no document number; no documents, payment or messaging
provider; no calendar or webhook call. A step that both issues and sends (a practice receipt
that is also sent) is classed P, and its mode test also shows the message is held. Inside the
mode the tour still runs on the sample record's copy, never on the copy of a real person's
record. The server refuses an action marked practice-only outside a practice session, so a press
that arrives after the mode expired does nothing in the real clinic. Leaving the mode, or its
expiry, discards the copy; that is the removal, and a resume starts the chapter again from its
first step.

What a step created is removed when she finishes the job's last chapter, or at the end of the
day on which she left the tour and did not come back to it; a resume after that starts at the
first step of the chapter she was in, and a chapter she finished stays finished. The removal is
an action too: the test runs it and shows it tells no one (no cancel notice), and it never
touches the practice data that came with the sample record. What a step created never takes a
slot a real person can see. Practice data a later chapter stands on (a past visit, an open
treatment) comes with the sample record, made by the app, never by an earlier chapter or by the
tour. The sample's business events (a booking, a payment) are not counted in reports or
analytics; the tour's own steps and skips are.

**What responds.** On a do step only its own lit target and the tour's card respond. On a
showing step and a stop step nothing on the screen responds, the lit control included; only the
card does (the built version made the target inert on those steps too [B]). So a showing or stop
step may light a control on a real person's row: it acts on nobody. Where the sample record
carries the same control, the step lights the sample's. A test of the built engine shows it:
pressing the lit control of a stop step does nothing, no click reaches the app and the step does
not move on (`tour-anchors`). This is done with the platform's own mechanism (`inert`, or
`aria-hidden` on the siblings), which also stops the app's keyboard shortcuts and a screen
reader's activation; see-through blocks over the page stop a finger only. The tour's card is not
`aria-modal` over the control it points at, or a screen-reader user cannot do the step. The
step's result is announced in a live region. With the on-screen keyboard open, the card and the
lit control are both above it. A do-it-yourself target that cannot be reached by keyboard makes
the step a showing step. A tap outside the light pulses it again and says where to press.

Also part of the contract, from the built version ([B]): "דילוג" on every step and progress
dots; a skipped tour does not open by itself again; "הראו לי שוב" resumes at the same step and
puts the person back where she was (a window reopened, the sample record selected again);
focus stays between the card and the lit control, and Esc ends the tour; with reduced motion
the light does not pulse; with no sample record a tour only shows where to press. A missing
target degrades to a centred card with "הבא", never to a broken overlay. Added by the reviews
of this rule ([P]): a resume never puts her back over something she chose or typed since, it
asks; and the tour offers to bring the sample back only where the project allows one at that
moment (a clinic that imported its data has none). So the only things a tour does by itself are
bringing her, when it starts, to its start state, and putting her back where she stopped, as
above (this skill's reading of G-08 [I]). The built version, at a tour's start, went to its
screen and, where the tour needed it, set the view and the date and closed what was open ([B]). Going to the sample record and
never to a named one, opening no window at the start (a tour that needs one begins with a step
that opens it on the sample's record), and asking before closing a window that holds unsaved
input are this skill's reading [I]. A start never saves, sends or discards anything.

**The tour manifest (G-19, and the `tour-*` checks).** This paragraph and the next four are this
skill's own [I]. A tour is designed in the demo and built again in the app, so its content is
written once, as data, and both read the same file; only the way a step finds its control is
written for each of them. Two layers:
- `tours.json`, the content, which carries no selector and no code. Per tour: its id and title,
  an optional job, job title and chapter `[n, of]`, the screen keys whose articles it serves, its
  area and where, the screens on which it opens by itself (`auto`), its start state (`start`:
  `screen`, one of its screens; `record: "sample"`; `view`, one key or one per device;
  `date: "today"`; `close`; and nothing else), the article tasks it shows, its steps and its
  closing sentence. Per step: `do`, `next` or `stop`; a stop step's class (`S` saves, and a
  control that saves as it changes, a switch or a field with no save button, saves too; `T`
  tells a real person; `P` is permanent or charges); for every do step, `on`: `"sample"` when it
  acts on the sample record, `"none"` when it acts on no person's record (an empty slot, a
  filter, a settings tab, a field in a settings form that has its own save); a save of a
  business-wide setting, including a switch or a field that saves as it changes, is a stop
  step, never a do step [I]. A practice-only step and a do step that opens a person's record
  carry
  `"sample"`, and `"none"` on a control the inventory lists as the sample's
  (`recordAnchors`, on any of its screens, since a tour reaches screens it does not list), or
  with a result (`present`, `fieldChanged`) that names one or a container, is a finding; for a
  step at `"none"` that filters a list or opens a window, the result names the state
  (`stateEquals`) or the window (`open`), not a control inside it, and a window only when it is
  nobody's (a menu, a filter panel); a list of people, and the plain id every row in it
  carries, go in `containerAnchors`, and the step lights the sample's own row at `"sample"`
  through a resolver's own id [I]. `recordAnchors` holds only ids that resolve to the sample's
  own record: a resolver's own id that picks her row (`cal.ended-appointment`), and every
  control inside a window, card or sheet opened on her (her appointment, payment, chat,
  document); an id listed on one screen counts on every screen [I]. An id that every person's
  row in a list carries, the row's plain id (`cal.appointment`, `patients.row`) or a control on
  each row (`patients.charge`), binds the first visible row, a real person's whenever the sample
  is not first: it is a container and goes in `containerAnchors`, never in `recordAnchors` [I].
  The one exception: a control that picks a person in a window opened on nobody (a patient
  picker), where picking saves and sends nothing by itself, is listed in `recordAnchors`; its do
  step carries no class, and its result checks that the sample was picked (a `custom` result, as
  `appt.sample-picked`). That window's other controls (`appt.service`, `appt.save`) are listed
  with it, and a do step on one of them comes only after the picker's step. A picker that saves
  or sends as it picks (it adds the person to a list, assigns or invites her) is a stop step,
  never a do step, and the rows of a picker's list are containers [I]. `containerAnchors` lists
  every element that holds people's rows
  or records (a list, a column, the calendar grid) and every id each row of such a list carries:
  the lit target of a do step is live, so a do step lit on one is a finding at any `on` and any
  class, and a tour lights the sample's own row or control at `"sample"`, through a resolver's
  own id that picks it and is listed in `recordAnchors` (`cal.ended-appointment`, never the
  plain id every row carries), or, for an empty slot, the slot through a resolver
  (`cal.free-slot`) at `"none"` [I].
  `bulkAnchors` lists every control that exports, prints, downloads, shares, imports or
  otherwise acts on many people's records at once (select all, a bulk send, a bulk delete, an
  import, `cal.print`): a tour never does one, so a do step on it, or whose result names it, is
  a finding at any `on` and any
  class, and the tour shows it or stops at it; a stop step on an export or a print is classed
  `T`, since data leaves. An id is in at most one of the three lists. A listed id covers every
  arg of its family, so a control that exports, prints or acts on many people, or that sits on a
  person's record, gets its own id and is never one arg of a family whose other members differ.
  A filter, a sort or a search acts on no record and is in none of the lists [I]. A step that
  finds a person (a search) and opens her record is split: it filters or opens at `"none"`
  with a `stateEquals` or `open` result (a window that is nobody's), and the next step lights
  the sample's own row at `"sample"` through a resolver, with the `recordOpen` result, or is a
  stop step [I]. A do step
  classed `S` (it saves) that does not carry `"sample"` is a finding too, and with the inventory
  so is a do step at `"sample"`, of any class, on a control no `recordAnchors` lists. When the
  control sits in a window opened on her (a step before it in the tour opened it on her), the
  fix is in the inventory: list it in `recordAnchors` and keep `"sample"`; when it sits on her
  row in a list, it is lit through a
  resolver's own id that picks her row, and that id is listed. Only a control that is nobody's
  record changes the step (a save of a business-wide rule is then a stop step), and this finding
  is never answered by setting `"none"` [I]. A do step at `"sample"` on a control
  `recordAnchors` lists comes after an earlier do step at `"sample"` in the same tour, on the
  same device, that opened her record (a `recordOpen` result that names the step's own
  control, a resolver's own id) or picked her (the picker exception: an unclassed `pick` step
  with a `custom` result, after the do step at `"none"`, on that device and under no other
  condition, that opened its window), unless it is that step itself; a control in a window acts
  on whichever record the window shows, a real person's when the tour starts over it, and a step
  that breaks this order is a finding with the inventory. Such a step that is not itself the
  opener names a `need` that reopens the window its control sits in, with `selectSample` as well
  where that window picks a person (the checker requires it on every step after the picker; the
  picker's own step names the reopen too); the engine runs that need each time the run reaches
  the step: a reopen is skipped only when its window is already open on her (`isOpen`; a window
  that picks a person counts as open only while it is the tour's own and every person field it
  has holds only the sample, or is empty (a person field names whose record the step acts on, a
  patient or a client, a second one such as a family member or a referrer included, and a field
  that lists several people holds only the sample when she is the only one in it; a field that
  names staff, such as the therapist, is not one, and a binding that counts it anyway only makes
  the reopen run more often)), and `selectSample` runs after the reopen, and the need lists them
  in that order: a reopen of a window that picks a person closes any other window of that kind
  without saving it, through that window's own close (an existing appointment's edit form
  included), and opens the tour's own afresh with every person field empty, so `isOpen` holds
  after it; the tour's own is the new window the tour's step opened, never an existing record's
  window at the same slot; `selectSample` runs only in the tour's own window, the one the step's
  reopen just opened or found open on her, and only where that window picks a person: it picks
  her there, asks nothing, and never runs in a window that holds an existing record. The need
  asks one thing: before the reopen closes a form that holds her input, it asks, saying her
  changes there will be lost; when she declines, nothing is closed, `selectSample` does not run,
  the step only shows, and every later do step of the tour in that window only shows too, never
  pressing, until a later reopen she accepts opens the tour's own afresh; a resume or a skip can
  reach it without the opener, or after she opened another record at an earlier step; with no
  sample record the step only shows [I]. Beyond that the checker reads only the flag and whether
  the control is listed: that the bindings then reach the sample's record and no other, and that
  the three lists are complete, is judged in the running app. Then the anchor of its control;
  what she reads, and the text when it only shows; a do step's action (open, pick, select,
  type), its result, the G-20 test it names (`safeTest`) and, for a practice-only step,
  `practiceOnly` (only a step classed `P`: a step with no class, classed `S` or classed `T` is
  never practice-only) with the mode's test for that action and the test that it is a stop step
  outside the mode (at stage `demo` it may be `{}` and name them later; at stage `app` both are
  named); and `need`, how the run puts her back at the step, which is only one of the two G-08
  allows (reopen a window, select the sample record again). A reopen puts back the tour's own
  record, the sample's, never the last one open, since she may have opened a real person's
  since, and a window opened on one person counts as open (`isOpen`) only while it shows the
  sample's record [I]; with no sample record it does nothing and the step only shows; the
  bindings do it, and only the running app shows it (`tour-anchors`). The file's `stage` (`demo`
  or `app`), the core screens, the anchors that no step points at (each with its screens), the
  written reason for a screen or a task with no tour, and the important actions beyond an
  article's tasks are in the same file.
- A bindings file for each environment, which is not portable: anchor id to element (`anchors`,
  for a target that depends on state), the record behind an anchor (`records`, for
  `recordOpen`), a `custom` result to a predicate (`results`), and each condition, window and
  state value named in the manifest (`conditions`, `windows`, `state`), the route and the view
  the app is on (`route`, `view`) and how the run selects the sample record again
  (`selectSample`), each in that environment's way of reading it.

An anchor is a stable dot-separated id (`cal.new-appointment`), with an optional argument for a
family of controls (`{ "anchor": "settings.tab", "arg": "messages" }`: a tab, a row, a field).
The argument is a stable key, ASCII, lowercase and hyphens; the visible label is content and may
change without breaking the anchor. A static control carries `data-tour="<id>"`, and
`data-tour-arg="<arg>"` where there is one, in the demo's markup and in the app's components; it
binds to the first visible element that carries them. A step marked `on: "sample"` selects by
the sample's record id, never by position: on a list of people's rows (appointments, patients,
chats) its control is a resolver that picks the sample's (`cal.ended-appointment` in the
example), and a plain binding serves only a control inside a window already opened on the
sample, or one that is nobody's record [I]. Only a target that depends on state (the first free
hour, an appointment that ended) is a resolver named in the bindings. A result is data too: a
window is open (`open`; at `"none"` only a window that is nobody's), an anchor is present, the
route or the view is a
given key or changed, the window or card of the record behind an anchor is open (`recordOpen`: a
patient, a customer, an appointment, a document addressed to someone), a wizard reached step N,
a field changed from its start and is not empty, a state value equals X; anything else is
`custom`, named in the manifest and written in the bindings. Whose record a do step acts on is
its `on`, whatever the result kind; at `"none"` a result of any kind (`open`, `step`, `route`,
`view`, `custom`) lands only on what is nobody's, never a person's page, card or window [I].
The bindings own visibility: a hit on the target, inside it
or on its ancestor counts as covering it, a target clipped by an ancestor's overflow is not on
screen, and a target inside an inner scroll box is scrolled into that box's view before the step
shows.

The manifest freezes with the approved demo's tag (its `tag` field), and the app reads that same
file; a later change to a tour is a change to the file, made once. The app's manifest is the
same file with `stage` changed from `demo` to `app` and every do step's test named, and the
app's own check run always passes `--inventory inventory.json --require-stage app`, so a
manifest still at `demo` fails there; `--require-stage app` without `--inventory` is a usage
error (exit 2), because the checks against `recordAnchors`, `bulkAnchors` and
`containerAnchors`, `tour-inventory` and `help-refs` all read the inventory [I]. In an app whose demo lives in the app's own preview,
tours are authored once, in the app, against this format.

A help article is data keyed by the screen key. Each numbered task names the tour that shows it
and the anchor ids of the controls its text mentions, in `inventory.json` beside the manifest,
which also says whether the menu reaches the screen and which keys are views of one screen
(`viewOf`, so a core screen's views count once: a core key's `viewOf` names another screen of
the inventory that is not a view, in the same core entry; any `viewOf` that names itself, a
screen the inventory lacks or a view is a finding; whether a key really is a view is the
reviewer's).
`help-refs` judges an article task that names a tour that does not exist or does not list that
task, and an anchor the manifest does not know on that screen: one that no tour on that screen
points at or names as a result (with the same arg, where it has one; a chapter stands on the
screens of its whole job) and no `anchors` entry for that screen lists. Whether the control is
really on the screen, for an `anchors` entry and for an article's anchor alike, is judged only
in the running app (`tour-anchors`, not built).

The format, an example and the checker are in [tours/](tours/): `tours.schema.json` and
`inventory.schema.json`; `example/`, a manifest of six tours with its inventory and the bindings
of a web app; and `tour-check.mjs`, which runs `tour-shape`, `tour-inventory`, `help-refs` and
the part of `tour-no-commit` that data can show, with no browser (`node tour-check.mjs
tours.json --inventory inventory.json`, exit 1 on a finding; the app's own run adds
`--require-stage app`). Whether each anchor and result resolves on its screen needs the running
app (`tour-anchors`). Seventeen of MediZen's demo tours were converted into the format on
11.11.2026 to test it. Against `start` as first written (screen, view, close), 5 of the 17
start-ups did not fit, in three kinds: the calendar's start (three tours) puts it on this week
and today, sets the view by device and closes windows without checking for unsaved input; the
closing window's start opens it on an ended appointment that is not the sample's; and the
patient card's start goes to one named patient, as 19 tours of the demo do (and 7 go to one
named message rule). With `record`, a view per device and `date` added, 15 of the 17 fit as
written, the patient card's tour fits once moved to the sample record, and the closing window's
start is left out of the data by design. Separately, at the level of steps, the conversion
dropped the demo's computed light around the free hour (`box`) and its per-step and per-tour
starting values. A result that stays reached once seen is the engine's default, and how the
demo's own checks drive a do step (its `try`) stays in each environment's tests.

**The tour list (G-17, G-18).** The help panel lists every tour like the levels of a game: how
many were learned out of how many, what is left, and a tap starts one. It is built from the
inventory (G-19), so a screen or an action without a tour shows up as a gap when the list is
generated, not when a user looks for it. The owner of the business sees, per tour, who finished
it and who has not yet; only the owner sees the team, each team member sees her own, and there
is no total per person, no score and no ranking (his picks, 10.11.2026 [A]). It is a view of
staff activity: who else may see it is a permission, asked of Nadav, and the request of any
other role for it is refused by the server and tested (`team-learning-access`).

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
keeps the limits of G-07 and G-21 and follows G-08 and G-16; with no sample record its steps
only show and never ask her to do. If a consumer screen needs an explanation to be used, the
first fix is the screen.
