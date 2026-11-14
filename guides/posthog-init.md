# PostHog for an app (after the 2026-09 setup)

Applies when the SessionStart hook prints POSTHOG PENDING: a UI project whose package.json has no
PostHog SDK and whose CLAUDE.md does not mention PostHog. That is the only state; once the SDK is in
package.json, or CLAUDE.md says "PostHog: not used", the reminder stops.
Steps 1 to 4 are for that state. Step 5 (notice and consent) holds for every app that has PostHog,
new or old.

1. Tell Nadav in one short Hebrew message that this app is not connected to PostHog and ask one
   question: connect it now, or not for this project. Do nothing else first.
2. "Not for this project": add `PostHog: not used (<reason>)` under the MANUAL section of CLAUDE.md
   and commit. Done.
3. "Connect": one PostHog project per app in the EU region, named after the repo, created through
   the PostHog MCP. Then the plugin's `instrument-product-analytics` and `instrument-error-tracking`
   skills with these defaults, which are not optional: keys only in `.env` (for Next:
   `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com`; the framework's
   equivalent otherwise), never committed; session replay with every input and all text masked
   (`maskAllInputs: true`, `maskTextSelector: "*"`) and routes that show personal data excluded;
   `identify` after login with the user id only, no name or email; capture the two or three events
   that mean success for this app (ask Nadav which); exception autocapture on; and
   `opt_out_capturing_by_default: true`, with the notice and consent screen of step 5 in the same
   deploy, so that nothing is collected from a person who has not accepted. Deploy.
3b. More than one entry point: the SDK must not enter the second bundle. A repo that builds a
   second app from the same source (a customer app, an admin app, a marketing shell) shares
   components with the first, and a shared component drags its imports across the entry boundary:
   posthog-js walked into TherapyFlow's customer bundle twice, 306KB raw, first through the root
   error boundary and then through a shop helper. Injecting the reporter as a prop fixes the one
   file you noticed and nothing else. What holds is a build-mode alias to a no-op twin with the
   same exports (`resolve.alias` on `@/lib/analytics`), plus an assertion in the bundle's own
   verify script that no chunk matches `/posthog/i`. Without that assertion the alias is one
   refactor from being silently undone.

4. Verify: accept the consent screen in the real browser first (until then zero events is the
   correct result, not a broken key); then events from the deployed app show up in PostHog live
   events. Without that it is not done. **Verify from a real browser, never from an automated one:** PostHog drops every event
   when `navigator.webdriver` is true ("Refusing to render web experiment since the viewer is a
   likely bot" in its own debug output), so a Playwright or headless run will show a loaded SDK, a
   `/flags/` response, and zero events, and look exactly like a broken key. Nadav's own browser via
   Claude in Chrome is the check. Then add `PostHog: project <name> (EU)` to CLAUDE.md and commit.

5. Notice and consent, in every app that has PostHog, store or web (Nadav, 2026-11-13, picked
   "הסכמה בכל אפליקציה": a notice and consent screen per Apple's and Google's requirements, each
   released piece names what is measured, recordings in the clinic app wait for a lawyer's check).
   - A new app: the screen ships in the deploy that first captures (step 3). It is a screen people
     see, so it gets its spec like any feature (`working-style.md`, Requests).
   - An app that already collects without this screen (therapy-flow-v2, MediZen's live clinic
     app, was one on 2026-11-13): when the screen is built, and what is collected until then, is
     not decided. It is not a bug found on the way: it is not built, and capture is not switched
     off, inside another task. The app's session puts the question to Nadav (Requests).
   - Mechanism (PostHog's docs, read 2026-11-13 and again 2026-11-14; read the current page before
     coding): `opt_out_capturing_by_default: true`, `posthog.opt_in_capturing()` when the person
     accepts, `posthog.opt_out_capturing()` when they withdraw. Control capture through this API,
     not by loading the snippet late. A switch to withdraw stays reachable in the app.
   - What the stores require. Apple 5.1.1: the privacy policy names the analytics tool, the
     retention and how to withdraw, and usage data needs consent with an easy way back; 2.5.14:
     recording what a person does needs explicit consent and a visible indication; the privacy
     label lists the SDK's data; an app in the Kids category carries no third-party analytics.
     Google Play: a privacy policy in the listing and in the app, the Data safety form includes
     the SDK's data, affirmative consent comes before personal or sensitive data, and an app
     aimed at children uses approved SDKs only. Changing the privacy label or the Data safety
     form of a live listing is a change to a live listing: it waits for Nadav (`working-style.md`,
     Approval gates).
   - Decided for the clinic app: no recording at all until the lawyer's check, which costs money
     and is asked of Nadav separately.
   - Recommended, not decided (the research's inferences; each is proposed to Nadav in the app's
     spec, not applied as a rule): in the clinic app, a notice that names PostHog, the purposes,
     the recipients and the retention, and no names or diagnoses in events; in a staff app,
     employees told in writing, usage read in aggregate, no screen or keystroke-style recording;
     in an online store, checkout and payment pages never recorded, and a separate banner for EU
     or UK visitors when the store targets them.
   - Each released piece names its one to three usage events and the question each answers, or
     says that it measures nothing and why (in its spec).
   The sources, row by row, and which points need a professional: `posthog-research-2026-11-13.md`
   beside this file. The legal points there are a recommendation, not Nadav's decision.

Why: since 2026-09-16 PostHog is the single owner of usage data and errors, every production app
should report to it, and apps like TherapyFlow carry personal data, so masking is part of setup.
