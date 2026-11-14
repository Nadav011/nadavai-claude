# PostHog for an app (after the 2026-09 setup)

Applies when the SessionStart hook prints POSTHOG PENDING: a UI project whose package.json has no
PostHog SDK and whose CLAUDE.md does not mention PostHog. That reminder has one state; once the SDK is in
package.json, or CLAUDE.md says "PostHog: not used", the reminder stops.
Steps 1 to 3b are for that state. Step 4 runs when PostHog is connected and when the consent screen
is built or changed; any other PostHog change checks what it touches from a real browser. Step 5
(notice and consent) holds for every app that has PostHog, new or old; an app that still collects
without the screen runs step 4's consent checks with its screen task (step 5).

1. Tell Nadav in one short Hebrew message that this app is not connected to PostHog and ask one
   question: connect it now, or not for this project. Do nothing else first.
2. "Not for this project": add `PostHog: not used (<reason>)` under the MANUAL section of CLAUDE.md
   and commit. Done.
3. "Connect": one PostHog project per app in the EU region, named after the repo, created through
   the PostHog MCP. Then the plugin's `instrument-product-analytics` and `instrument-error-tracking`
   skills with these defaults, which are not optional: keys only in `.env` (for Next:
   `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com`; the framework's
   equivalent otherwise), never committed; session replay, where it is on (off in the clinic
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

4. Verify, from a real browser, twice: in a fresh profile, and, in an app that had PostHog before
   the screen, in a profile that was signed in on the version before it (a returning user).
   Fresh: a new profile, or the app's origin with its storage and cookies cleared. Returning:
   signed in on the live version before the deploy. Second browser (below): another real browser,
   such as a second Chrome profile, his phone or the Android emulator's Chrome, where
   `navigator.webdriver` is false.
   - Before the consent screen is answered, and again after refusing it: the page sends PostHog
     no event and no recording (the network panel shows no call to `/e/`, `/s/` or a path under
     `/i/`), and no `/flags/` request at all where the app reads no flags (where it reads flags,
     none that carries the user's id or a URL with personal data).
   - After accepting (until then zero events is the correct result, not a broken key): events
     from the deployed app show up in PostHog live events and, where recording is on, that
     session's recording appears in PostHog.
   - After accepting, sign out and in again, and sign in on a second browser: once signed in,
     the choice from the record holds, events keep arriving, and the screen does not show again.
   - Unit tests pin the init options (`opt_out_capturing_by_default: true`, the flags switch of
     step 5, and what `init` sets off there), that `identify` is not called before acceptance,
     and that the stored choice is applied again after `reset()`.
   Without all of these it is not done.
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
   - 2026-11-14, picked "בונים מסך עכשיו" for the two live apps found collecting without the
     screen, therapy-flow-v2 (MediZen's clinic app) and snooker-smart: a task of its own in each,
     soon; until the screen ships, measurement goes on as today; then every existing user sees,
     once, a short screen that asks whether they agree to usage measurement, and a person who
     refuses is not measured. Not picked: switching measurement off until the screen exists, and
     waiting for the next large version.
   - 2026-11-14, typed, when offered to stop snooker-smart's recording until the screen ships:
     "למה אבל אני רוצה כמה שיותצר מידע מהאליקציה ואת כל מה שאנחנו צריכים מקצה לקצה בכל האפליקציות שלי
     כל מה שצריך שיכנס לתנאי שירות ואז ניהיה מוגנים בהכל".
   - 2026-11-14, typed, after he was shown that terms of service alone do not meet Apple's and
     Google's rules: "הכל כולל הכל ואם צריך לפתוח כמו שגוגל אומרים ללקוחות רשומים וחדשים שיאשרו פעם
     אחת וזהו הכי פשוט וכמו שכולם עושים".
   The agent's reading of his two typed sentences: the screen is as simple as the stores allow
   and is shown once to existing and to new users; a person who accepts is measured with
   everything the app needs end to end (events, clicks, errors, and recordings where they are
   allowed), inside the privacy defaults of step 3 and without switching back on what an app
   keeps off to protect personal data (its files or its code say why); replay's console logs and
   network bodies and headers stay off; the terms of service and the privacy policy describe the
   same collection; nothing is switched off while the screen is being built. Anything PostHog
   shows people (surveys, product tours) is a product decision, not part of this.
   What stays off whatever the above says, until he lifts it: recording in the clinic app
   (therapy-flow-v2 and the MediZen build that replaces it) waits for the lawyer's check, and in
   therapy-flow-v2 it is also off by his decision of 2026-10-07 (INC-2026-008, in that repo's
   CLAUDE.md and `.claude/rules/analytics.md`: leaks found even with full masking), which a
   lawyer's yes alone does not lift; so
   does anything else a project's own files keep off by name.
   A fact corrected the same day: the question that led to his typed sentences said
   snooker-smart records screens. Its code is set to, but PostHog holds no recording of that
   project since 2026-10-07 (its API, read 2026-11-14); the first trap below is why.

   The agent's detail, for whoever builds the screen. It is a feature: it gets its full spec
   right before it is built (`working-style.md`, Requests), written against the app's code and
   its posthog-js version, PostHog's page (https://posthog.com/docs/privacy/data-collection), the
   live Apple and Google policy pages, and section 4 of `posthog-research-2026-11-13.md` beside
   this file. In that section the items marked R are requirements of the spec; the items marked
   I are proposed to Nadav in it, and nothing is refused on their strength (the items marked P are
   in the defaults of step 3 and below); the legal items need a
   professional, as the research says, and its professional checks (the lawyer's check, the
   data-protection-officer duty, transfer abroad) are asked of Nadav together, because they cost
   money.
   - What the screen has to achieve (each line is checked in step 4 or in the spec's acceptance
     list):
     - A person who refused, or has not answered yet, sends PostHog nothing about themselves:
       no event, no error report, no recording, no `identify`, no flags request that carries
       their id or a URL with personal data, and no event from the server.
     - The app keeps the choice itself: in the user's record for a signed-in person (the server
       reads it there too) and on the device before sign-in. A person who accepted is not asked
       again after signing out. On a device with no stored choice the app cannot know the person
       before sign-in, so the screen may show there; once they sign in, the choice in their
       record applies and the screen does not show again (the spec says which answer wins when
       the two differ).
     - A person who accepted is measured, recording included where it is on.
     - The screen names every kind of data the app may collect, recording included where it may
       come, so that one approval covers it; a later piece that adds a kind the screen did not
       name shows the screen again to those who accepted before.
   - What the stores' own text asks (read 2026-11-14): consent is an affirmative tap inside the
     app, not a line in the terms, not bundled with accepting the terms, and closing the screen
     is not consent (Google Play, User Data, prominent disclosure); a person can refuse, nothing
     is locked behind accepting and the screen does not push (Apple 5.1.1(ii) and (iv)); a way to
     withdraw stays reachable in the app (5.1.1(ii)); recording needs explicit consent and an
     indication while it runs (Apple 2.5.14; how the indication looks is one of the spec's open
     product decisions); an app in the Kids category should carry no third-party analytics
     (Apple 1.3), and one aimed only at children uses approved SDKs only (Google Families). In an
     app minors use, the spec says who consents for a minor and, where its Play target audience
     includes children, how PostHog stays behind a neutral age screen or collects nothing from
     children (Google Families).
   - Mechanism (PostHog's page above): `opt_out_capturing_by_default: true`,
     `posthog.opt_in_capturing()` when the person accepts, `posthog.opt_out_capturing()` when
     they withdraw. Control capture through this API, not by loading the snippet late.
   - Traps, read in the posthog-js source (1.433.6) and on PostHog's page on 2026-11-14; check
     each against the version the app uses:
     - `advanced_disable_flags: true` also stops the remote config, and without it recording,
       heatmaps and the other switches set in the PostHog project never start, for a person who
       accepted too (snooker-smart has it since 2026-10-06). Where the app reads no feature
       flags, use `advanced_disable_feature_flags: true`: it stops `/flags/` and keeps the remote
       config. The remote config then applies every switch set in the PostHog project that `init`
       does not set itself, so `init` sets off what stays off (at least
       `enable_recording_console_log: false`; green-room, snooker-smart's project, has
       console-log capture on), and the unit test of step 4 pins it.
     - While a person is opted out the SDK still sends `/flags/` requests, with the id it has
       and person properties such as the landing URL. So `identify` runs only for a person who
       accepted.
     - `reset()` clears PostHog's stored consent (the SDK's own warning). The app applies the
       stored choice again with `opt_in_capturing()` after `init` and after every `reset()`;
       call `reset()` before `opt_in_capturing()`, not after.
     - `cookieless_mode` beside the opt-out default sends events right away (PostHog's page).
   - Applied by default, because they only keep data out (listed in the report so that Nadav can
     reverse them): no names, diagnoses or other personal details in event properties, in any
     app; autocapture, where it is on, with `mask_all_text: true` and
     `mask_all_element_attributes: true` (the element's text and its links carry names, codes and
     tokens); checkout and payment pages excluded from recording, as step 3 says for routes that
     show personal data.
   - An app that already collects without the screen: the screen is not built inside a task that
     is not that screen (it is something new for the whole app, `working-style.md`, UI and
     product work), and capture is not switched off as a side effect of one; a task that asks to
     switch capture off or narrow it, or a fix that keeps personal data out of PostHog, still
     changes it. A change that would start a kind of collection the app does not do today (in
     snooker-smart, the flags switch above starts recording) ships with the screen, not before
     it, also when a task asks for it; the report names the screen task it waits on (the agent's
     reading of his 13.11 pick, "ומי שמסרב לא נותן נתונים", and of "as today" in his 14.11 pick).
     Verify as in step 4. The brief
     for the two apps: `~/.omc/handoffs/posthog-consent-screen-2026-11-14.md`. An app found later
     in this state gets the same: the session that finds it names it once in its closing report,
     as a separate task waiting to be started, with a brief in `~/.omc/handoffs/`.
   - The store listing, in every store app: the privacy label (Apple) and the Data safety form
     (Google) list what the SDK collects; the privacy policy is linked in the listing and in the
     app, and says what is collected and why, that PostHog protects it equally, how long it is
     kept, and how to withdraw or ask for deletion (Apple 5.1.1(i), Google User Data). On a live
     listing the agent prepares those answers; publishing them is a change to a live listing and
     waits for Nadav (`working-style.md`, Approval gates).
   - An app outside the stores is included, with the screen on the same model (the agent's
     reading of "every app"). Also the agent's reading: a marketing site or a demo that loads
     PostHog is not covered by his picks; it keeps what it has, and the session that first finds
     it names it once in its closing report.
   - Each released piece names its one to three usage events and the question each answers, or
     says that it measures nothing and why (in its spec).

Why: since 2026-09-16 PostHog is the single owner of usage data and errors, every production app
should report to it from the people who accept (step 5), and apps like TherapyFlow carry personal
data, so masking is part of setup.
