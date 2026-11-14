# Store work: APIs first, the browser for the rest

Both stores are worked through their APIs where a scope exists, because an API call can be read
back and repeated, and a console click cannot. A public release (a version release, a raise of a
staged rollout, the first listing, a live listing change, availability or price) is an approval
gate: ask Nadav at that moment. Uploading a build and submitting it for review are not asked once
its checks pass, provided the release is held (SKILL.md, the gates paragraph).

## Helpers (in this skill's `scripts/`)

| Helper | Use | Credentials |
|---|---|---|
| `node scripts/asc.mjs <METHOD> <path> [json\|@-]` | App Store Connect API. Prints the HTTP status, then the body with `demoAccountPassword` shown only as `<set>` or `<empty>`. `@-` reads the body from stdin. | The team API key from `~/.claude/secrets/sporchat-asc.env` (`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_PATH`). |
| `node scripts/play.mjs tracks <pkg>` / `upload <pkg> <aab> <track> [--status draft\|completed] [--name …] [--notes-he …]` / `raw <METHOD> <path> [json]` | Google Play Developer API (androidpublisher v3), one edit per call, committed at the end. | The service account `~/.claude/secrets/play-publisher-service-account.json` (or `PLAY_SA_KEY`). |
| `asc` (App Store Connect CLI, MIT, `~/.local/bin/asc`) | Readiness checks, review status waits, typed reads and writes. Add `--read-only` (or `ASC_READ_ONLY=1`) to every call that should only read: a mutation is then refused before it is sent. | `~/.asc/config.json`, profile `nadav-team`, made from the same vault key; run with `ASC_BYPASS_KEYCHAIN=1`. |

A body that carries a secret (the demo account's password) never has the value on the command
line. Two safe paths: `asc review details-update --id <id> --demo-account-password @env:<VAR>` (or
`@file:<path>`), with the variable loaded from the vault in the same command (`set -a; . <vault
file>; set +a`); or a command that reads the vault and pipes the JSON into `asc.mjs ... @-`. asc
prints the password as redacted unless `--include-sensitive` is passed, so never pass it. Why: a
command line lands in the transcript, and `rules/acting-on-behalf.md` keeps passwords out of it.
Tested 2026-11-09: `@env:` of an unset variable fails with exit 2 before any request, and with
`--read-only` the PATCH stopped at exit 6 after the value resolved.

### asc on a new machine

No pacman or AUR package exists, so install the release binary, never `curl | bash`:

1. `gh release download <tag> -R rorkai/App-Store-Connect-CLI -p 'asc_*_linux_amd64' -p 'asc_*_checksums.txt'`
   into an empty folder (`linux_arm64` on ARM).
2. `sha256sum -c --ignore-missing asc_*_checksums.txt` must print `OK`. The repo publishes no
   build attestations (`gh attestation verify` returns 404), so the checksum file is the check.
3. `install -m 0755 asc_*_linux_amd64 ~/.local/bin/asc`, then `asc --version`.
4. Telemetry is on by default and posts to rork.com. Run the first command with
   `DO_NOT_TRACK=1`, then `asc telemetry disable` (kept in `~/.asc/telemetry.json`); `asc telemetry
   status` must show `enabled: false`.
5. `set -a; . ~/.claude/secrets/sporchat-asc.env; set +a; asc auth login --bypass-keychain --name
   nadav-team --key-id "$ASC_KEY_ID" --issuer-id "$ASC_ISSUER_ID" --private-key "$ASC_KEY_PATH"
   --network >/dev/null`. The config keeps the key's path, not its content.
6. `ASC_BYPASS_KEYCHAIN=1 asc --read-only apps list` lists the team's apps.

Installed on the LENOVO 2026-11-09: 6.5.3, checksum verified, telemetry off.

## Readiness gate (before every iOS submission)

| Check | Pass | Why |
|---|---|---|
| `asc --read-only validate --app <id> --version <v> --strict` | Exit 0. The report's ordered plan names the first thing to fix otherwise. | It reads metadata limits, review details, the attached build, encryption, content rights, pricing, availability, screenshots and age rating in one call; `--strict` turns placeholder and test wording into blockers. |
| `asc --read-only review doctor --app <id> --version <v>` | No blocker listed. | It explains why a submission would be refused before the submit call fails. |
| Demo sign-in against production (Traps below) | HTTP 200, not a super user. | No CLI can see that a password was rotated. |

After the submit, wait in slices (`rules/model-routing.md`): `asc --read-only status --app <id>
--until review-done --timeout 140s` with Bash timeout 175000, one call per turn.

| Exit | Meaning | Next |
|---|---|---|
| 0 | Approved: `ACCEPTED`, `PENDING_*_RELEASE`, `PROCESSING_FOR_DISTRIBUTION` or `READY_FOR_DISTRIBUTION`. | Tell Nadav it is approved and ask for the release (MANUAL); after his yes, `POST /v1/appStoreVersionReleaseRequests`, then confirm on-sale with `scripts/store-status.mjs`. |
| 1 | `REJECTED`, `METADATA_REJECTED`, `INVALID_BINARY` or `DEVELOPER_REJECTED`. | Rejection triage below. |
| 7 | Still pending when the timeout ended the wait. | Run the same command again next turn. |

`--until processed` waits the same way for a build to turn `VALID`. `--until ready-for-sale` does
not read availability, so "live" still comes only from `scripts/store-status.mjs` (Traps below).

Sources: https://github.com/rorkai/App-Store-Connect-CLI (asc 6.5.3 `--help`),
https://github.com/rorkai/app-store-connect-cli-skills.

## Rejection triage

| Step | Check | Why |
|---|---|---|
| 1 | Copy the exact heading and text of the notice (Resolution Center, the Play email and Policy status) into the project's ledger before touching code. Note the cited guideline or policy, the example given, the version code or build, and any deadline. | A paraphrase loses the clause the fix must answer, and Google says a notice may not list every violation. |
| 2 | Read the crash log App Review attached, when there is one, and reproduce on the same OS version. | A crash in review is usually a path the team never runs: a fresh install, an empty account, iPad. |
| 3 | Fix and answer one guideline at a time, quoting it in the reply. | A reply that argues several points at once gets a generic second rejection. |
| 4 | Play: open every active track (internal, closed, open, production, staged rollout) and read which version codes are live on each. | An old build on any track keeps a policy violation alive after production is fixed. |

Review notes that pre-empt the common Capacitor rejections:

| Guideline | What the notes say | Why |
|---|---|---|
| 4.2 Minimum functionality | The native features list from `native-bar.md` that the reviewer can try (push, biometric lock, share sheet, haptics, offline). | 4.2 rejects an app that is "a repackaged website". |
| 4.2 and 2.5.2 for a remote-URL shell | The app's native features, and that the remote content is the app's own service, not a way to change its features after review. | A `server.url` shell looks like a web clipping and like code loaded after review. |
| 5.1.2(i) | Where personal data goes to a third party, including a third-party AI, the app asks for explicit consent first; the notes say where the consent screen is. | Apple added "including with third-party AI" to 5.1.2(i). |

Sources: https://developer.apple.com/app-store/review/guidelines/ (read 2026-11-09),
https://github.com/sunvali/play-store-review-skill (rejection playbook),
https://github.com/safaiyeh/app-store-review-skill.

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
| Resubmit after a rejection | A submission left in `UNRESOLVED_ISSUES` does not take `submitted: true` again (409 "Version is not ready to be submitted yet", for 30 minutes and more), and its rejected item can neither be deleted nor joined by a new one. `PATCH /v1/reviewSubmissions/<id>` with `canceled: true`, wait for `COMPLETE`, then open a new submission as above (found 2026-11-12, Cash). |
| Review attachment (a screen recording for App Review) | `POST /v1/appStoreReviewAttachments` (`fileName`, `fileSize`, `appStoreReviewDetail`), `PUT` the bytes to each `uploadOperations` URL with its headers, then `PATCH` it with `uploaded: true` and `sourceFileChecksum` (MD5); read `assetDeliveryState` `COMPLETE`. A simulator recording is accepted as a file but say in the notes that it is one: Apple's 2.1 request asks for a physical device. A review detail holds one attachment: `DELETE` the old one first (409 "max of 1 attachment"). A file over 5 MB comes in several operations; cut each part to a file before the `PUT` (`head -c` in a pipe under `pipefail` kills the loop after the first part, and the `PATCH` then answers 500). Apple's 2.1 of 2026-11-13 also said: "we cannot use a demo video showing the app in use" in place of a working sign-in. |
| Read a rejection | The text and the reviewer's screenshot are only in the web Resolution Center (`/apps/<id>/distribution/reviewsubmissions/details/<submission>`); the API gives the state alone. Apple's sign-in form sits in a cross-origin iframe that `agent-browser auth login` and `frame` cannot reach, so open the page `--headed` in the kept profile and let Nadav sign in once (Sign in with iPhone); the profile keeps the session. Reply there with `fill` on the «Reply» textbox, then cancel and resubmit as above. |
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
- **"PENDING: release completed, public page 404" can hide a rejection, or a release never sent.**
  For Cash on 2026-11-11, store-status showed that line for two days. In the console, the Publishing
  overview held a 9.11 rejection (the installed launcher icon was Capacitor's default, not the
  listing's) and 11 changes under "השינויים עדיין לא נשלחו לבדיקה". So when a Play app stays at 404
  for more than a day, read the console's Publishing overview and Inbox. Before the first upload,
  check that the bundle's `base/res/mipmap-*/ic_launcher*.png` show the listing icon (`unzip` the AAB
  and look at the images). Google may refuse a kept agent-browser profile's login ("This browser or
  app may not be secure"); `--profile Default` (a copy of Nadav's signed-in Chrome) then gets in.
- **A 200 page is the listing, not the newest release.** With managed publishing on, an approved
  production release waits under "השינויים מוכנים לפרסום" in the Publishing overview while the API
  says `completed` and the page still serves the older version (Cash 1.2.0, 2026-11-14: Google had
  approved it, store-status said live, the store session knew it waited for Nadav's yes). Before saying
  a Play update is out, open the Publishing overview: an empty list and "פורסם לאחרונה בתאריך <today>"
  is proof. Pressing "פרסום שינוי …" and then "פרסם שינויים" there is the public release (Nadav's yes);
  with managed publishing off, "שליחת N שינויים לבדיקה" publishes the moment Google approves, so it
  is the same gate (SporChat's TWA, 2026-11-14, held three such unsent changes).
- **A reviewers' code must open the app in one step.** Cash's code, typed in the store app, redirected to a separate demo
  origin, which showed its own lock and asked again; the iPad reviewer read the second lock as a refused sign-in and rejected
  under 2.1 (2026-11-13). Carry the unlock with the redirect (Cash: `#review=<code>` that only the demo build accepts), and
  before submitting walk the reviewers' path from a cold start on the live URL in WebKit at iPad size.
- **A stale demo password fails the review.** The MediZen reviewer password had been rotated
  since it was entered, and Apple's reviewers would have been refused. Before each submission,
  sign in with the demo account against production and check two things: HTTP 200, and that the
  account is not a super user.
- **Personal Play developer accounts** must run a closed test with 12 testers for 14 days before
  their first production release. Nadav's account is an organization account, so this did not
  apply on 7.11. Check the account type in the console before planning a release date.
- **Holding a version until approval:** set `releaseType: MANUAL` and keep the old version's
  availability as decided. The release itself is Nadav's yes (`rules/working-style.md`, Approval
  gates): when `appStoreState` reaches `PENDING_DEVELOPER_RELEASE`, tell him, with the version and
  what changes for users, and release only after his yes. A timer may watch the state and notify
  him (an hourly systemd user timer, `Persistent=true`, that writes the state to a file and sends
  `nadavai-alert`; on a rejection it notifies too); it never posts the release request or changes
  availability by itself. Note the machine and the unit name in the project's memory.
- **An expired build stalls the review.** On 2026-11-11, MediZen 1.2 and RetroBarber 1.0 had sat
  in `WAITING_FOR_REVIEW` for 4.5 days (since 7.11), and the build attached to each was
  `expired: true`. Every build of all six of Nadav's apps had expired, including builds uploaded
  the day before. The cause was not found through the API. A new upload processed normally,
  `expired: false` and `IN_BETA_TESTING`. When a review waits more than 48 hours, read
  `GET /v1/apps/<id>/appStoreVersions?include=build` and check `expired` on the attached build.
  `store-status.mjs` prints "IN REVIEW" for both `WAITING_FOR_REVIEW` and `IN_REVIEW`, so read
  `appStoreState` itself.
- **Read `releaseType` before every submission.** RetroBarber 1.0 had been submitted with
  `AFTER_APPROVAL`, which would have released it to 175 territories without Nadav's yes. It was
  set to `MANUAL` while it waited (`PATCH /v1/appStoreVersions/<id>`, allowed in
  `WAITING_FOR_REVIEW`).
- **"I don't see it in TestFlight":** read the tester's `state` in
  `GET /v1/betaGroups/<id>/betaTesters`. `INVITED` means the email invitation was never accepted,
  and the TestFlight app shows nothing until it is. `POST /v1/betaTesterInvitations`
  (`app`, `betaTester`) sends it again, and answers 409 "Tester has no installable build" while
  no valid build exists.
