# PostHog for an app (after the 2026-09 setup)

Applies when the SessionStart hook prints POSTHOG PENDING: a UI project whose package.json has no
PostHog SDK and whose CLAUDE.md does not mention PostHog. That reminder has one state; once the SDK is in
package.json, or CLAUDE.md says "PostHog: not used", the reminder stops.
Steps 1 to 3b are for that state. Step 4's checks and step 5 (notice and consent) hold for every app
that has PostHog, new or old.

1. Tell Nadav in one short Hebrew message that this app is not connected to PostHog and ask one
   question: connect it now, or not for this project. Do nothing else first.
2. "Not for this project": add `PostHog: not used (<reason>)` under the MANUAL section of CLAUDE.md
   and commit. Done.
3. "Connect": one PostHog project per app in the EU region, named after the repo, created through
   the PostHog MCP. Then the plugin's `instrument-product-analytics` and `instrument-error-tracking`
   skills with these defaults, which are not optional: keys only in `.env` (for Next:
   `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com`; the framework's
   equivalent otherwise), never committed; session replay, where it is on (never in the clinic
   app, step 5), with every input and all text masked (`maskAllInputs: true`,
   `maskTextSelector: "*"`) and routes that show personal data excluded; `identify` with the user
   id only, no name or email, and only for a person who accepted (step 5); capture the two or
   three events that mean success for this app (ask Nadav which); exception autocapture on; and
   `opt_out_capturing_by_default: true`, with the notice and consent screen of step 5 in the same
   deploy. Deploy.
3b. More than one entry point: the SDK must not enter the second bundle. A repo that builds a
   second app from the same source (a customer app, an admin app, a marketing shell) shares
   components with the first, and a shared component drags its imports across the entry boundary:
   posthog-js walked into TherapyFlow's customer bundle twice, 306KB raw, first through the root
   error boundary and then through a shop helper. Injecting the reporter as a prop fixes the one
   file you noticed and nothing else. What holds is a build-mode alias to a no-op twin with the
   same exports (`resolve.alias` on `@/lib/analytics`), plus an assertion in the bundle's own
   verify script that no chunk matches `/posthog/i`. Without that assertion the alias is one
   refactor from being silently undone.

4. Verify, from a real browser, in a fresh profile or after clearing the site's storage. Before
   the consent screen is answered, and again after refusing it, the page sends PostHog no event
   and no recording (the network panel shows no call to `/e/`, `/s/` or a path under `/i/`), and
   no `/flags/` request carries the signed-in user's id. Two unit tests pin it: the init options
   carry `opt_out_capturing_by_default: true`, and `identify` is not called before acceptance.
   Then accept the screen (until then zero events is the correct result, not a broken key):
   events from the deployed app show up in PostHog live events. Without both halves it is not
   done.
   **Never from an automated browser:** PostHog drops every event
   when `navigator.webdriver` is true ("Refusing to render web experiment since the viewer is a
   likely bot" in its own debug output), so a Playwright or headless run will show a loaded SDK, a
   `/flags/` response, and zero events, and look exactly like a broken key. Nadav's own browser via
   Claude in Chrome is the check. Then add `PostHog: project <name> (EU)` to CLAUDE.md and commit.

5. Notice and consent, in every app that has PostHog. What Nadav decided:
   - 2026-11-13, picked "הסכמה בכל אפליקציה": a notice and consent screen per Apple's and Google's
     requirements; each released piece names what is measured; recordings in the clinic app wait
     for a lawyer's check, asked separately because it costs money. The price he was shown: one
     more screen at entry, and a person who refuses gives no data.
   - 2026-11-14, typed, after he was shown that terms of service alone do not meet Apple's and
     Google's rules: "הכל כולל הכל ואם צריך לפתוח כמו שגוגל אומרים ללקוחות רשומים וחדשים שיאשרו פעם
     אחת וזהו הכי פשוט וכמו שכולם עושים". The agent's reading: the screen is as simple as the stores
     allow, shown once to existing and to new users; a person who accepts is measured with all
     that PostHog offers and the app can use (events, clicks, errors, recordings), inside the
     privacy defaults of step 3; and the terms of service and the privacy policy describe the same
     collection.
   - 2026-11-14, picked "בונים מסך עכשיו" for the two live apps found collecting without the
     screen, therapy-flow-v2 (MediZen's clinic app) and snooker-smart: a task of its own in each,
     soon; until the screen ships, measurement goes on as today; then every existing user sees,
     once, a short screen that asks whether they agree to usage measurement, and a person who
     refuses is not measured. Not picked: switching measurement off until the screen exists, and
     waiting for the next large version. That question described MediZen's collection only. Told
     afterwards that snooker-smart's code also records the screen (masked) and clicks, and that
     minors use it, he was offered to stop that recording until the screen ships and answered
     "הכל כולל הכל" (above): nothing is switched off there meanwhile.
   What stays off whatever the above says, until he lifts it: recording in the clinic app
   (therapy-flow-v2 and the MediZen build that replaces it) waits for the lawyer's check, and in
   therapy-flow-v2 it is also off by his decision of 2026-10-07 (INC-2026-008, in that repo's
   CLAUDE.md: leaks found even with full masking), which a lawyer's yes alone does not lift; so
   does anything else a project's own files keep off by name.

   The agent's detail, for whoever builds the screen:
   - It is a feature: it gets its full spec right before it is built (`working-style.md`,
     Requests), written against the app's code, PostHog's page
     (https://posthog.com/docs/privacy/data-collection), the live Apple and Google policy pages,
     and section 4 of `posthog-research-2026-11-13.md` beside this file. In that section the rows
     marked R are requirements of the spec; the rows marked I are proposed to Nadav in it, and
     nothing is refused on their strength; the legal rows need a professional, as the research
     says, and its professional checks (the lawyer's check, the data-protection-officer duty,
     transfer abroad) are asked of Nadav together, because they cost money.
   - What every such screen keeps, from the stores' own text (read 2026-11-14): consent is an
     affirmative tap inside the app, not a line in the terms (Google Play, User Data, prominent
     disclosure); a person can refuse, nothing is locked behind accepting and the screen does not
     push (Apple 5.1.1(ii) and (iv)); a way to withdraw, and to ask for deletion, stays reachable
     in the app (5.1.1(i) and (ii)); recording needs explicit consent and a visible indication
     (Apple 2.5.14); an app in the Kids category should carry no third-party analytics (Apple
     1.3), and one aimed only at children uses approved SDKs only (Google Families).
   - A person who refused, or has not answered yet, sends PostHog nothing about themselves: no
     event, no error report, no recording, no `identify` (while a person is opted out the SDK
     still sends `/flags/` requests with the id it has; where the app uses no feature flags, set
     `advanced_disable_flags: true`), and no event from the server, which therefore reads the
     choice from the user's record.
   - Mechanism (PostHog's page above; read the current page before coding):
     `opt_out_capturing_by_default: true`, `posthog.opt_in_capturing()` when the person accepts,
     `posthog.opt_out_capturing()` when they withdraw. Control capture through this API, not by
     loading the snippet late. Do not add `cookieless_mode` beside the opt-out default (the same
     page: the two together send events right away).
   - Applied by default, because they only keep data out (listed in the report so that Nadav can
     reverse them): no names, diagnoses or other personal details in event properties, in any
     app; checkout and payment pages excluded from recording, as step 3 says for routes that show
     personal data.
   - An app that already collects without the screen: the screen is not built inside a task that
     is not that screen (it is something new for the whole app, `working-style.md`, UI and
     product work), and capture is not switched off as a side effect of one; a task that asks for
     it, or a fix that keeps personal data out of PostHog, still changes it. Verify as in step 4.
     The brief for the two apps: `~/.omc/handoffs/posthog-consent-screen-2026-11-14.md`. An app
     found later in this state gets the same: the session that finds it names it once in its
     closing report, as a separate task waiting to be started, with a brief in `~/.omc/handoffs/`.
   - The store listing: the privacy label (Apple) and the Data safety form (Google) list what the
     SDK collects. On a live listing the agent prepares those answers; publishing them is a
     change to a live listing and waits for Nadav (`working-style.md`, Approval gates).
   - An app outside the stores is included, with the screen on the same model (the agent's
     reading of "every app"). Also the agent's reading: a marketing site or a demo that loads
     PostHog is not covered by his picks; it keeps what it has, and the session that first finds
     it names it once in its closing report.
   - Each released piece names its one to three usage events and the question each answers, or
     says that it measures nothing and why (in its spec).

Why: since 2026-09-16 PostHog is the single owner of usage data and errors, every production app
should report to it from the people who accept (step 5), and apps like TherapyFlow carry personal
data, so masking is part of setup.
