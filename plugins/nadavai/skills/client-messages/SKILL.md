---
name: client-messages
description: "One house style for every message Nadav sends to a client or a client group (WhatsApp mostly): what goes in, the order, the wording, links, images and videos, when to send and what never to send, plus the draft, approve, send and read-back process. Use whenever you write, review or send a message to a client, a client's team or a client group: a release note (\"it's live\"), a how-to, an answer to a bug report, a summary of work, a request for files or decisions, an invoice or money matter, an outage notice. Triggers: \"תכתוב לו הודעה\", \"תנסח ללקוח\", \"תעדכן את הקבוצה\", \"תשלח לשי/לדניאל/למשה\", \"הודעת סיכום\", \"מה לכתוב ללקוח\", \"send the client an update\"."
---
# client-messages

A client reads the message on a phone, between other things, and acts on it without asking back.
Every rule below serves that: after one read the client knows what changed, what to do, and what
happens next. Messages are written in Hebrew; this file is in English like every skill file.

Client-specific facts (who the contact is, how to address them, the product's domain, the project's
own vocabulary) live in that project's CLAUDE.md, never here: this repository is public.

## 1. Before writing

- **One goal.** Write down, for yourself, the single thing the client should know or do after
  reading. If there are two unrelated goals, it is two messages, or one summary with sections.
- **Pick the type**, because it fixes the shape (section 3): live release, how-to, answer to a
  report, request from the client, work summary, money or documents, outage.
- **Check every fact against the source, not memory.**
  - "Live" (חי) only after the change is deployed and you saw it work on production
    (the action-safety truthful-completion rule). Pushed, merged, passed tests or "on staging"
    is not live; say "עבר בדיקות ועולה לאוויר" instead.
  - Numbers, dates, amounts, document numbers and names come from the system or the file, copied,
    not retyped.
  - Button and screen names come from the UI itself (the code's strings or a screenshot), in the
    exact wording the client will see.
  - Every link is opened before it goes in: it loads, it lands on the right screen, and you know
    whether it needs a login.
- **Read the chat first** (wacli, read-only): the last few messages in both directions. Answer what
  the client actually asked, and carry over anything still open from your previous message.

## 2. Language

- Plain spoken Hebrew, short sentences, active voice. No AI phrasing ("שמח לעדכן", "חשוב לציין",
  "במסגרת", "על מנת", "בהחלט"), no marketing adjectives.
- No engineering words: deploy, commit, branch, CI, PR, build, cache, RLS, migration, API, bug ID,
  agent, model. Say what the client experiences: "עלה לאוויר", "תוקן", "ייקח עוד יום".
- Address the client by first name at the start, in their grammatical gender. If the gender is not
  known from the chat or the project's CLAUDE.md, write in plural or neutral forms and ask Nadav.
- "אני" for Nadav's actions and commitments. Do not alternate "אני" and "אנחנו" inside one message.
- Product terms the client uses (their names for screens, services, roles) win over ours.

## 3. Shape

**Opening line:** name, then the purpose in one line. The client knows from line one whether to
read now. Examples: "שי, התיקון באוויר", "משה, אני צריך ממך שני דברים לפני שממשיכים".

**Short messages** (one subject): opening line, two to five lines of content, closing line. No
headers.

**Long messages** (summary of several things): when it is longer than one phone screen (about 15
lines), start with a two or three line summary, then sections with a *bold* header each, always in
this order:
1. *חי עכשיו*: what the client can use today, each with its link.
2. *בבנייה*: what is coming, without dates you do not control.
3. *מה אני צריך ממך*: numbered, each item concrete (which file, which period, which format, which
   decision), plus items still open from the previous message, marked as such.

**Status words are fixed** so they mean the same in every message:
- חי / באוויר: deployed and checked on production.
- עבר בדיקות, עולה לאוויר: done, not yet on production.
- בבנייה: work in progress.
- מחכה לך / מחכה ל-X: blocked on someone, named.
If you use ✅ and 🔧, say once at the top what they mean.

**How-to steps:** the path with ← between steps, each button or tab in quotes exactly as on screen,
then what the client should see when it worked ("תופיע הודעה 'ירדו 2 שעות מהכרטיס'"). Mention a
refresh or app restart when a new version must load.

**Answer to a report:** say what you saw, whether it is fixed and live, and the workaround until it
is. Never "תוקן" when only the code changed.

**Money and documents:** the reassurance comes first when it is true ("אין כאן כסף חסר"). Then the
items grouped by problem, each line with number, name, date, amount. Each group ends with the exact
question for whoever decides (the client, the accountant). If the message is meant to be forwarded,
say so and write it so it stands on its own.

**Outage:** what is affected, what still works, what the client should do meanwhile, and when the
next update comes. Send it as soon as you know, then a short "חזר לעבוד" after it is verified.

**Closing line:** what happens next and when the client will hear from you ("אכתוב לך כשזה חי"),
plus the fallback ("אם משהו לא עובד, תשלח צילום מסך").

## 4. WhatsApp formatting

- *bold* for headers and the one key fact, _italic_ rarely. No Markdown headers (`#`), no
  `[text](url)` links, no tables, no code blocks: WhatsApp shows them as raw symbols.
- Bullets with "•", ordered steps with "1." "2.".
- An empty line between sections, none inside a short list.
- Emoji: at most one in the opening, and the status legend if used. Not one per line.
- Numbers as the client writes them: ₪3,150, dates as 26.7 or 26.7.2026, times as 14:00.

## 5. Links

- The full `https://` URL, never shortened, never a bare domain.
- Deep link to the exact screen, not the home page.
- The link at the end of its line, with nothing glued after it (no period, no closing bracket),
  because WhatsApp can swallow trailing characters into the link.
- Say when a link needs a login, or works only from the app, or only for the admin.
- For an app: both the App Store and the Google Play links, one per line.
- No staging, preview or localhost links, ever.

## 6. Images, videos and files

Show, do not describe, when the change is visual or the steps are more than three.
- **Screenshot**: from production, cropped to the part that matters, with the change visible.
  No other client's or patient's personal data in the frame; blur or use a demo record.
- **Short screen recording** (under a minute) for a flow with several steps. Say in the text how
  long it is and what to look at.
- **Caption carries the meaning**: the media goes with a caption that is the message (or the short
  form of it). A media item without text is not a message.
- Files: a PDF or spreadsheet with a meaningful Hebrew name, not `export(3).xlsx`.
- Through wacli: `send file --to JID --file ABSOLUTE_PATH --caption TEXT` (see the wacli skill).

## 7. When to send

- One summary instead of a stream: do not send several separate updates within an hour; batch them.
- Send "live" right after the production check, not hours later and not before it.
- Not on Shabbat or holidays (Friday afternoon until Saturday night) and not between 22:00 and
  08:00, unless it is an outage that hurts the client now. Drafts written then wait.
- A request from the client goes when the client can act on it, not just before a weekend.

## 8. Never send

- Anything not verified (section 1), or a date you do not control.
- Internal detail: agents, models, CI, tooling costs, other clients, other projects.
- Passwords, keys, codes or personal data of the client's customers in the chat body. Credentials
  go through another channel Nadav chooses.
- Legal or professional claims you cannot stand behind: write "נבדק מול נוסח החוק, לא אישור של
  עורך דין", never "מאושר משפטית".
- Marketing to the client's own customers. That is a broadcast with consent rules, not a client
  message.
- A message sent automatically. Agents draft; a send happens only on Nadav's explicit request for
  that message (wacli rule).

## 9. Process

1. Draft the message into a file in the scratchpad (one file per message), not inline in a shell
   command.
2. Show Nadav the exact text, with the recipient and any media named, and the checklist below
   ticked. Above the text, always, a short *heads-up* block (in Hebrew) listing everything in the
   message that could trip Nadav up later, or "אין הסתייגויות" when there is nothing:
   - a commitment or a date ("אכתוב לך מחר", "יהיה מוכן השבוע") and who has to deliver it;
   - money: a price, an amount, a discount, a refund, a correction to an invoice or a receipt;
   - anything legal, medical or tax-related, or anything that goes to the client's accountant,
     lawyer or customers;
   - admitting a fault or a data problem, or saying something is not possible;
   - anything Nadav has not seen yet (a feature he has not looked at, a number he did not check);
   - a question the client is likely to ask back, and the answer;
   - what in the text could be read two ways, or could annoy the client;
   - anything you could not verify, and why.
   A message with any heads-up item is never sent without Nadav's explicit approval of that
   message, even when an earlier instruction said to send. Changes go into the file.
   Why: Nadav talks to the clients himself, and must not learn about a promise or a sum in a call.
3. Send only on an explicit "send" for that text, from the file:
   `send text --to JID --message "$(cat FILE)"`, or `send file … --caption "$(cat FILE)"`.
   Nadav copying it himself copies from the file, not from terminal output.
4. Read the sent message back from the archive and compare it to the file. Any difference is
   reported to Nadav at once.
   Why: on 2026-10-05 a long summary to a client group went out with words cut in the middle of
   several lines ("לאנשלעדכונים", "קייםטי"), most likely copied from a terminal that wrapped it.
5. Report the message ID and that it was submitted; submission is not proof the client read it.
6. Always end with a *summary for Nadav* in Hebrew, short enough to read before a call, so that
   without opening the message he knows everything that was said:
   - to whom, when, and with which media or files;
   - what the client was told, in three to six lines: what is live, what is coming, the numbers;
   - what was promised and by when;
   - what was asked of the client, and what is still open from earlier;
   - what the client is likely to come back with.
7. Append that summary to the client's log,
   `${XDG_STATE_HOME:-$HOME/.local/state}/client-messages/<client>.md` (newest on top, one block
   per message, with the date and the message ID; create the file if missing). It stays on the
   machine, never in a repository, because it holds client details. Before writing the next
   message to that client, read the log: open promises and open requests come from there.
   Why: the summary in chat scrolls away; the log is where Nadav checks a client before a call.

## Checklist before sending

- [ ] One goal, stated in the opening line, with the client's name.
- [ ] Every "live" was seen on production; every number and name copied from the source.
- [ ] Every link opened, full URL, deep, at line end, login need stated.
- [ ] Button names exactly as on screen; expected result stated.
- [ ] What I need from the client: numbered, concrete, including items still open.
- [ ] What happens next and when.
- [ ] No engineering words, no internal detail, no other client's data, no secrets.
- [ ] WhatsApp formatting only; one phone screen, or a summary on top.
- [ ] Right time to send.
- [ ] Heads-up block shown to Nadav; anything in it approved by him explicitly.
- [ ] Sent from the file and read back.
- [ ] Summary for Nadav given and appended to the client's log.
