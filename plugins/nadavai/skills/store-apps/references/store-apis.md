# Store work: APIs first, the browser for the rest

Both stores are worked through their APIs where a scope exists, because an API call can be read
back and repeated, and a console click cannot. Every submission, release or upload is an approval
gate: ask Nadav at that moment.

## Helpers (in this skill's `scripts/`)

| Helper | Use | Credentials |
|---|---|---|
| `node scripts/asc.mjs <METHOD> <path> [json\|@-]` | App Store Connect API. Prints the HTTP status, then the body with `demoAccountPassword` shown only as `<set>` or `<empty>`. `@-` reads the body from stdin. | The team API key from `~/.claude/secrets/sporchat-asc.env` (`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_PATH`). |
| `node scripts/play.mjs tracks <pkg>` / `upload <pkg> <aab> <track> [--status draft\|completed] [--name …] [--notes-he …]` / `raw <METHOD> <path> [json]` | Google Play Developer API (androidpublisher v3), one edit per call, committed at the end. | The service account `~/.claude/secrets/play-publisher-service-account.json` (or `PLAY_SA_KEY`). |

A body that carries a secret (the demo account's password) is built by a command that reads the
vault and pipes the JSON into `asc.mjs ... @-`. Why: a command line lands in the transcript, and
`rules/acting-on-behalf.md` keeps passwords out of it.

## App Store Connect recipes

| What | Call |
|---|---|
| New version | `POST /v1/appStoreVersions` (`platform: IOS`, `versionString`, `releaseType: MANUAL` when the release must wait), relationship `app`. |
| Attach the build | `PATCH /v1/appStoreVersions/<id>/relationships/build`, once the build is `VALID`. |
| Text (description, what's new, keywords) | `/v1/appStoreVersionLocalizations`. |
| Review details and demo account | `POST` or `PATCH /v1/appStoreReviewDetails`: contact fields, `demoAccountRequired`, `demoAccountName`, `demoAccountPassword`, `notes`. |
| OTA disclosure (bundled model) | In `notes`: the app updates its own web content over the air, signed with the developer's key, without changing its purpose or features (guideline 2.5.2). |
| Content rights | `PATCH /v1/apps/<id>`, `contentRightsDeclaration` (`USES_THIRD_PARTY_CONTENT` or `DOES_NOT_USE_THIRD_PARTY_CONTENT`); a submission is refused while it is unset. |
| Age rating | `PATCH /v1/ageRatingDeclarations/<id>`. |
| Availability | `GET /v2/appAvailabilities/<appId>` and its `territoryAvailabilities`; `PATCH /v1/territoryAvailabilities/<id>` with `available`; `POST /v2/appAvailabilities` when none exists. |
| Submit for review | `POST /v1/reviewSubmissions` (`platform: IOS`, `app`), then `POST /v1/reviewSubmissionItems` (`appStoreVersion`), then `PATCH /v1/reviewSubmissions/<id>` with `submitted: true`. Read back `WAITING_FOR_REVIEW`. |
| Release a MANUAL version | `POST /v1/appStoreVersionReleaseRequests` once `appStoreState` is `PENDING_DEVELOPER_RELEASE`. |

## Google Play

- Granted scopes: view app info, release to production and testing tracks, manage testing tracks.
  "Manage store presence" is not granted, so the listing text and graphics go through the browser.
- A new app accepts only `--status draft` releases until its first review. Send the first
  release for review in the console.
- Turn off Google's automated testing (pre-launch robots) for an app that books real slots or
  sends real messages. Why: the robots sign in and tap through flows.

## What needs the browser

| Item | Why it is browser-only |
|---|---|
| App Store Connect App Privacy label (data types, linked, tracking) | No API. Keep it equal to the privacy manifest and the SDKs in the binary. |
| Play declarations: data safety, content rating (IARC), target audience, app access, ads | No API for them. |
| Play listing text, icon, feature graphic, screenshots | The "manage store presence" grant was refused. |
| Passwords in a console form (Play "App access" sign-in, a console login) | Only Nadav pastes them. |

Use `agent-browser` with a kept profile for console work (`rules/acting-on-behalf.md`). Claude in
Chrome refuses passwords and can be blocked by a password manager's overlay.

## Traps

- **A Play listing edit is not sent by "שמור כטיוטה".** The editor has two steps, "נכסים" and
  "בדיקה". Click "הבא", answer the AI-assets declaration (labels are for assets the AI generated
  or edited, such as images and video), then click "שמירה". Only then do the changes appear in
  "סיכום השינויים לפרסום" under "השינויים עדיין לא נשלחו לבדיקה". Send them from there with
  "שליחת N שינויים לבדיקה". Done when that page says "השינויים בבדיקה". Why: on 7.11.2026 a
  draft saved through agent-browser never reached the overview, and the overview was empty until
  the review-step save. The agent-browser `--profile Default` copy is fine for reading; do the
  send in Claude in Chrome or a signed-in profile.
- **Screenshots come from a synthetic backend only.** Never real client data. Look at every image
  before upload: a 404 page once went into a live listing. Apple names the 6.1" Dynamic Island set as required and fills it by scaling, so upload one 6.9"
  set (1320×2868) and confirm in ASC that it was accepted (listing.md, step 5). Play refuses phone screenshots whose long side is more than twice the short side,
  so render Play's set at 2:1 or squarer.
- **"Ready for Distribution" is not "on sale".** A version with empty availability shows "Removed
  from App Store". Read `/v2/appAvailabilities` before saying an app is live.
- **A Play production release with status `completed` is not "live".** `play.mjs tracks` reads the
  edit, not the review: on 2026-11-09 three packages showed `completed` while their public Play page
  answered 404 (still in Google's review, or never published). Count an Android app as live only when
  `https://play.google.com/store/apps/details?id=<pkg>` opens and the release is `completed`
  (`scripts/store-status.mjs` does both). The same rule on iOS: `READY_FOR_SALE` with no territories
  is off sale, so the matrix also reads Apple's public lookup.
- **A stale demo password fails the review.** The MediZen reviewer password had been rotated
  since it was entered, and Apple's reviewers would have been refused. Before each submission,
  sign in with the demo account against production and check two things: HTTP 200, and that the
  account is not a super user.
- **Personal Play developer accounts** must run a closed test with 12 testers for 14 days before
  their first production release. Nadav's account is an organization account, so this did not
  apply on 7.11. Check the account type in the console before planning a release date.
- **Holding a version until approval:** set `releaseType: MANUAL`, keep the old version's
  availability as decided, and install a release-on-approval timer: an hourly systemd user timer
  (`Persistent=true`) whose script reads `appStoreState`. On `PENDING_DEVELOPER_RELEASE` it
  restores availability, posts the release request and disables itself. On a rejection it only
  notifies. Why: approval can come at night, and the timer lives on one machine, so note the
  machine and the unit name in the project's memory when you install it.
