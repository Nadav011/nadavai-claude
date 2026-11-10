# Profiles: which rules apply to which product

The standard is one contract with three profiles. A project names its profile in BRIEF.md (or
PRODUCT.md when there is no BRIEF); a product with two faces names one per face, like a clinic's
back office and the page its customers book on.

| Profile | What it is | Projects today |
|---|---|---|
| **work tool** | People use it for hours to run their work. Depth, many capabilities, repeat use. | MediZen back office, SHIFTS, the social studio, the salon owner side, cash |
| **consumer app** | People open it for a moment, for themselves. Few jobs, done fast. | SportChat, the salon customer booking app, a store's shopping screens |
| **showcase site** | It presents: a portfolio, a marketing site, a scroll film. | nadavc.ai, Camstore's home film, client demo sites |

## What each profile takes from experience.md

| Group | work tool | consumer app | showcase site |
|---|---|---|---|
| 1 Guidance | all of it | G-01, G-02, G-04, G-06, G-09, G-13, G-14; no "מה זה?" beside every field (G-03), no sample record (G-11); tours only if the first screens need one | none, except G-04 |
| 2 When the person goes wrong | all | all | E-01, E-04, E-05 for any form or checkout it has |
| 3 Input help | all | all | I-01, I-02, I-03 for any form it has |
| 4 Simplicity | all | all except S-07 and S-13 | S-02 (the first real action is reachable at once, without scrolling through the show), S-05 |
| 5 States | all | all | T-01 and T-02 for anything that loads data |
| 6 Words | all | all | all |
| 7 Brand and second language | all | all | all |

A consumer app is not held to less: it is held to fewer words. Where a work tool explains, a
consumer app makes the step obvious, and the walkthrough check carries more of the weight.

A showcase site is judged mostly by other things (the reference it follows, its motion, its
bytes on a phone); those live in the `site` track of nadav-design, not here.

## What the BRIEF must decide for the standard

1. The profile, per face.
2. Who the least confident user is (S-01): a sentence, with the device they hold.
3. The core unit of work and how many must be visible at the real small screen (S-11); the real
   small screen itself (a reception PC at 1280x648, a branch tablet, a phone in a kitchen).
4. The three layers (S-08): which capabilities are day one, which open with use, which sit
   behind "עוד".
5. Light or dark by default, and the text floor. Both themes are designed to the same bar
   either way.
6. Whether the AI helper is in scope. Its running cost is Nadav's decision, asked when it would
   start costing money.
7. Any default of the standard ([B], [I], [P]) the project overrides, with the reason.

## Platform

The profile says what the screen owes the person; the platform says how it is checked. On a web
screen (a browser, a Capacitor shell) the automated checks read the DOM. On a native screen
(Expo) the same rules hold and the checks read the device instead; where no device check exists
yet the rule counts as `reviewer`. The platform table is in the skill's `shared/platform.md`.
