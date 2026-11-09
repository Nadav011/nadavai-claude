# Platform approvals that must stay valid

An app stays in the stores, and a Meta integration keeps working, only while a set of approvals at
Apple, Google and Meta stays valid. Some are done once per legal entity, others per app, and some
expire. Each one is recorded in a ledger and checked on a schedule, so a lapse is found before a
reviewer or a user hits it.

Sources were read on 2026-11-07. "Verified" means the linked official page says it. "Inferred"
means the page implies it without saying it. "Unverified" means it was not found on an official
page; check it before acting on it.

## Steps

1. **Keep the ledgers** at `${STORE_APPROVALS_DIR:-~/Documents/store-approvals}`: one `entity.json`
   for the legal entity, and one `<app>.json` per app (format below). Why: entity IDs, account
   names and dates are private, and this repo is public. Done when every row of the two tables
   below has an item in a ledger, with its status and the date it was last checked.
2. **Run the check** before each store submission, each Meta App Review submission, and on the
   first of every month:
   `node scripts/check-approvals.mjs [--asc] [--play]`. It reads the ledgers, and with the flags it
   also reads App Store Connect and Play. It writes and submits nothing. Done when it exits 0, or
   every item it flags has an owner and a date.
3. **Update the ledger** the same day an approval changes: approved, expired, renewed, or a new
   permission or app added. Done when the item's `checked` date is today.

## Once per legal entity

| Item | What keeps it valid | Source | Checked |
|---|---|---|---|
| Apple Developer Program, organization membership | A legal entity with a D-U-N-S number. "DBAs, fictitious businesses, trade names, and branches are not accepted" as the entity. An individual membership moves to an organization by a request from the Account Holder, who must be the organization's founder or cofounder and give its D-U-N-S. | https://developer.apple.com/support/D-U-N-S/ , https://developer.apple.com/help/account/membership/updating-your-account-information | Verified |
| Google Play, organization developer account | A D-U-N-S number, plus the official organization and identity documents that match the payments profile. "Your developer presence and apps may be removed from Google Play" when verification fails, and apps cannot be submitted before it passes. | https://support.google.com/googleplay/android-developer/answer/10841920 | Verified |
| Meta Business Verification (per business portfolio) | Required before an app connected to the business gets advanced access, or before users from other businesses can grant it permissions. Only an Admin of the business can complete it. That one verification covers every app connected to that business is implied ("Connecting your app to a verified Business completes the connection process"), not stated. | https://developers.facebook.com/docs/development/release/business-verification | Verified, except the coverage of every app (inferred) |
| Meta Access Verification (Tech Provider) | Still required for a business whose console says so: the live console wins over the docs page. On 2026-11-07, Business Suite > Business info showed "Access verification status: Not verified", saying that API calls to certain permissions and features in advanced access "will begin to be blocked". The app's access-verification page said "To avoid restrictions to 1 app, this must be completed by" a date, with "connect the app to a verified business" as its prerequisite (Business Verification first). The docs page says it "is no longer required" (retirement notice 2026-10-09); the console contradicts that. | Live console (Business Suite > Business info; developers.facebook.com/&lt;app id&gt;/access-verification/), https://developers.facebook.com/docs/development/release/access-verification | Console read 2026-11-07; it contradicts the docs, and the console wins |

## Per app, recurring

| Store | Item | What keeps it valid | Source | Checked |
|---|---|---|---|---|
| Apple | Agreements | The latest Program License Agreement is accepted by the Account Holder. The Paid Applications Agreement is needed for paid apps and in-app purchases. Developers report that App Store Connect locks out new versions until the updated agreement is accepted. | https://developer.apple.com/support/terms/ , developer forums | Paid agreement verified; the Account Holder and the lock reported on the forums only |
| Apple | App Privacy | Required for every new app and update, and kept accurate, third-party SDKs included. Answers can change at any time without an app update. | https://developer.apple.com/app-store/app-privacy-details/ | Verified |
| Apple | Reviewer account | Demo account info when the app has a login, with the back end on (guideline 2.1). In-app account deletion when the app creates accounts (5.1.1(v)). | https://developer.apple.com/app-store/review/guidelines/ | Verified |
| Google | Target API level | New apps and updates must target API 36 (Android 16) from 2026-08-31, with an extension to 2026-11-01 on request. Existing apps below API 35 stay hidden from new users on newer devices. The level has risen every August. | https://support.google.com/googleplay/android-developer/answer/11926878 | Verified; the yearly cadence is inferred from the dates |
| Google | Data safety | Required for every app on a closed, open or production track (not internal only), and accurate at all times, third-party code included. Inaccurate forms lead to "blocked updates or removal from Google Play". | https://support.google.com/googleplay/android-developer/answer/10787469 | Verified |
| Google | Account deletion | An in-app path, plus a web link where users can ask for deletion without the app, named in the Data safety form. | https://support.google.com/googleplay/android-developer/answer/13327111 | Verified |
| Google | Reviewer credentials | Sign-in details that are "accessible at all times, reusable, and valid regardless of user location", in English. They bypass OTP and two-step codes. If the password expires, the review may fail. | https://support.google.com/googleplay/android-developer/answer/15748846 | Verified |
| Google | App registration (developer verification) | Every Play app registered in Play Console by 2026-09-30 (99% were registered automatically; check Play Console Home for the rest), or it faces global removal. Install-time verification began 2026-09-30 in Brazil, Indonesia, Singapore and Thailand and goes global in 2027. | https://support.google.com/googleplay/android-developer/table/12921780, https://developer.android.com/developer-verification | Verified 2026-11-09 |
| Google | Sensitive permissions, 2027-01-27 | Contacts: apps without a core need use the Android Contact Picker. Precise location: the location button is the recommended minimum scope. `READ_CALL_LOG` no longer allowed for account verification (use the Digital Credentials API or the SMS Retriever API). From 2027-08-25, Local Network (apps targeting API 37+) and Manage Contacts need a Play Console declaration. Check the merged manifest (`shell-checklist.md` row 19). | https://support.google.com/googleplay/android-developer/table/12921780 | Verified 2026-11-09 |
| Google | Code optimization, February 2027 | Apps with more than 10 MB of DEX code need at least 25% obfuscation, optimization and shrinking (R8 or another shrinker). The Capacitor Android template ships `minifyEnabled false`, and R8 full mode stripped plugin annotations and callbacks until Capacitor 8.6.0, so turn on R8 only on Capacitor 8.6.0 or later and run the main flows on the release build (`r8-analyzer` skill for the keep rules). | https://support.google.com/googleplay/android-developer/answer/17492799, https://github.com/ionic-team/capacitor/releases/tag/8.6.0 | Verified 2026-11-09 |
| Google | Memory, February 2027 | New bad-behaviour thresholds on memory (anonymous RSS plus swap, and bitmap memory) per device RAM tier, shown under Memory in Android vitals. | https://support.google.com/googleplay/android-developer/answer/17492799 | Verified 2026-11-09 |
| Google | Zero-tap sign-in restore, April 2027 | Apps with sign-in restore it on a new phone through the Restore Credentials API (Credential Manager), on phones and tablets; create the restore key for signed-in users and delete it on sign-out. Block Store integrations made by 2026-09-30 count as compliant. | https://support.google.com/googleplay/android-developer/answer/17492799 | Verified 2026-11-09 |
| Meta | App Review per permission | Needed before anyone without a role on the app can use a permission. Unapproved permissions work only for users with a role, so each new permission needs its own approval (inferred). | https://developers.facebook.com/docs/app-review | Verified; per-permission re-review inferred |
| Meta | Submission requirements | "At least 1 successful API call" per permission, within 30 days before submitting. A screen recording per permission (English UI, captions where needed, 1080p or better, no audio). Its own description per permission, never copied between them. The app stays in Development mode until review is complete. | https://developers.facebook.com/docs/app-review/submission-guide | Verified |
| Meta | Annual Data Use Checkup / data access renewal | Each year, an app admin certifies the app's data use, for apps live with a use case or advanced access, to keep API access. It is also needed before switching to Live. Meta is merging it into one annual "data access renewal" per app. | https://developers.facebook.com/docs/development/maintaining-data-access/data-use-checkup , https://developers.facebook.com/blog/post/2024/10/25/metas-new-data-access-renewal-process/ | Verified |

## Ledger format

```json
{
  "schema": 1,
  "kind": "entity | app",
  "name": "medizen",
  "stores": { "apple": { "appId": "<ASC app id>" }, "google": { "package": "<package>" }, "meta": { "appId": null } },
  "items": [
    { "id": "apple.agreements", "status": "approved | pending | missing | n/a | unknown",
      "since": "2026-11-07", "renew": "2027-11-07", "reviewer": "vault file name, never the secret",
      "checked": "2026-11-07", "where": "how it was checked", "notes": "" }
  ]
}
```

`stores` appears only in app ledgers. `renew` is the date by which the item must be renewed or
re-checked (null when it does not expire). `reviewer` names the vault file
(`~/.claude/secrets/<name>.env`), never a password. Why: passwords stay out of every file but the
vault (`rules/acting-on-behalf.md`).

## What the check script reads

| Flag | Reads | Never |
|---|---|---|
| (none) | The ledgers. It flags each item that is not `approved` or `n/a`, has a `renew` date that has passed or is within 30 days, or was `checked` more than 90 days ago. | Any network call. |
| `--asc` | Per app with an Apple id: the last versions and their states, availability (territories), and whether the review details carry a demo account (yes or no, never the account). | A write. |
| `--play` | Per app with a package: its tracks and releases, through an edit that is deleted, never committed. | A commit. |

Agreements, App Privacy, Play declarations, Meta Business Verification, App Review and the Data
Use Checkup have no read API with the scopes we hold, so the script lists them from the ledger with
their dates. Check those in the consoles, then update the ledger.

The next action is step 1: open `~/Documents/store-approvals/entity.json` and confirm each
entity item's status in its console.
