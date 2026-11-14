# Closing (stages 6-7)

## 1. Client-asks coverage
**Input:** the channels where the system's users talk to Nadav. In MediZen these were the clients' business and personal chats and the group with them. In the social lane they are the business owners in each host app. Add questionnaires and support threads.
- Read through `wacli`, read-only.
- Read the full text, and every image at full size.
- Transcribe voice notes locally. When the media has expired (403), rebuild the content from the summaries Nadav wrote back, and say so.
- Delete the media, the transcripts and the chat copies from scratch afterwards.

**Output:** `research/closing/CLIENT-ASKS-COVERAGE-<date>.md`
- one table per client, with:
  - the date
  - the message id (never a name)
  - the ask in their words, short
  - the question we asked, if any
  - the state: COVERED, PARTLY (what is missing), GAP or DECIDED-NOT (#N)
  - the proposed home
- gaps ranked, with a proposed spec change for each
- "they heard something else": every decision that changes what a client was told, or behaviour they have live today
- the open questions to clients, with their ids. Never re-ask an answered one.

**Rules:**
- A gap that is live behaviour today gets a spec block. It is never left out, because a relaunch would silently remove it.
- Money, a narrowing of live behaviour, and a reply to a client go to Nadav.
- Nothing goes to a client without his word for that message.

## 2. Close-all ledger
`workflows/close-all.js` with `args`:
```
{ repo, out_dir, context, finders: [{ k, p }] }
```

**Finders**, one per dimension, read-only:
- the exit checklist (including rows that should exist but don't)
- the session audit
- the specs (open questions, contradictions, one-way splits, decisions no spec mentions)
- research (systems not studied, trials still open, findings never verified)
- process and handoff (build-plan prerequisites, migration conflicts, bugs for the app session, unmarked CHANGES files)
- clients, legal and money (one counsel package and one CPA package, public claims that are not true yet, client promises that conflict with a decision)

**Statuses**, exactly one per item:

| status | meaning |
|---|---|
| `closed_now_verified` | done; the finder checked the disk |
| `running_lane` | a running lane covers it; the lane is named |
| `doc_fix` | an agent can fix it now in a doc the closing lane owns |
| `needs_nadav` | a real choice, or something only he can do |
| `launch_gate` | a check on real people or devices before launch |
| `build_plan` | belongs in the build plan |
| `external_session` | another session owns it, such as tax filings or the app repo |
| `decided_not` | a decision rules it out; the number is cited |

**After the finders:**
1. **Ledger.** `LEDGER-<date>.md` and `ledger.json`, with `## לנדב, בקצרה` on top: the totals, what is closed now, what only Nadav can do (a short numbered list of plain actions), and what waits on counsel, the CPA or other sessions.
2. **Closers.** One agent per file. It never touches the files of running lanes (specs, demo) or the app repo.
3. **Critic.** A completeness critic looks for missing dimensions, for "closed" items without evidence, and for promises to Nadav that are not in the ledger. Its gaps go into the ledger as rows for the next repeat; it does not read again a document that had its one round.

`needs_nadav` items go to him at once with AskUserQuestion, grouped. They are never parked for a summary.

## 3. Exit checklist rows that every rebuild needs
- sign-up timed with a real person
- a real paper print of every printable document, when the product prints
- cross-system amendments confirmed by a review and delivered to each host session, when the system embeds or is embedded
- the outside-approvals register: every review or filing started, with its date
- core screens timed on a synthetic backend
- Nadav's mark on every CHANGES file
- client-asks coverage done
- every trial account closed (from TRIALS-TO-CANCEL)
- counsel and CPA packages sent, or interim decisions recorded
- bugs found in the app code handed to the app session as a written file
- the demo published after the critics, with the real-name check passed
- the build plan at `OWNER-APPROVED`
