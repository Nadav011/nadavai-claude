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
- **[B]** Written by an agent in a brief he approved as a whole. A default.
- **[I]** Inferred by an agent under a general go-ahead. A default.
- **[P]** Proposed by this skill; he has not seen it as a rule. A default, and the first
  candidate to drop if it gets in the way.
A project may override a [B], [I] or [P] default by writing the override and its reason in its
BRIEF.md. Decision numbers (#99) refer to `~/design-redesign/therapy-flow-v2/DECISIONS-ANSWERED.md`
unless another source is named.

Checks:
- **auto: `<id>`** a check that can fail, listed in the table at the end.
- **walkthrough** the task walkthrough (one tour per main job).
- **reviewer** a fresh reviewer reads the screen against the rule; no machine check exists.
- **none** nothing checks it yet.
A rule without an automated check erodes: in SportChat v4, 24 of 183 must-fix findings were
checks that could not fail. So `audit`, `screen` and `ship` print how many rules of this file
were checked by `reviewer` or `none` on the screens they covered.

Which rules apply depends on the project's profile: [profiles.md](profiles.md). Rules marked
*(work tool)* apply to that profile only.

## 1. Guidance: the person always knows what this screen is for and what to do

| Id | Rule | Source | Check |
|---|---|---|---|
| G-01 | Help sits in the same place on every screen: one labelled door ("עזרה") in the top bar, and one entry in the screen header ("מה עושים כאן"; on a phone a question-mark icon in a circle at the end of the header card). | #99 [A], #510 [A] | auto: `help-door` |
| G-02 | Every door opens the same panel, fed by one content source per screen. No second help surface. | #99 [A] | reviewer |
| G-03 | *(work tool)* An unclear field or label has "מה זה?" beside it: a small (i) with the words, a 44px hit area, opening the panel at that paragraph. There is no cap on how many, so each one is quiet and never takes a row of its own on a phone. | #345 [A] | reviewer |
| G-04 | A tooltip is never the only explanation of anything: tooltips fail on touch. | [B] | auto: `tooltip-only` |
| G-05 | Help is offered once per place, not three or four times on a screen. Beyond G-01 and G-03, no legend of "?" buttons, no repeated help links. | [B], from the r10 critique | reviewer |
| G-06 | First visit to a screen shows one small card ("ככה זה עובד") with what the screen is for. Once closed it never returns; the same content stays behind G-01. It sits inside the page flow, never above the work: one line on a phone, and it does not open by itself on a short screen. | #330 [N], #401 [N]; placement [B] | reviewer |
| G-07 | A guided tour runs once per core screen, can be skipped and resumed, has at most five steps, never starts in the middle of a setup wizard, and at most one starts by itself per day. | #100 [A], #485 [A] | reviewer |
| G-08 | A tour never presses a button that commits something. On a task that tells a real person or cannot be undone, the last step points at the button, says what it does in one sentence, and stops. Tours run on the sample record, not on real data. | [B] | auto: `tour-no-commit` |
| G-09 | Every route a person can reach from the menu has a help entry. | plan of the help system [B] | auto: `help-route` |
| G-10 | Help content follows the reader's role and plan: nobody reads how to do what they cannot do. | [B] | reviewer |
| G-11 | *(work tool)* A new account gets a sample record to learn on, removable, never counted in reports. | #93 [A] | reviewer |
| G-12 | An existing user meets a change once, in a "what's new" entry that also lives in the help panel; it is never stacked above the work. | #96 [A], #395 [A] | reviewer |
| G-13 | A problem screen links to its own explanation ("מה זה אומר"); a reason that needs more than one sentence ends in "מה זה?". | [B] | reviewer |
| G-14 | There is a named way to reach a person, with hours, from the help panel. | #101 [A] | reviewer |

The help panel, the first-visit card, tours, videos and the AI helper are specified in
[help-system.md](help-system.md), with what went wrong when MediZen built them.

## 2. When the person goes wrong: the screen says what happened and leads to the fix

| Id | Rule | Source | Check |
|---|---|---|---|
| E-01 | A field error sits beside its field, in plain Hebrew, and says what is needed with an example ("מספר טלפון צריך להיות 10 ספרות, למשל 050-123-4567."). What was typed stays. On submit the focus moves to the first error; several errors get a summary with links. | #120 [N]; wording [B] | auto: `error-field` |
| E-02 | A disabled control always shows why, in a visible line. | [B] | auto: `disabled-reason` |
| E-03 | When the system knows the exact repair, the control becomes the repair: "אין מספר טלפון בכרטיס" with "הוספת מספר טלפון", not a dead "שליחה". | [B] | reviewer |
| E-04 | A problem screen says, in this order: what happened; what the problem is, or that it is not yet known; what was kept or already happened; the next safe step as the primary button, with a way out. Never "אופס", "משהו השתבש", a raw code, English, or blame. | #120 [N], #176 [N]; anatomy [B] | auto: `forbidden-words`; reviewer |
| E-05 | An error never disappears by itself. A toast confirms an outcome or offers undo; it never carries a problem. | #43 [A], #69 [A] | auto: `error-toast` |
| E-06 | Success is shown only after the server confirmed it, and "sent" only after the provider confirmed. An uncertain outcome is shown as uncertain, with no retry that could send or charge twice. See `nadavai:action-safety`. | #423 [A] | action-safety |
| E-07 | Small and reversible beats "are you sure": the thing happens at once and a toast offers "ביטול" for about ten seconds. | #69 [N] | reviewer |
| E-08 | Anything that reaches a real person, moves money or deletes shows the exact preview and waits for a yes. A change that messages someone says so inside the dialog, with a visible checkbox that names the person. | #423 [A], #43 [A] | reviewer; action-safety |
| E-09 | A confirmation names the thing in its title, states the consequence and what does not change, and offers an outcome pair ("ביטול התור" · "השארת התור"), never "כן / לא". The destructive button is never the default. | [B] | reviewer |
| E-10 | "No access" is neutral, not red: it says who the screen is open to and who can change that. A link to a closed screen lands on that state, never on a 404. | #116 [A], #16 [A] | reviewer |
| E-11 | Offline is said under the top bar with the time of the cached data; a control that writes shows the reason instead of failing. | #107 [A] | reviewer |
| E-12 | Closing with unsaved changes asks, and "המשך עריכה" is the default. | [B] | reviewer |
| E-13 | Where the system did something by itself and a person may wonder why (a skipped message, an automation that did not answer), a "למה זה קרה?" gives the reason from a fixed list. | #472 [I] | none |

## 3. Input help: the form meets the person halfway

| Id | Rule | Source | Check |
|---|---|---|---|
| I-01 | A label above every field. A placeholder is never the label. A hint line under the label carries the format or the reassurance. | [B] | auto: `placeholder-label` |
| I-02 | Accept before rejecting: a phone with dashes, spaces or +972; a date as 1.2.26 or 01/02/2026; pasted text with stray spaces. | [B] | reviewer |
| I-03 | Every field carries the right `type`, `inputmode` and `autocomplete`, so the phone shows the right keyboard and the system offers what it knows (name, phone, email, address, one-time code). Input text is 16px or more, so iOS does not zoom the page. | #408 [N] for 16px; rest [P] | auto: `input-attrs` |
| I-04 | A screen that saves by itself has no save button; one line tells the truth ("שומרים… / נשמר / עוד לא נשמר"). | #60 [A] | reviewer |
| I-05 | A form is short by default, with "עוד פרטים" for the rest. | #259 [A], #280 [A] | reviewer |
| I-06 | "Not set" is a real state. A default is never saved as if the person chose it, and nothing is pre-selected where the choice matters; the primary button lights after the choice. | #292 [A]; [B] | reviewer |
| I-07 | The form remembers: the last choice a person made is offered next time, and what the system already knows is filled in. | [P] | none |
| I-08 | A long form keeps a draft: closing the tab or losing the connection does not lose the typing. | [P] | none |

## 4. Simplicity against capability: every capability, without the weight

| Id | Rule | Source | Check |
|---|---|---|---|
| S-01 | Design for the least confident user first, without slowing the fluent one: explanation and large text first, shortcuts and fewer steps second. The BRIEF names who the least confident user is. | #134 [N] | reviewer |
| S-02 | A task of several steps is one step per screen on a phone: a visible next button, where I am, a way back, and a summary before the commit. The primary action is visible without scrolling, and a choice visibly changes what is in front of the person. | Nadav on the salon app, 7.11.2026 ("לא כפתור, מסך מסך") [N] | walkthrough |
| S-03 | One accent-filled action per screen. | house rule, 10.11.2026 [N] | auto: `one-primary` |
| S-04 | Nothing a screen does today disappears or changes behaviour without his numbered answer. Many actions are grouped, not cut. | #222 [N], #262 | capability ledger |
| S-05 | Whatever is on the screen works from day one. A button that promises what it does not do is removed, with its data kept. | #146 [N] | reviewer |
| S-06 | A phone has at most five destinations in its bottom bar; the rest is under "עוד". A count is a number on the icon, never a bare dot. | #105 [A]; [B] | auto: `nav-count` |
| S-07 | A desktop has a labelled side menu: never icons alone, never a hamburger. | [B]; look of the menu #326 [N] | reviewer |
| S-08 | Three layers: what a person sees on day one, what opens as they use it, and what stays behind "עוד". The BRIEF lists which capability sits in which layer. | [P], from the planning desk | reviewer |
| S-09 | One thing is shown once, and one thing has one count everywhere; handling it anywhere clears it everywhere. | [B] | reviewer |
| S-10 | A number is on the screen only if it changes a decision and leads somewhere. A zero becomes a sentence; no wall of zero cards. | [B] | reviewer |
| S-11 | The chrome above the work stays small. The BRIEF defines the core unit of work at the real small screen (how many calendar hours, rows or messages must be visible) and every round measures it. | [B], adopted through #534 | auto: `core-unit` |
| S-12 | Text big, chrome small: text size and chrome size are tuned separately, and density switches on the pointer type, never on the width. | #408 [N], #534 [N] | reviewer |
| S-13 | *(work tool)* Home opens on today's work, with one strip of what is waiting; when nothing waits it is one calm line. | #10 [A], #111 [A] | reviewer |

## 5. States: every state is a designed screen

| Id | Rule | Source | Check |
|---|---|---|---|
| T-01 | Every screen is designed in every state it can be in: empty, filtered with no results, loading, error, partly loaded, stale, offline, no access, read-only, and its own. The error state is shown to Nadav like any other screen. | #120 [N], #176 [N] | auto: `state-coverage` |
| T-02 | Empty says the status, gives one cue and one action. Never "אין נתונים", never an apology. It never shows while loading or after a read failed. | [B] | auto: `empty-action` |
| T-03 | A filter with no results is a different state: "אין תוצאות למסנן הזה." with "ניקוי המסנן". A remembered filter always shows that it is on. | [B] | reviewer |
| T-04 | A loading skeleton has the geometry of the content, appears only after a short delay, and after ten seconds becomes a sentence with a way out. | [B] | reviewer |
| T-05 | The screen tells the truth about what it shows: "מוצגות 50 מתוך 957" under a cut list, the age of cached data, "חלק מהשורות לא נטענו". | [B] | reviewer |

## 6. Words

| Id | Rule | Source | Check |
|---|---|---|---|
| C-01 | Gender-neutral Hebrew: action nouns on buttons, menus and tabs ("שמירה", "קביעת תור"); impersonal hints and errors ("אפשר לנסות שוב", "צריך להזין"); direct address only where it has no gender ("שלך"). No slash or dot forms. | #18 [N] | auto: `forbidden-words` |
| C-02 | One word per concept, plain words for technical ideas, and the project's glossary is part of its help. | #35-#38 [A], #104 [A] | reviewer |
| C-03 | Never: "נא", "אנא", "ניתן" (use "אפשר"), "כעת", "אופס", exclamation marks, emoji, English or technical words in the interface, a claim the system cannot back. | [B], from #18 and #81 | auto: `forbidden-words` |
| C-04 | Success is said as what changed and where it went, once it happened ("הקבלה הופקה ונשלחה למיכל ברק."). | [B] | reviewer |
| C-05 | Icons come from one set (Lucide), one icon per idea, never emoji. The real logo and real marks are used, never initials or a typed wordmark. | SportChat 22.9.2026 [N], #414 [N] | reviewer |

Formats (dates, numbers, ₪, LTR islands) and RTL mechanics are owned by `.claude/rules/ui.md`
in each project and by the `hebrew-i18n` and `hebrew-rtl-best-practices` skills; not restated.

## 7. Brand and second language

| Id | Rule | Source | Check |
|---|---|---|---|
| B-01 | PRODUCT.md has a Brand section: where the real logo files are, the colours, the voice, and what is not done with them. A design step that needs a logo reads it from there. | [P] | auto: `brand-assets` |
| B-02 | An app in Hebrew and English is designed and checked in both directions: every screen in the walkthrough and the mechanical probe runs once per language. | [P] | auto: `both-directions` |

## What does not transfer from MediZen

Its calendar anatomy, clinical privacy rules, tax documents, the light default (chosen for a
40-65 reading audience) and its desktop density numbers (measured for a 1280x648 reception PC)
are that project's. Another project decides its own in its BRIEF.

## The automated checks

Built in the steps named in the rebuild plan (`A2-checks` for the first group, `B` for the
walkthrough). Until a check exists, its rules count as `none`.

| Check id | What fails it | Rules |
|---|---|---|
| `help-door` | a product screen without the top-bar help door or the header entry | G-01 |
| `help-route` | a route reachable from the menu with no help content file | G-09 |
| `tooltip-only` | an explanation reachable only through `title` or a hover tooltip | G-04 |
| `tour-no-commit` | a tour step whose target is a committing control and whose action is a click | G-08 |
| `error-field` | an invalid field with no `aria-describedby` message, or focus not on the first error after submit | E-01 |
| `disabled-reason` | a disabled control with no adjacent visible reason | E-02 |
| `error-toast` | an error rendered in a toast, or an error that auto-dismisses | E-05 |
| `placeholder-label` | an input whose only label is its placeholder | I-01 |
| `input-attrs` | a phone, email, name, address, code or amount field without the matching `type`, `inputmode` or `autocomplete`; an input under 16px | I-03 |
| `one-primary` | more than one accent-filled action in a screen | S-03 |
| `nav-count` | more than five items in the phone bottom bar; a badge that is a bare dot | S-06 |
| `core-unit` | fewer of the BRIEF's core units visible at the real small screen than the BRIEF requires | S-11 |
| `state-coverage` | a screen with no `?state=empty` and `?state=error` variant in the measured routes | T-01 |
| `empty-action` | an empty state with no action | T-02 |
| `forbidden-words` | a banned word or form in a user-facing string | E-04, C-01, C-03 |
| `brand-assets` | PRODUCT.md without the Brand section or pointing at a missing file | B-01 |
| `both-directions` | a bilingual app measured in one direction only | B-02 |
| `probe` | sideways scroll, text under the project's floor, a word broken mid-word, an icon covered by its badge, a touch target under 44px, at 320, 390, 768, 1024 and 1280x648 | mechanical floor for every rule above |
