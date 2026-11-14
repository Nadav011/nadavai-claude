# PostHog for an app (after the 2026-09 setup)

Applies when the SessionStart hook prints POSTHOG PENDING: a UI project whose package.json has no
PostHog SDK and whose CLAUDE.md does not mention PostHog. That reminder has one state; once the SDK is in
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

4. Verify, from a real browser. Before the consent screen is accepted, the page sends PostHog no
   event and no recording (the network panel shows no call to `/e/`, `/i/v0/e/` or `/s/`), and a
   unit test of the init options asserts `opt_out_capturing_by_default: true`. Then accept the
   screen (until then zero events is the correct result, not a broken key): events from the
   deployed app show up in PostHog live events. Without both halves it is not done.
   **Never from an automated browser:** PostHog drops every event
   when `navigator.webdriver` is true ("Refusing to render web experiment since the viewer is a
   likely bot" in its own debug output), so a Playwright or headless run will show a loaded SDK, a
   `/flags/` response, and zero events, and look exactly like a broken key. Nadav's own browser via
   Claude in Chrome is the check. Then add `PostHog: project <name> (EU)` to CLAUDE.md and commit.

5. Notice and consent, in every app that has PostHog (Nadav, 2026-11-13, picked "הסכמה בכל
   אפליקציה": a notice and consent screen per Apple's and Google's requirements, each released
   piece names what is measured, recordings in the clinic app wait for a lawyer's check). The
   agent's reading: an app outside the stores is included, with the screen on the same model. A
   marketing site or a demo that loads PostHog is not covered by his pick: it keeps what it has,
   and the report names it.
   - A new app: the screen ships in the deploy that first captures (step 3). It is a screen people
     see, so it gets its spec like any feature (`working-style.md`, Requests).
   - An app that already collects without this screen. On 2026-11-14 two were found:
     therapy-flow-v2 (MediZen's live clinic app) and snooker-smart. Nadav, 2026-11-14, picked
     "בונים מסך עכשיו": the screen is built now, as a task of its own in each; until it ships,
     capture stays as it is today; after it ships every existing user sees the screen once, and a
     person who refuses is not measured. Not picked: switching capture off until the screen
     exists, and waiting for the app's next large version. The agent's detail: the screen is never
     built, and capture is never switched off, inside a task that is not that screen (it is
     something new for the whole app, `working-style.md`, UI and product work), and an app found
     later in this state gets the same: its session names it in the report and adds it here.
   - Mechanism (PostHog's docs, https://posthog.com/docs/privacy/data-collection, read 2026-11-13
     and again 2026-11-14; read the current page before coding):
     `opt_out_capturing_by_default: true`, `posthog.opt_in_capturing()` when the person accepts,
     `posthog.opt_out_capturing()` when they withdraw. Control capture through this API, not by
     loading the snippet late. Do not add `cookieless_mode` beside the opt-out default (the same
     page: the two together send events right away). An event the server sends about a person
     follows that person's choice: only for someone who accepted, or not at all. A switch to
     withdraw stays reachable in the app.
   - What the stores require. Apple 5.1.1: the privacy policy says what data is collected and what
     it is used for, that third parties such as the analytics tool protect it equally, the
     retention and how to withdraw; usage data needs consent with an easy way back. Apple 2.5.14:
     recording what a person does needs explicit consent and a visible indication. The privacy
     label lists the SDK's data. An app in the Kids category should carry no third-party
     analytics (Apple 1.3 allows it only in narrow cases). Google Play: a privacy policy in the
     listing and in the app, the Data safety form includes the SDK's data, affirmative consent
     comes before personal or sensitive data, and an app aimed only at children uses approved
     SDKs only. On a live listing the agent prepares the privacy label and the Data safety
     answers; publishing them is a change to a live listing and waits for Nadav
     (`working-style.md`, Approval gates).
   - Decided for the clinic app (therapy-flow-v2 and the MediZen build that replaces it): no
     recording at all until the lawyer's check, which costs money and is asked of Nadav
     separately. In therapy-flow-v2 recording is also off by his decision of 2026-10-07
     (INC-2026-008, in that repo's CLAUDE.md: leaks found even with full masking), and a lawyer's
     yes alone does not lift that.
   - Applied by default, because they only keep data out (the agent's defaults, listed in the
     report so that Nadav can reverse them): no names, diagnoses or other personal details in
     event properties, in any app; checkout and payment pages excluded from recording, as the
     defaults of step 3 already say for routes that show personal data.
   - Required by a source the research cites (its rows marked R; the legal ones still need a
     professional, as the research says), so they go into the app's spec: in the clinic app, a
     privacy notice that names PostHog, the purposes, the recipients and the retention; in a
     staff app, a written notice to the employees; in an online store that targets EU or UK
     visitors, a banner or opt-in for them.
   - Recommended, not decided (the research's inferences; each is proposed to Nadav in the app's
     spec, and nothing is refused on their strength): in a staff app, usage read in aggregate and
     no screen or keystroke-style recording.
   - Each released piece names its one to three usage events and the question each answers, or
     says that it measures nothing and why (in its spec).
   The sources, row by row, and which points need a professional: `posthog-research-2026-11-13.md`
   beside this file. The legal points there are a recommendation, not Nadav's decision.

Why: since 2026-09-16 PostHog is the single owner of usage data and errors, every production app
should report to it from the people who accept (step 5), and apps like TherapyFlow carry personal
data, so masking is part of setup.
