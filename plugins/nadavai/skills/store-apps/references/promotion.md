# Store promotion: ratings, levers, measurement

Companion: `listing.md` (facts, keywords, copy, screenshots, video, upload). Sources read 2026-11-07.

Labels: **Verified** = an official page says it. **Vendor** = a third-party blog says it. **House rule** = our choice, not a store's. Tags such as (A10, G4)
point to Sources. A post, reply or ad in a business's name is store or public publishing: ask Nadav at that moment (`rules/working-style.md`,
`rules/acting-on-behalf.md`). **MONEY GATE** = charges or can bill: stop and ask, with what, how much, one-off or recurring, and where.

## Steps

1. **Ratings and reviews.**
   - Prompt after a finished task (a completed booking), never on first launch or in onboarding. Apple `SKStoreReviewController` shows at most 3 prompts per 365
     days and the system decides; leave a week or two between asks (A14). Play In-App Review has a hidden time-bound quota, no pre-question ("Do you like the
     app?") and no button that calls it; send a "rate us" button to the Play listing instead (G10). Why: a dead button after a quota hit is a broken screen.
     Both are native plugin code: a new store build (`rules/store-apps.md`).
   - Reply to reviews: Apple (Admin or Customer Support role; one reply per review; up to 24 h to show) and Play ("Reply to reviews" permission; one public
     reply, editable; the user gets a push and an email) (A14, G7). A reply speaks in the business's name: Nadav approves the wording until he sets a standing
     policy.
   - Do not reset Apple's summary rating without a reason. Why: few ratings deter installs (A14).
   Done when the prompt fires on its trigger in a store build and the reply path has a named owner.

2. **Promote.** One lever at a time, each logged in step 3's change log. Apple promotional text (170, no version) carries the event or feature of the week.

   | Lever | Cost | Use here | Limits and notes |
   |---|---|---|---|
   | Apple custom product pages | Free | One page per channel (venue QR, Instagram, WhatsApp) or keyword group | Up to 70; reviewed; own URL; can take search keywords from the latest approved version; data after 5 first-time downloads (A10) |
   | Apple product page optimization | Free | Test icon, screenshots or preview | The app must be live (Ready for Distribution); up to 3 treatments, up to 90 days; not available for custom product pages; a release mid-test can skew it (A11). A small app may never reach significance: read the estimate first |
   | Apple In-App Events | Free | A tournament night, a course start, a seasonal service | A real timed event, not a general promotion; up to 10 published; card media 16:9, details 9:16 (A12, A21) |
   | Apple featuring nomination | Free | A launch or a significant update | Lead time 3 weeks (ASC help) or 2 weeks (marketing page); up to 3 months ahead for wider consideration (A13) |
   | Apple Ads | **MONEY GATE** | Not now | Cost per tap, no minimum shown, a $100 credit for eligible new accounts; stop before any billing step. Israel availability Unverified (A23) |
   | Links, badges, QR | Free | An `/app?src=<channel>` redirect adding Apple `pt` and `ct` (A17) and Play `referrer=utm_source%3D<channel>`, 512 chars or less (G13) | Apple's Hebrew badge, never a redrawn one; one per layout, 40 px or more, clear space a quarter of its height (A15). Play badge 28 px or more, unaltered; a Hebrew version is Unverified (G12) |
   | Smart App Banner, deep links | Free | Website visitors into the app | `<meta name="apple-itunes-app">` with the app id (A16); Android App Links via `assetlinks.json` with both keys, AASA not built yet (`references/shell-checklist.md` row 6) |
   | Play store listing experiments | Free | Icon, feature graphic, screenshots or text in up to 5 languages | One default-graphics test or up to 5 localized at once; up to 2 variants; target metric install, open or pre-registration clicks; stops automatically after 6 months (G4) |
   | Play custom store listings | Free | A listing per URL, search keyword, country or inactive users | Up to 50; own URL `&listing=<param>`; no automatic translation (G5) |
   | Play promotional content | Free | Events and offers | Open to games and to apps meeting the "Premium growth tools" criteria: a small app may not qualify (G8) |
   | Google Ads, Meta ads, paid translation (from $0.07 a word, G6), print, paid ASO tool trials (AppTweak, Sensor Tower) | **MONEY GATE** | Not now | Ask before any signup, trial or order |
   | Instagram, WhatsApp Status or channel, venue QR poster | Free; print is a **MONEY GATE** | The listing's message, from the claims ledger | Nadav's wording first (`rules/whatsapp.md`); never auto-send |

   Done when each lever in use has an owner, a start date, a metric and an end date in the change log.

3. **Measure and read.** Change one thing at a time; log `date, store, field, before, after` in the change log next to the ledger. Why: two changes in one
   window cannot be told apart.
   - Apple App Analytics (A18, A24): impressions (viewed over 1 s), product page views, conversion rate (downloads over unique-device impressions), product page
     conversion rate (downloads over unique product page views); filter by source and campaign. A metric appears at 5 or more in the range, a campaign after 5
     first-time downloads: widen the dates first (A17). Usage data covers only users who share diagnostics (A24); Sales and Trends gives next-day units. A text
     or keyword change moves impressions first; a screenshot change moves conversion.
   - Google Play: Grow users > Store performance > Conversion analysis. From mid-2026 the main metrics are unique install, open and pre-registration clicks and
     the click-through rate, not completed installs; filter by source, listing, country, language, UTM; compare with the peer median and quartiles. Completed
     acquisitions: Grow users overview and Statistics (G9).
   - Minimum sample (house rule, not a store figure): draw no conclusion from an arm or window under 100 installs, or before the store itself reports a result
     (ASC's estimate and confidence, Play's calculator and recommendation). A small Israeli app can take months to get there: prefer one big change and a before
     and after read over an A/B test, with the same floor. Why: a few installs swing the rate more than any caption does.
   - Read after at least 7 days (14 for a small app), same weekdays, no release, event or ad in the window; keep a change only if its target metric moved and
     the other did not fall (a flat result keeps the old one). Repeat `listing.md` step 2's rank log monthly and re-verify the ledger when hours, prices or
     features change. Why: weekday swings and releases fake wins.
   Done when the first change after launch has a before and after row with its window dates and its sample size.

## Sources

Bases: ASC = https://developer.apple.com/help/app-store-connect , DEV = https://developer.apple.com , PLAY = https://support.google.com/googleplay/android-developer/answer .
- A10 ASC/create-custom-product-pages/configure-multiple-product-page-versions ; A11 ASC/create-product-page-optimization-tests/overview-of-product-page-optimization and /create-a-test,
  DEV/app-store/product-page-optimization/ ; A12 ASC/offer-in-app-events/overview-of-in-app-events, DEV/app-store/in-app-events/
- A13 DEV/app-store/getting-featured/ and ASC/manage-featuring-nominations/nominate-your-app-for-featuring ; A14 DEV/app-store/ratings-and-reviews/ ,
  DEV/design/human-interface-guidelines/ratings-and-reviews , ASC/monitor-ratings-and-reviews/respond-to-reviews
- A15 DEV/app-store/marketing/guidelines/ ; A16 DEV/documentation/webkit/promoting-apps-with-smart-app-banners ; A17 DEV/help/app-store-connect-analytics/acquisition/campaign-links/ ; A18
  DEV/help/app-store-connect/reference/app-metrics (metric wording from a search snippet, not fetched)
- A21 ASC/reference/app-information/creative-assets-specifications ; A23 https://ads.apple.com/app-store ; A24 ASC/measure-app-performance/overview-of-reporting-tools
- G4 PLAY/6227309 ; G5 PLAY/9867158 ; G6 PLAY/3125566 ; G7 PLAY/138230 ; G8 PLAY/12932229 ; G9 PLAY/9859173 ; G10 https://developer.android.com/guide/playcore/in-app-review
- G12 https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/ ; G13 https://developer.android.com/games/playgames/user-acquisition ,
  https://developers.google.com/analytics/devguides/collection/android/v4/campaigns
