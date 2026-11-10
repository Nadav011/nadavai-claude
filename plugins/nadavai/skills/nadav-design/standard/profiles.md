# Profiles: which rules apply to which product

The standard is one contract with two profiles. A project names its profile in BRIEF.md (or
PRODUCT.md when there is no BRIEF); a product with two faces names one per face, like a clinic's
back office and the page its customers book on.

| Profile | What it is | Projects today |
|---|---|---|
| **work tool** | People use it for hours to run their work. Depth, many capabilities, repeat use. | MediZen back office, SHIFTS, the social studio, the salon owner side, cash |
| **consumer app** | People open it for a moment, for themselves. Few jobs, done fast. | SportChat, the salon customer booking app, a store's shopping and checkout screens |

## What each profile takes from experience.md

| Group | work tool | consumer app |
|---|---|---|
| 1 Guidance | all of it | G-01, G-02, G-04, G-06, G-09, G-13, G-14, G-15; no "מה זה?" beside every field (G-03), no sample record (G-11); a tour only if the first screens cannot be made obvious |
| 2 When the person goes wrong | all | all |
| 3 Input help | all | all |
| 4 Simplicity | all | all except S-07 and S-13 |
| 5 States | all | all |
| 6 Words | all | all |
| 7 Brand and second language | all | all |

A consumer app is not held to less: it is held to fewer words. Where a work tool explains, a
consumer app makes the step obvious, and the walkthrough check carries more of the weight.

## Showcase sites are outside the standard

A portfolio, a marketing site or a scroll film (nadavc.ai, Camstore's home film, a client demo
site) is judged by other things: the reference it follows, its motion, its bytes on a phone.
Those live in the `site` track of nadav-design. From this standard a showcase site takes only
the states and the errors of anything in it that loads data or submits a form: T-01, T-02, E-01,
E-04, E-05. The moment a site has a shop or an account, those screens are a consumer app.

## An app that is mid-release

A rule of this standard is applied to a screen when that screen is built or changed. An app in
the middle of a large release is first measured, not rebuilt: SportChat v4 gets an `audit`
against this standard, and no help system is added to it before v4 is released (decided with
the plan, 10.11.2026). Its gaps go into `docs/ui-audit/PLAN.md` for after the release.

## What the BRIEF must decide for the standard

1. The profile, per face.
2. Who the least confident user is (S-01): a sentence, with the device they hold.
3. The core screens, at most five, and the core unit of work with how many must be visible at
   the real small screen (S-11); the real small screen itself (a reception PC at 1280x648, a
   branch tablet, a phone in a kitchen).
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
yet the rule counts as `reviewer`. The platform rules are in the skill's `shared/rules.md`.
