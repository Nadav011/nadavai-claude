---
name: social-campaigns
description: "Paid social and lead work for Nadav's small-business clients, and the visibility of his sites and apps. Campaigns: a new Facebook or Instagram ad, a boost, a campaign extension, a page post, a click-to-WhatsApp chat template, a status check of a running campaign, the report after it. Visibility: how a site, app or business of his is found in search engines, in AI answers, in a Google Business Profile or in reviews. Routes the session to the local playbook and the client's state-of-record file before anything is built or changed. Not for the social studio product under ~/social/spec, and not for an app's own in-product social module. Triggers: \"תעלה מודעה\", \"מודעה חדשה\", \"קמפיין\", \"בוסט\", \"קידום פוסט\", \"לידים מהמודעה\", \"פניות מהמודעה\", \"נעלה לו לעוד שבוע\", \"מה מצב הקמפיין\", \"פוסט לדף\", \"Ads Manager\", \"Business Suite\", \"SEO\", \"AEO\", \"GEO\", \"החותמת הדיגיטלית\", \"למה לא מוצאים אותנו בגוגל\", \"פרופיל העסק בגוגל\"."
---
# social-campaigns

Client campaigns and visibility work run from a playbook and one file per client that live on
Nadav's machines, not in this repository: this repository is public, and client facts, ids and
numbers stay out of it. The playbook's own `README.md` lists every file in it and who reads it.

## Campaigns: read first, in this order

1. `~/social/playbook/campaign-procedure.md`: the ordered procedure from the request to the final
   report, and what a session never does on its own.
2. The client's `~/social/clients/<client>/CLIENT.md`: who the client is, the chat to read, confirmed
   facts, the rules Nadav gave, the Meta ids, what ran and what is open. Find it with
   `grep -l '<the name Nadav used>' ~/social/clients/*/CLIENT.md`; no match means a new client (below),
   not a guess. Then the client's message log in `~/.local/state/client-messages/`.
3. `~/social/playbook/GLOSSARY.md`: which Hebrew word to use with Nadav, and the words he uses. His
   plain-Hebrew copy is `~/social/playbook/מילון-מושגים.md`.

Then, as the step needs: `meta-tooling.md`, `creative-production.md`, `lead-handling.md`,
`tools-and-skills.md`. Each rule there cites `_evidence-2026-11-10.md`.

Two stops for Nadav belong to campaigns, besides the global gates the procedure points to: the
creatives (approval point A) before anything is built in Meta, and the launch summary (approval point
B) before anything is published or extended. In every creative, Hebrew text and the client's logo are
real text and the real file, never drawn or redrawn by an image model, and nothing is claimed that the
client has not confirmed; generated photos are allowed (Nadav, 2026-11-10), never captioned as the
client's own job.

## Visibility: read first

`~/social/playbook/footprint-procedure.md`, then the newest `~/social/playbook/footprint-inventory-*.md`
(the properties, their intent and their measured state). Nadav's Hebrew summary is the newest
`חותמת-דיגיטלית-מצב-*.md`. The SEO pass before a public web app goes live stays where
`rules/working-style.md` (Verification) puts it; the procedure says how it fits.

## Where things go

- A new client: a folder `~/Documents/Clients/<Client>/` (synced to the second machine), a
  `CLIENT.md` from `~/social/playbook/client-file-template.md` whose title carries every name Nadav
  uses for the client, and a symlink `~/social/clients/<slug>` (or `~/social/clients/<slug>/CLIENT.md`)
  pointing to it.
- After any change made or read in Meta: update the client's `CLIENT.md` with the date.
- A new fact about how Nadav works, or a word he explained: the playbook file it belongs to, with its
  evidence, and both glossaries.

## Not this skill

- The social studio product (`~/social/SCOPE.md`, `~/social/spec/`, `~/social/research/`,
  `~/social/tools/`) is a separate project owned by its own session; leave its files alone.
- Messages to the client follow `nadavai:client-messages`; money, publishing, deletion, access and
  acting in Nadav's name follow the global rules (`rules/working-style.md` Approval gates,
  `rules/acting-on-behalf.md`).
