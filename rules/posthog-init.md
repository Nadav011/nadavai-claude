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
4. Verify: events from the deployed app show up in PostHog live events. Without that it is not
   done. Then add `PostHog: project <name> (EU)` to CLAUDE.md and commit.

Why: since 2026-09-16 PostHog is the single owner of usage data and errors, every production app
should report to it, and apps like TherapyFlow carry personal data, so masking is part of setup.
