# Social campaigns

When a task is a client's paid ad, boost, campaign, page post or lead flow (Facebook, Instagram, click-to-WhatsApp), load `nadavai:social-campaigns` (fallback: `${NADAVAI_HOME:-$HOME/nadavai}/plugins/nadavai/skills/social-campaigns/SKILL.md`). It sends the session to `~/social/playbook/campaign-procedure.md` and to the client's `~/social/clients/<client>/CLIENT.md` (find it with `grep -l '<the name Nadav used>' ~/social/clients/*/CLIENT.md`). The procedure has two stops for Nadav on top of the global gates: the creatives before anything is built in Meta, and the launch summary with the amount before anything is published or extended.

Two invariants hold whether or not the skill is loaded:
- Read the client's `CLIENT.md` and the live state in Meta before proposing a change, and after any change read the live settings back from Meta (not from the edit screen) and record them, dated, in `CLIENT.md`. An edit saved as a draft does not run: in November 2026 one stayed a draft for six days while the old placements kept spending.
- Hebrew text and the client's logo in a creative are real text and the real file, never drawn or redrawn by an image model, and the creative claims nothing the client has not confirmed (price, warranty, licence, years of experience). An image-model edit of a logo's text once changed the whole logo.
