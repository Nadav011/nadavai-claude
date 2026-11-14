# Off the screen: what the product sends

A person meets the product in an email, a push notification, a WhatsApp or SMS message, a PDF
and a receipt as much as on a screen. These are designed with the screen that triggers them and
reviewed with it. Source tags as in [experience.md](experience.md).

This file covers what the product sends by itself to its users and their customers. A message
Nadav sends to his own clients is a different thing and belongs to `nadavai:client-messages`.

## Rules for everything sent

| Id | Rule | Source | Check |
|---|---|---|---|
| O-01 | The same voice as the screens (C-01 to C-04): gender-neutral, one word per concept, no banned words. A message to a business's customers says "אנחנו" and "שלך", has no gendered verb, no emoji and no exclamation mark, and is signed with the business name. | #81 [A] | auto: `forbidden-words` on the templates |
| O-02 | What E-06 and E-08 say, for a message: the exact text is previewed before it goes, and "sent" is said only after the provider confirmed. The contract is action-safety's. | #423 [A] | action-safety |
| O-03 | Nothing sends as a side effect: a status change offers the message as a button ("לשלוח את הודעת השלב?"); an automation has a trial run, "send me first", one stop switch, quiet hours and a visible log of what was sent or skipped and why. | #354 [A], #404 | reviewer |
| O-04 | A send that can be undone waits about ten seconds so that undo never delivers a wrong message. | #43 [A] | reviewer |
| O-05 | Every link in a message lands on the thing it talks about, already open, on the device it was opened on (the store app when installed, the browser otherwise). | [P] | reviewer |
| O-06 | Mixed Hebrew and Latin text is isolated (phone numbers, times, amounts, links, names in Latin) so punctuation and ranges do not reverse. A time range is one LTR unit. | [B] | reviewer |
| O-07 | Every template is listed in one place in the repo with its trigger, its audience and a sample rendering, and is part of what `audit` covers. | [P] | none |

## By channel

**Email.** `dir="rtl"` and `lang="he"` on the root, logical alignment in tables, the real logo
(B-01), one action per email, a plain-text part. Dark mode is checked. The subject says what
happened, not the product name. Built with PostHog's `designing-email-templates` skill file (`~/.claude/plugins/marketplaces/posthog/skills/<name>/SKILL.md`; the plugin is off) where PostHog sends
it; otherwise with the project's own mailer.

**Push.** The title is the thing that happened and the body is what to do; both make sense
without the app name. The tap opens that item (O-05). Never a push for something the person just
did themselves. Permission is asked at the moment its value is obvious, not at first launch.
On Capacitor and Expo the technical side belongs to `nadavai:store-apps` and the push skills.

**WhatsApp and SMS.** Short, signed (O-01), no link shorteners that hide the destination. A
WhatsApp template that needs platform approval is written to pass it: no promotional wording in
a utility template. An SMS says who it is from in its first words.

**PDF, receipts, exports.** RTL throughout, the real logo, `he-IL` dates, ₪ before the number,
tabular figures, page numbers, and a file name a person can find later (what, who, date). A
money document says what it counts and is never regenerated silently. Law beats design: a legal
document's required fields and wording are not restyled away (Nadav, 5.11.2026, row C05-18 of `~/design-redesign/therapy-flow-v2/research/closing/session-audit/chunk-05.md` [N]).

## At review time

`screen` and `review` list every message and document the screen can trigger and show each one
rendered, next to the screen, in the before-and-after sheet. `ship` reads one real instance of
each channel on a phone.
