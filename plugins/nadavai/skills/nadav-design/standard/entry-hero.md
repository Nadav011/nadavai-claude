# The entry screen with a hero

How an app's sign-in screen is built: a hero on top that shows the product at work, and a
beautiful sign-in under it. Read it before a sign-in screen is planned, built or redesigned,
beside `experience.md`. It is a pattern for that one screen, not a look for the app.

`[N]` marks Nadav's own words, `[M]` a value measured on the approved page
(`~/.omc/plans/agent-reports-2026-11-10/hero-anatomy-2026-11-14.md`), `[I]` this skill's reading.
Times are UTC, as the transcripts record them. Words such as "soft" or "simple" below describe
the approved page and are not a check; the checks are the measured lines.

## What he asked of every app's entry screen

- 14.11.2026, typed to the nadav-design session:
  "ושלא כל המכים ממש יראו אותו דבר כן אבל כל אותם עקורנו תשל אנציות HERO הדגשה של פיצרי םפהתבחרות יפה וזה שכל יאחד יהיה לו את האופי של האפליקציה שלו" [N]
- The same day, 13:39, to the MediZen session, asked which part of SHIFTS's hero he had disliked
  so that MediZen's would be built differently:
  "זה לא קשור אלייך אתה תעסק רק בשבילך זה לא אמור להיות העתק כל אחד והאופי שלה אלב אולם דברים מגניבם וכל העקררונותצ של האנציות הסראטון הקוד הפיצרים" [N]
- 14:19, on three rough directions that put the hero beside the sign-in and played a film once:
  "כן אבל איפה כל העקורנות של סרטונהים דבירם רצים הדגשה של פיצרים HERO למעלה הלוגדו דווןקא היה פצצה בראשון כל השאר לא" [N]

This skill's reading of the three [I]: the principles are shared and each screen is its own.
Shared: a hero on top, things running in it, the product's features highlighted, a beautiful
sign-in. Its own: the app's character, and never a copy of another app's screen.

## The approved screen, and what its four tries showed

MediZen's sign-in (`examples.md`, "MediZen's sign-in screen") was approved on its fourth try with
the pick «כן, המסך מאושר». Three compositions of MediZen's own were rejected. The fourth kept the
composition of SHIFTS's sign-in page (whose own screen was still in a round that day) and put
MediZen's logo, colours, features and ways to sign in into it.

What follows from that is a recommendation, not his rule [I]: begin an app's entry screen from
the composition below, make every part in "What each app makes its own" the app's, and show it to
him at its first rough version (`modes/screen.md`, step 2). A composition of the app's own is
not forbidden; it is shown to him rough in the same way, and it keeps the four shared principles.

## The composition of the approved page

Measured at 390x844 [M]. A screen that starts from it keeps the order and the proportions, not
the pixels.

1. **The hero on top, the sign-in under it.** On a phone the hero takes a little over half the
   height (56.7%) and the sign-in sheet rises from the bottom.
2. **A sky:** the app's colours as light, not a flat fill: three gradients, one glow in the
   accent, two slow blurred shapes, a grain; it follows the hour of the day.
3. **A top row:** the app's real lockup and one line beside it (the date).
4. **A headline of two short lines** whose one accented word changes with the film on show.
5. **One glass card that plays the product's main features as short films,** one at a time
   (five), with dots that show which film is on and how long it has left.
6. **One live line** under the card, in the same glass: a single invented event of the product,
   changing every few seconds.
7. **The sign-in sheet:** a title, the primary way in as a large button (56 px), a second way
   under it, and the remaining ways behind one row («דרכים אחרות להיכנס») that opens in place;
   then the legal links. The row that folds is for a product with three or more ways in; with
   fewer, the ways he chose are simply shown [I]. A row that opens an account is there only where the
   product lets a person open one (S-05).

## What each app makes its own

His words above: the screens do not look the same, and none is a copy. On a screen that starts
from the composition, each of these is the app's and is never carried over:

- the lockup, and where it sits in the top row (the agent's choice, seen in the rough showing; on
  MediZen's he then chose the place himself: "שמאל והתאריך באותה שורה שלה מצד ימין התאריך" [N]);
- the sky's colours, taken from the app's own palette (B-03), and where its glow sits;
- the one accent colour;
- the headline's words;
- which features the films show, and every film's drawing;
- the live line's events;
- the ways to sign in and their order, which are a product decision of his per app
  (`rules/working-style.md`, Requests): SHIFTS signs in by phone and a WhatsApp code, MediZen by
  Google and Apple. A sign-in that is not an account at all (a name picked on a shared device)
  keeps its own form in the sheet;
- the font, where the app's own differs.

## The films

- **The product's real main features, and nothing else.** His words on the round before the
  approval: "ובאמת את הפיצרים העיקרים לא סתם חרטא ודברים שלא קשורים" [N]. Which features is his
  to say when nothing decided it (he replaced one of MediZen's five himself).
- **Not a product window with small interface text.** That round he answered with
  "נמחמד לא מעבר" [N]. The approved films are drawn from shapes, with a big number («₪300», 42 px)
  and a few words: a time, a name, «כן», «קבלה», one short line in a chat bubble; their smallest
  text is 12 px [M]. Fewer words and larger shapes is this skill's reading of the difference [I].
- **Three beats and a held end.** Something appears, something is done to it, the result lands,
  and the last frame holds about a second before the next film [M: holds of 0.85 to 1.2 s; films
  of 4.7 to 5.7 s, each with its own length]. Everything in a film ends before the film does: on
  the approved page one line was still moving when its film switched, which is a fault. The cycle
  moves on by itself, and a tap or a swipe moves it too.
- **Every film is true of the product.** What a film shows the product doing, the product does,
  in that way (MediZen: the bot's booking waits for the therapist's approval; a declaration is
  signed by a typed name and a tick, never a drawn line). The claims are listed beside the screen:
  every beat, the last frame, and every word in the film. A reader who did not build the film
  checks the list against the spec before the screen is shown: on the approved page the builder
  and the owner's eye both passed a last frame in which a signed declaration was filed and a
  treatment summary appeared by itself, which the product does not do (MediZen's own review of
  the page, `~/design-redesign/r12-lanes/ENTRY-E-REVIEW-1.md`). People, numbers and events are
  invented (S-15 allows the film; see its last sentence).

## How it is built

`reviewer` checks these with a browser, as part of the screen's DoD. `[M]` lines hold on the
approved page as measured; `[M: fault]` lines are faults measured on it, fixed after his approval.

- Films are CSS animations; script only switches the film, the word and the dots [M].
- **Starts when seen, rests when hidden.** A page opened in a background tab starts its first
  film when it becomes visible, and while it is hidden no animation runs [M: 0 running]. Why
  [I, from the MediZen session's rounds]: a hero that had played once in a hidden tab met him as
  a still page.
- **Reduced motion:** nothing moves or advances by itself, every film shows its last frame, and a
  tap still moves to the next film [M].
- **Someone can stop it, and a key does what a tap does.** Content that moves for ever has a pause
  control that the keyboard reaches, at the card's edge beside the dots, and the keyboard can move
  to the next film too (the card as one button, or the dots as buttons) [M: fault, the page had
  neither; WCAG 2.2.2 and 2.1.1]. Each of these is a touch target of at least 44 px, like every
  target the standard's probe measures.
- **What a screen reader gets.** The card is one image with one label that names the features,
  and every slide inside it is `aria-hidden`: MediZen's own review found about thirty text nodes
  of the films still in the accessibility tree inside the image (`ENTRY-E-REVIEW-1.md`, F2). The
  h1 carries the changing words as visually hidden text, so it does not read as a sentence with
  its subject missing [M: fault].
- **Decoration cannot move the screen.** The app box and the sky use `overflow: clip`, not
  `hidden`: a hidden box is still a scroll container. The SHIFTS session measured 81 px of
  scrollable overflow from its blurred shapes and moved its screen sideways with a forced scroll;
  with `clip` it measured 0.
- **A real wide layout,** switched by a media query, never by a URL parameter, with sizes from a
  size variable or container units, never CSS `zoom` [M: fault, both]. The layout he approved for
  a computer: the sky is a band across the top; inside it the headline and the live line sit on
  one side and the film card on the other; the sheet is a card centred under the band, rising
  over its lower edge. The phone frame is a demo's chrome only.
- **Short screens drop decoration before the form scrolls:** first the live line, then the film
  card [M]; the primary way in is on screen without scrolling. On the smallest phone (320x568),
  with the other ways open and an error showing, everything in the sheet can still be reached:
  on the approved page the legal links could not be (`ENTRY-E-REVIEW-1.md`, F4).
- **Contrast is measured against the sky,** at the pixels behind each text, in every sky the
  screen can show (each hour): 4.5:1, or 3:1 for large text. The approved page did not meet it in
  its morning, noon and evening skies [M: fault]; which text failed in which sky is in the
  anatomy's contrast table.
- The sheet may come first in the source so that Tab reaches sign-in first; the heading order
  still starts at the h1. Every `id` is unique [M: fault, a repeated one left a button dead].
- The success moment does not hold the person back: she is in while it plays [I; the approved
  page waits 900 ms before its success step].

## Where the same films appear again in MediZen

MediZen's own decision, and not part of this pattern for any other app: his pick of 14.11.2026
for its landing page and its help, «HERO חדש, הפירוט נשאר (מומלץ)». As that option read, the
landing page's hero takes the same sky and films while its detailed chapters stay, and the same
films appear at the head of a guided tour, in a first-run empty state and in «מה חדש», built once
in two sizes. Each of those uses still has to fit the rules of the surface it lands in: the tour
card's fixed contents and the lit control it must not cover (`help-system.md`), and a «מה חדש»
entry that is never stacked above the work (G-12).

## What this pattern is not

- Not a look for the app's work screens. The sky and the glass belong to the entry (and, in
  MediZen, to the landing page's hero); `rejected.md` still holds for every screen people work in.
- Not a reason to redo an approved sign-in. An existing app gets it when its sign-in screen is the
  screen under work, or when he asks.
- Not approved for an app until he says so of that app's screen, after its last round. A pick
  followed by "another round" is a direction.
