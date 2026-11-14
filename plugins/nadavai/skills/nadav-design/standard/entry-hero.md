# The entry screen with a hero

How an app's sign-in screen is built: a hero on top that shows the product at work, and a
beautiful sign-in under it. Read it before a sign-in or first screen is planned, built or
redesigned, beside `experience.md`. It is a pattern for that one screen, not a look for the app.

`[N]` marks Nadav's own words, `[M]` a value measured on the approved page, `[I]` this skill's
reading. Times are UTC, as the transcripts record them.

## Where it comes from

- **His rule for every app, 14.11.2026, typed to the nadav-design session:**
  "ושלא כל המכים ממש יראו אותו דבר כן אבל כל אותם עקורנו תשל אנציות HERO הדגשה של פיצרי םפהתבחרות יפה וזה שכל יאחד יהיה לו את האופי של האפליקציה שלו" [N]
  The same principles everywhere (motion, a hero, the features highlighted, a beautiful sign-in),
  and each app with its own character.
- **The approved screen:** MediZen's sign-in (`examples.md`, "MediZen's sign-in screen"), approved
  on its fourth try with the pick «כן, המסך מאושר». It was built from the code of SHIFTS's sign-in
  page, whose own screen was still in a round that day.
- **What the four tries showed [I].** Three compositions of MediZen's own were rejected; the one
  built on the SHIFTS page's composition with MediZen's own logo, colours, features and sign-in
  methods was approved. So "its own character" is carried by the parts listed under "What each app
  makes its own", not by composing a new hero. An entry screen starts from the approved page's
  composition.

## The composition every app keeps

Measured on the approved page at 390x844 [M]; a new screen keeps the order and the proportions,
not the pixels.

1. **The hero is on top, the sign-in under it, at every width.** On a phone the hero takes a
   little over half the height (55 to 57%) and the sign-in sheet rises from the bottom. His words
   on a round that put them side by side: "HERO למעלה" [N].
2. **A sky:** the app's colours as light, not a flat fill. Two or three soft gradients, one glow
   in the accent, two slow blurred shapes, a fine grain; it may follow the hour of the day.
3. **A top row:** the app's real lockup and one quiet line (the date, a place).
4. **A headline of two short lines** whose one accented word changes with the film on show.
5. **One glass card that plays the product's main features as short films,** one at a time
   (five on the approved page), with dots that show which film is on and how long it has left.
6. **One live line** under the card: a single invented event of the product, changing every few
   seconds.
7. **The sign-in sheet:** a title, one primary way in as a large button (56 px), any second way
   under it, and every other way folded behind one row («דרכים אחרות להיכנס») that opens in place.
   Then the way to open an account, and the legal links.

## What each app makes its own

Two of his apps side by side must not read as one template [N, the rule above]. Each of these is
the app's, never carried over from the page it started from:

- the lockup, and where it sits in the top row (he chose MediZen's place himself: logo left, date
  right);
- the sky's colours, taken from the app's own palette (B-03), and where its glow sits;
- the one accent colour;
- the headline's words;
- which features the films show, and every film's drawing;
- the live line's events;
- the ways to sign in and their order. That is a product decision, asked per app
  (`rules/working-style.md`, Requests): SHIFTS signs in by phone and a WhatsApp code, MediZen by
  Google and Apple;
- the font, where the app's own differs.

## The films

- **The product's real main features, and nothing else.** His words on the round before the
  approval: "ובאמת את הפיצרים העיקרים לא סתם חרטא ודברים שלא קשורים" [N]. Which features is asked
  when it is not decided; he replaced one of MediZen's five himself.
- **A film is a picture, not a screenshot [I].** Large simple shapes, one big number, and a word
  only where the word is the picture («₪300», «כן», «קבלה»). A faithful product window with small
  interface text was the round he answered with "נמחמד לא מעבר" [N].
- **Three beats and a held end [M].** Something appears, something is done to it, the result
  lands; the last frame holds for about a second. A film runs 4.5 to 6 seconds, and each film has
  its own length; the cycle then moves on by itself, and a tap or a swipe moves it too.
- **Every film is true of the product.** What a film shows the product doing, the product does,
  in that way (MediZen: the bot's booking waits for the therapist's approval; a declaration is
  signed by a typed name and a tick, never a drawn line). The claims are listed beside the screen
  and checked against the spec before it is shown. People, numbers and events are invented
  (S-15 allows the film; see its last sentence).

## How it is built

Each line was measured on the approved page or is a fault measured there [M]; `reviewer` checks
them with a browser, as part of the screen's DoD.

- Films are CSS animations; script only switches the film, the word and the dots.
- **Starts when seen, rests when hidden.** A page opened in a background tab starts its first
  film when it becomes visible; while hidden, no animation runs (measured: 0). A hero that played
  once and stopped was judged as a still page.
- **Reduced motion:** nothing moves or advances by itself, every film shows its last frame, and a
  tap still moves to the next film.
- **Someone can stop it.** Content that moves for ever has a pause control, and the card is
  reachable by keyboard [I: WCAG 2.2.2; the approved page had neither].
- **Decoration cannot move the screen.** The app box and the sky use `overflow: clip`, not
  `hidden`: a hidden box is still a scroll container. SHIFTS measured 81 px of scrollable overflow
  from its blurred shapes and moved its screen sideways with a forced scroll; `clip` left 0.
- **A real wide layout,** switched by a media query, never by a URL parameter: the hero is a band
  across the top, the sheet a card under it. Sizes come from a size variable or container units,
  never CSS `zoom`. The phone frame is a demo's chrome only.
- **Short screens drop decoration before the form scrolls:** first the live line, then the film
  card; the primary way in is always on screen without scrolling.
- **Contrast is measured against the sky,** at the pixels behind each text, in every sky the
  screen can show (each hour): 4.5:1, or 3:1 for large text. The accent on a bright sky is where
  it failed.
- The sheet may come first in the source so that Tab reaches sign-in first; the heading order
  still starts at the h1. Every `id` is unique (a repeated one left a button dead).
- The success moment never delays entry: the person is in while it plays.
- For each thing a person can press here, run the Quick Diagnostic of the `microinteractions`
  skill (nadavai): a visible trigger, its state, immediate feedback.

## Where the same films may appear again

MediZen's own decision, not a rule for every app: his pick of 14.11.2026 for its landing page and
its help, «HERO חדש, הפירוט נשאר (מומלץ)». There the landing page's hero takes the same sky and
films while its detailed chapters stay, and the same films open a guided tour's chapter, stand in
a first-run empty state above its one button, and illustrate a «מה חדש» entry; built once, in two
sizes. For another app this is a proposal to him. Wherever a film is reused it sits inside a
surface the standard already has (a tour card, an empty state, the help panel's «מה חדש»: G-12,
G-21, `help-system.md`) and never adds a surface of its own.

## What this pattern is not

- Not a look for the app's work screens. The sky and the glass belong to the entry (and, where he
  chose it, a landing page's hero); `rejected.md` still holds for every screen people work in.
- Not a reason to redo an approved sign-in. An existing app gets it when its sign-in screen is the
  screen under work, or when he asks.
- Not approved for an app until he says so of that app's screen, after its last round. A pick
  followed by "another round" is a direction.
