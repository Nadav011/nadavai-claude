# Store listing: facts, keywords, copy, screenshots, video, upload

Companion: `promotion.md`. Sources read 2026-11-07. Labels: **Verified** = an official page says it; **Measured** =
our own call on 7.11; **Vendor** = a third-party blog says it; **House rule** = our choice, not a store's. Tags such as (A1, G3) point to Sources. A change to
a live listing (its text, graphics or video), and making the first listing public, is store publishing: ask Nadav at that moment and show him the full listing first (`rules/working-style.md`, Approval gates). Text and graphics for a listing that is not public yet are uploaded without asking and named in the report. **MONEY GATE** = charges or can bill: stop and ask
(`rules/acting-on-behalf.md`).

## Limits and sizes

| Field | Apple (IL storefront) | Google Play | Change needs |
|---|---|---|---|
| Name / title | 30 (A5) | 30. No emoji, no ALL CAPS unless brand; no ranking, price or Play-program wording in title, icon or developer name (G2, G3) | Apple: new version (A3). Play: a listing save |
| Subtitle / short description | Subtitle 30. No prices, other apps or unverifiable claims (A19 2.3.7) | 80 (G2) | Apple: new version (A3, A5) |
| Keywords | 100 bytes (A2; A5 says "characters"). Comma-separated, no space after a comma, spaces inside a phrase are fine; each over 2 chars. No word already in the name, subtitle or category; plurals are duplicates; no "app", filler words, competitor or trademark names (A2, A5, A7). Primary and secondary category are both indexed (A7) | No field: title, short and full description carry the terms in natural Hebrew, no stuffing (G2, G3), in the `iw-IL` listing (G6) | Apple: new version (ASC practice; A3 omits it) |
| Description | 4000, plain text. Not among the search factors Apple lists (A7) | 4000. No stuffing, word blocks, unattributed testimonials or app comparisons; emoji banned in title, icon and developer name; special characters or caps used for ranking banned (G3) | Apple: new version (A5) |

| Asset | Apple | Google Play | Change needs |
|---|---|---|---|
| Screenshots | 1 to 10 per size, jpeg or png, no alpha. Apple names the 6.1" Dynamic Island display as required and fills it by scaling larger sets, so one 6.9" set (1320x2868, 1290x2796, 1260x2736) should be enough: test first (step 5). iPad 13" (2064x2752, 2048x2732) if the app runs on iPad (A1) | At least 2 across device types to publish, up to 8 per type; JPEG or 24-bit PNG, no alpha; each side 320 to 3840 px, long side at most 2x the short; advised 4 or more, 9:16, 1080 px or larger (G1) | Apple default page: an editable version. Play: a listing save |
| Video | Up to 3 per size and language, 15 to 30 s, H.264 .mov/.m4v/.mp4, 30 fps or less, 500 MB or less, 886x1920 portrait for 6.9", 6.5", 6.1", stereo AAC; autoplays muted, shown before screenshots (A4, A6) | YouTube URL, public or unlisted, embeddable, no ads; the first 30 s autoplay (G1) | Apple: an editable version |
| Icon, feature graphic | Icon ships in the build | Icon 512x512 32-bit PNG; feature graphic 1024x500 JPEG or 24-bit PNG, no alpha (G1) | Apple icon: new version |

## Steps

1. **Build the fact sheet first.** One private ledger per app, `${STORE_LISTING_DIR:-~/Documents/store-listing}/<app>/claims.json`: `id`, exact Hebrew wording,
   `kind` (hours, price, amenity, payment, feature, place), `source` (live screen and date, or the owner: who, when, channel), `verified`.
   - Every hour, price, amenity ("private room"), payment method, feature and place in a field, caption or video is a verified entry. Why: on 7.11 Nadav called
     one live listing's top text "not correct"; a misdescribing listing breaks Apple 2.3.1 and the Play metadata policy (A19, G3).
   - No superlative, ranking, award, "new", price, offer or unattributed testimonial; no other platform's name in Apple metadata (A19 2.3.7, 2.3.10). Play bans
     ranking and price wording in title, icon and developer name (G3); for graphics it is our house rule. Why: a store edit costs a review: hours and prices
     stay in the app.
   Done when every sentence and caption maps to a verified claim and Nadav or the owner confirmed the ledger in writing.

2. **Research keywords, Hebrew first.**
   - Seed 20 to 40 terms (what a customer types for the job, competitors' names, search hints on a phone) and rank-check them with Apple's Search API, a proxy
     for the on-device order: `https://itunes.apple.com/search?term=<enc>&country=il&media=software&entity=software&limit=200` (`curl --compressed`, about 20
     calls a minute). Append `date,term,resultCount,ourPosition,top3,primaryGenreName` to `rank-log.csv` next to the ledger (A22). Free sources only: a paid ASO
     tool trial (AppTweak, Sensor Tower) is a **MONEY GATE**.
   - Proxy findings, `country=il`, 7.11 (M1): `מספרה`, `המספרה`, `מספרות` share 0 of the top 10; `גרינרום` shares 9 of 10 with `greenroom`, `green room` 3,
     `גרין רום` 0. Confirm on an iPhone any rule that spends bytes before spending them. Why: Apple calls plurals duplicates (A7); the app may fold forms.
   - Hebrew letters cost 2 bytes (about 45 per 100): spend on the brand and the job's main term, then terms you can beat in the top 10. Nothing already in the
     name, subtitle or either category (both indexed, A7); a plural or ה- form only after a phone test; no U+200E or U+200F (3 bytes).
   - Second set, `en-GB`: Israel's default language, Hebrew additional (A8), so its name, subtitle and description are real English copy and its keywords
     relevant only (A19 2.3.7 bans irrelevant ones: no invented token). A new language starts with the primary language's screenshots (A9), so decide whether
     en-GB gets its own strip. Choose the primary language on purpose: changing it later needs an approved localization and screenshots (A9). Test on an iPhone
     set to Hebrew with an IL Apple account: search one English term only en-GB carries, 72 h after release (house guidance). Why: IL indexing of en-GB is
     vendor-tested elsewhere only (T4).
   Done when each candidate has a `rank-log.csv` row, each byte-spending rule passed a phone test, and both Apple sets read back at 100 bytes or less.

3. **Tear down the competitors.** For the top 5 apps on the main terms (`rank-log.csv`), record in `teardown.md` next to the ledger: name and subtitle,
   category, rating count (`userRatingCount`), a preview video or not, and the job and caption of their first 3 frames (read on a phone; Play too). Why: the
   listing is chosen next to these five, so the first 3 frames should say what they do not.
   Done when the table exists and the plan says, per first-3 frame, where we differ.

4. **Write the copy** from the ledger, in Hebrew, in the voice of `PRODUCT.md` and `DESIGN.md`.
   - Name: the brand, plus one generic word only if Nadav approves; subtitle: what it is and for whom, no "world's best"; category: what customers browse (A5,
     A7). Description: one verified value sentence first (it shows before "more"), 3 to 6 plain-text bullets, no prices, an accolade last (A5). Why: prices vary
     by region.
   - Promo text (170, no version needed, not a search input, A2, A5): the one reason to open the app this week. What's New: concrete changes, most important
     first (A19 2.3.12). Read every string on a phone. Why: a Latin brand or number at the edge of a Hebrew line can flip its punctuation.
   Done when counts pass the tables (`Buffer.byteLength` for keywords) and the step 8 lint is clean.

5. **Screenshots: plan, capture, compose.**
   - Device family: read `TARGETED_DEVICE_FAMILY` (`1` iPhone only; `1,2` universal, the Capacitor default; MediZen and salon are `1`, Green Room not checked).
     Universal needs the iPad 13" set (A1). iPhone: upload one 6.9" set to a draft version and read back that ASC accepts it; `references/store-apis.md` line 57
     calls 6.9" required, A1 names the 6.1" display and scales it. Why: a missing set blocks submission.
   - Frame 1: the outcome in 5 words or fewer, over the main screen. Frame 2: the core flow or what sets the app apart (from the teardown). Frame 3: ease or
     trust. Then one feature each, last contact or privacy. Test frames 1 to 3 as one strip at search-result size (house estimate 120 px per frame, confirm on a
     phone), caption text at least 5% of frame height (house rule). Why: Apple shows the first one to three images in search without a preview (A5, A7).
   - Show the app in use with believable data, never a login, splash or title art (A19 2.3.3). Captions: Hebrew, 3 to 6 words, verb plus benefit, only what the
     screen shows, contrast 4.5:1, aligned to the start (right) edge; no price, rating badge, "new" or date. Full-bleed UI, no bezel to start. Whether a Hebrew
     storefront shows frame 1 at the right is Vendor only (T3): look at a Hebrew phone once.
   - Capture from the isolated demo tenant, never a super user or real customers (A19 2.3.9; pattern: therapy-flow-v2
     `scripts/appstore/seed-screenshot-fixtures.mjs`): WebKit (Playwright Docker image) for iPhone, Chromium for Android, `locale: 'he-IL'`, viewport times
     scale = target pixels (1320x2868 = 440x956 @3). Why: the first MediZen run showed empty states and a patient named after a QA run id.
   - Compose with one committed generator in the app repo (`store/`): HTML/CSS template, `frames.json`, Playwright render; `dir="rtl"`, logical properties,
     arrows and chevrons mirrored, `<bdi>` around Latin and digits, brand fonts from `DESIGN.md` (a paid font or stock licence is a **MONEY GATE**), alpha
     flattened (A1, G1); also Play's 1024x500 feature graphic. Why: the Green Room's framed set has no generator, so it cannot be redone.
   Done when every raw file was looked at, none shows real data or test branding, each has a manifest (route, account, sha, date), and the console is clean.

6. **Video (optional).**
   - Apple preview: footage captured on the device, from a phone or the Simulator, not Playwright (A6, A19 2.3.4); strong first seconds (it autoplays muted),
     Hebrew overlays, no prices, a login or paid feature disclosed (A4, A6). Music, voiceover and stock footage are a **MONEY GATE** and need rights (A6).
   - The Play video is a YouTube upload in the business's name: ask Nadav first. Why: it is a public post in his name.
   Done when the file fits the video row, was watched muted end to end, and Nadav approved the upload.

7. **Upload.** To a live listing, or to make the first one public, it is store publishing: show Nadav the contact sheet and the copy, then ask. To a listing that is not public yet, upload and name it in the report.
   - Apple, API first (`scripts/asc.mjs`): text as in `references/store-apis.md` plus `/v1/appInfoLocalizations`; `en-GB` is a new localization. Screenshots and
     previews use the App Asset Library, since Apple deprecated `appScreenshotSets` and `appScreenshots` (A20): `appAssetLibraryImages` (reserve, `PUT`,
     `uploaded: true`, wait for `PREPARE_FOR_SUBMISSION`), read `specId`, `appAssetLibraryPlacements`, then a placement ordering request; videos use
     `appAssetLibraryVideos`; take placement groups from `appAssetLibraryRefData`, never hard-code them. Why: older docs show the deprecated flow, and a wrong
     specification limits which placement groups accept a file (A20).
   - Google Play: the Console form through `agent-browser` with the kept profile (`references/store-apis.md`). The "Manage store presence" grant was refused and
     listing commits returned 403: do not ask again, and leave `edits.listings` and `edits.images` (G11) unused. Why: it is decided; the Console does the job.
   Done when each Apple asset's `specId` matches its intended size, every field read back (API for Apple, Console for Play) equals its source, and each store's
   signed-out public page at 390 px shows the new set in order.

8. **Gate** (runs before step 7's first call and again after it).
   - Lint every string, caption and graphic text for: הכי, הטוב ביותר, מספר 1, חדש, חינם, מבצע, ₪, אנדרואיד, גוגל, אפל, אייפון, and in Latin Android, Google,
     Apple, iPhone, "#1", "best", "free", "new". A hit blocks until a claim id justifies it.
   - Asset script: exact pixel size, no alpha, file type, Play ratio at most 2:1, 1024x500 feature graphic, count per set; then a contact sheet and the step 5
     strip. A second model reviews copy, ledger and keyword plan, arguing against them first (`rules/working-style.md`); Nadav approves the final text. Why: it
     runs on every redo.
   Done when the lint and the asset script are clean, the review is answered, and Nadav approved.

## Sources and tools

Bases: ASC = https://developer.apple.com/help/app-store-connect , DEV = https://developer.apple.com , PLAY = https://support.google.com/googleplay/android-developer/answer .
- Tools, none installed (`skillspector scan <dir> --no-llm` before adopting): worth vendoring `rorkai/App-Store-Connect-CLI` (`asc`, MIT, v6.5.3; `metadata keywords audit`, `asset-library`
  upload; pin it, scan its 25 bundled skills), https://github.com/rorkai/App-Store-Connect-CLI . Not worth it: fastlane (T1, no gain; Play needs the same grant), `skills-il/.../israeli-aso`
  (T3, unsourced).
- A1-A4, A8 = ASC/reference/app-information/ screenshot-specifications, platform-version-information, required-localizable-and-editable-properties, app-preview-specifications,
  app-store-localizations
- A5 DEV/app-store/product-page/ ; A6 DEV/app-store/app-previews/ ; A7 DEV/app-store/search/ ; A9 ASC/manage-app-information/localize-app-information ; A19 DEV/app-store/review/guidelines/
  (2.3)
- A20 DEV/documentation/appstoreconnectapi/ app-asset-library (and its articles: understanding, uploading-and-managing-image-assets, placing-assets, migrating) ; A22
  https://performance-partners.apple.com/search-api
- G1 PLAY/9866151 ; G2 PLAY/9859152 ; G3 PLAY/9898842 ; G6 PLAY/3125566 ; G11 https://developers.google.com/android-publisher/api-ref/rest/v3/edits.images/upload
- M1 our Apple Search API calls, `country=il`, 2026-11-07 (outputs not kept; re-run before relying). T1 https://github.com/fastlane/fastlane ; T3
  https://github.com/skills-il/marketing-growth/tree/master/israeli-aso ; T4 https://asoitis.com/blog/ios-app-localization (Vendor: en-GB tests)
