---
name: social-campaigns
description: "Paid social and lead work for Nadav's small-business clients: a new Facebook or Instagram ad, a boost, a campaign extension, a page post, a click-to-WhatsApp chat template, a status check of a running campaign, or the report after it. Routes the session to the campaign playbook and the client's state-of-record file before anything is built or changed in Meta. Not for the social studio product under ~/social/spec, and not for an app's own in-product social module. Triggers: \"תעלה מודעה\", \"מודעה חדשה\", \"קמפיין\", \"בוסט\", \"קידום פוסט\", \"לידים\", \"פניות מהמודעה\", \"נעלה לו לעוד שבוע\", \"מה מצב הקמפיין\", \"פוסט לדף\", \"Ads Manager\", \"Business Suite\"."
---
# social-campaigns

Client campaigns are run from a playbook and one file per client that live on Nadav's machines, not
in this repository: this repository is public, and client facts, ids and numbers stay out of it.

## Read first, in this order

1. `~/social/playbook/campaign-procedure.md`: the ordered procedure from the request to the final
   report, the two approval points, and what a session never does on its own.
2. The client's `~/social/clients/<client>/CLIENT.md`: who the client is, the chat to read, confirmed
   facts, the rules Nadav gave, the Meta ids, what ran and what is open. Then the client's message log
   in `~/.local/state/client-messages/`.
3. `~/social/playbook/GLOSSARY.md`: which Hebrew word to use with Nadav, and the words he uses. His
   plain-Hebrew copy is `~/social/playbook/מילון-מושגים.md`.

Then, as the step needs: `meta-tooling.md` (routes and traps in Meta's screens, dated),
`creative-production.md` (how ads and reels are built, the quality bar), `lead-handling.md` (the chat
template, answer speed, measures, benchmarks), `tools-and-skills.md`. Each rule there cites
`_evidence-2026-11-10.md`.

## Where things go

- A new client: a folder `~/Documents/Clients/<Client>/` (synced to the second machine), a
  `CLIENT.md` from `~/social/playbook/client-file-template.md`, and a symlink
  `~/social/clients/<slug>` (or `~/social/clients/<slug>/CLIENT.md`) pointing to it.
- After any change made or read in Meta: update the client's `CLIENT.md` with the date.
- A new fact about how Nadav works, or a word he explained: the playbook file it belongs to, with its
  evidence, and both glossaries.

## Not this skill

- The social studio product (`~/social/SCOPE.md`, `~/social/spec/`, `~/social/research/`,
  `~/social/tools/`) is a separate project owned by its own session; leave its files alone.
- Messages to the client follow `nadavai:client-messages`; money, publishing, deletion and acting in
  Nadav's name follow the global rules (`rules/working-style.md` Approval gates,
  `rules/acting-on-behalf.md`).
