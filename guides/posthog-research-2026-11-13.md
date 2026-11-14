# PostHog: consent, store rules, and how much weight usage data deserves

Source: a research agent that read the official pages and PDFs in full on 2026-11-13 (webget or pdftotext, no
summarizer) and PostHog's SDK source. Saved by the planning session from the agent's reply. Tags: [V-raw] official
text read raw; [S] search snippet only. Legal points are a recommendation, not a decision; where a row says "needs
a professional" the reason is given.

## 1. Legal and store requirements

| Point | Requirement | Source | Verdict |
|---|---|---|---|
| Israel, notice and consent | Since Amendment 13 (in force 2025-08-14) "personal information" includes an online identifier. Section 11: a request for personal information carries a notice (purpose, whether giving it is voluntary, recipients, the controller's identity and contact, access and correction rights). Consent must be informed, explicit or implied; silence is not consent. The Authority prefers explicit opt-in for sensitive data. Its opinion says it does not decide when consent is required. | gov.il/he/pages/consent-2026 (2026-02-25); gov.il/he/pages/tikun13_qa (2025-08-14); the law's text on gov.il [V-raw] | Needs a professional: no official text applies section 11 or consent to passive analytics or session replay. |
| Israel, cookies and analytics | No Authority guidance on analytics or session replay was found. The only text on non-essential cookies calls an active opt-in "advisable", for payment apps only (2021). | gov.il PRIVACY_APP_PAYMENT.pdf [V-raw] | Nothing reliable beyond this. |
| Israel, health data (clinic app) | Health information is of "special sensitivity". A data protection officer is required for systematic behaviour tracking or sensitive data "at significant scale" (section 17B1). | the law's text; gov.il PRIVACY_HEALTH_APP.pdf (2021) [V-raw] | Needs a professional: "significant scale" is undefined for a small clinic. |
| Israel, staff monitoring (shifts app) | Allowed when proportionate and for a legitimate purpose. Employees are told in writing; screen capture and keyboard or mouse tracking need full detail. Employee consent is "suspect" because of the power gap. | gov.il remote-work-privacy-aspects.pdf (2023-10-17) [V-raw] | Needs a professional: the document is about remote work; applying it to an in-app tool is an inference. |
| Israel, minors | No official age-of-consent rule found. | [S] only | Needs a professional. |
| EU and UK visitors | GDPR applies to a non-EU business that offers services to people in the EU or monitors their behaviour there. ePrivacy 5(3): consent before storing or reading information on a device unless strictly necessary. CNIL (2026-10-08): session replay needs prior consent and masking by default. | edpb.europa.eu guidelines 3/2018 and 2/2023; cnil.fr rejeu_session_recommandation.pdf; ico.org.uk [V-raw] | Needs a professional, only if EU or UK visitors are in scope. |
| Apple | 5.1.1(i): the privacy policy names analytics tools, retention and how to withdraw. 5.1.1(ii): "Apps that collect user or usage data must secure user consent ... even if ... anonymous", with easy withdrawal. 2.5.14: explicit consent and a clear visual indication when recording user activity, including screen recordings. First-party analytics is not "tracking" for App Tracking Transparency unless linked to third-party data for ads. The privacy label declares the SDK's data. Kids Category apps should not include third-party analytics. | developer.apple.com/app-store/review/guidelines/ (updated 2026-10-16) [V-raw] | Answered, with its source. |
| Google Play | Privacy policy in the listing and in the app. The Data safety form includes SDK data. "Obtain clear, affirmative user consent before collecting any personal or sensitive data." Prominent in-app disclosure when collection may exceed what users expect. A listed violation: an app that records the screen and does not treat that as personal or sensitive data. | support.google.com/googleplay/android-developer/answer/10144311 and /10787469 [V-raw] | Answered, with its source. |

## 2. What PostHog offers (its docs, read 2026-11-13)

- Consent: `opt_out_capturing_by_default` with `opt_in_capturing()` and `opt_out_capturing()`. `cookieless_mode: "on_reject"` sends no replay until the visitor accepts. Control capture with the API, not by gating the snippet. EU Cloud (Frankfurt), IP capture off by default, a data processing agreement is available. PostHog's GDPR page says in-product analytics should be consented when users sign up.
- Session replay: inputs are masked by default, text is not. `maskAllInputs: true` with `maskTextSelector: "*"` is maximum privacy. `ph-no-capture` blocks an element. Network bodies are off by default. Masking runs on the device. Mobile replay is documented for Android, iOS, React Native and Flutter; replay inside a Capacitor webview is unverified.
- Health data: PostHog documents only US HIPAA (a BAA on higher plans). Nothing for Israel.
- Tenants: `posthog.group('company', id)`. Group analytics is a paid add-on (a money gate). `identify` once per session with an opaque id; `reset()` on logout.
- What to track: start with growth events (sign-up, purchase); names as `category:object_action`; prefer backend tracking; one North Star metric, then activation checked against retention. For early products: replays first, one dashboard, and "too early" for funnel work.
- Automation: events are dropped when `navigator.webdriver` is true (confirmed in the SDK source) unless `opt_out_useragent_filter: true` is set, which belongs only in test builds.

## 3. How much weight usage data deserves

- Torres: analytics show what customers do, not why; use them to choose whom to interview. producttalk.org
- Cagan: live-data tests show whether something works; face-to-face testing explains why. svpg.com/the-two-core-competencies
- NN/g: numbers answer "how many", qualitative work answers "why"; five users suit qualitative work, and metrics from small samples are imprecise. nngroup.com/articles/quant-vs-qual/
- PostHog: experiments need on the order of 1,000 users per variant; no source gives a universal minimum.
- Conclusion: with dozens of users, usage data works as observation (replays plus conversations), not as statistics.

## 4. Before PostHog collects anything (R = required by a cited source, P = PostHog recommends, I = inference)

- Clinic app: a privacy notice naming PostHog, purposes, recipients and retention (R). Explicit opt-in before capture (I). No replay on patient screens (I); elsewhere full masking (P). Opaque user id, the clinic as the group, no names or diagnoses in events (P, I). A professional check of the officer duty and of transfer abroad.
- Community app in the stores: privacy-policy link in the app and the listing (R). Apple: consent before usage data with a withdraw switch; for replay, consent plus a visible recording indicator; the privacy label updated (R). Google: the Data safety form and an affirmative in-app consent (R). If the app is aimed at children: no third-party analytics on Apple, approved SDKs only on Google (R).
- Staff shifts app: a written notice to employees (R). No screen or keystroke-style recording (I). Aggregate usage only (I).
- Online store: a banner or opt-in for EU or UK visitors if targeted (R); in Israel only "advisable". Never record checkout or payment pages (P).

## 5. State in the live clinic app today (from the card `cards/therapyflow-live.md`)

PostHog is configured with autocapture and session replay off. Three custom events exist (`appointment_completed`,
`invoice_issued`, `salon_order_paid`). There is no opt-out or consent code. It was read three times in a month, to
verify a fix or debug one client's complaint, and never to decide what to build. It is not installed in the SHIFTS
and Camstore repos (checked by the planning session with a search of package.json files).
