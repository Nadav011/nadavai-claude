# PostHog for an app (after the 2026-09 setup)

Applies when the SessionStart hook prints POSTHOG PENDING: a UI project whose package.json has no
PostHog SDK and whose CLAUDE.md does not mention PostHog. That is the only state; once the SDK is in
package.json, or CLAUDE.md says "PostHog: not used", the reminder stops.

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
   that mean success for this app (ask Nadav which); exception autocapture on. Deploy.
3b. More than one entry point: the SDK must not enter the second bundle. A repo that builds a
   second app from the same source (a customer app, an admin app, a marketing shell) shares
   components with the first, and a shared component drags its imports across the entry boundary:
   posthog-js walked into TherapyFlow's customer bundle twice, 306KB raw, first through the root
   error boundary and then through a shop helper. Injecting the reporter as a prop fixes the one
   file you noticed and nothing else. What holds is a build-mode alias to a no-op twin with the
   same exports (`resolve.alias` on `@/lib/analytics`), plus an assertion in the bundle's own
   verify script that no chunk matches `/posthog/i`. Without that assertion the alias is one
   refactor from being silently undone.

4. Verify: events from the deployed app show up in PostHog live events. Without that it is not
   done. **Verify from a real browser, never from an automated one:** PostHog drops every event
   when `navigator.webdriver` is true ("Refusing to render web experiment since the viewer is a
   likely bot" in its own debug output), so a Playwright or headless run will show a loaded SDK, a
   `/flags/` response, and zero events, and look exactly like a broken key. Nadav's own browser via
   Claude in Chrome is the check. Then add `PostHog: project <name> (EU)` to CLAUDE.md and commit.

Why: since 2026-09-16 PostHog is the single owner of usage data and errors, every production app
should report to it, and apps like TherapyFlow carry personal data, so masking is part of setup.
