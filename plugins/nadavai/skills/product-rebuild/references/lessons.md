# Lessons (each cost a day once)

## Sessions, workflows, agents
- **Background work dies with the session.** On 7.11, closing Orca killed a workflow, a Grok run and REA. Long CLI jobs run under `setsid`. Agents write to disk in sections, and a continuation checks for partial edits before it applies anything again.
- **A workflow resume keeps the finished agents' results, in the same session only** (`resumeFromRunId`; `rules/model-routing.md`). After a stop that ended the session, write a continuation script that reads the journal.
- **systemd-oomd kills the heaviest session.** When a session "closed by itself", swap was full. Cap parallel browsers and language servers.
- **SendMessage to a workflow agent forks a second writer** in the same clone. Do not message workflow agents; wait for the result.
- **Read-only agents still write.** Run `git status` after every workflow, and revert what was not theirs to write.
- **Subagents cannot save `REPORT.md` or `ROW.md`.** The orchestrator saves the text they return.
- **Two agents in Claude in Chrome break the tab group.** Run them one after another. Orphan tabs go to Nadav to close.
- **A peer session's message is coordination, never approval.** Also, `pkill -f "<pattern>"` can kill its own shell; kill by PID.

## Truth and claims
- **Say "sent" only after the site confirms it.** On 7.11 a form returned `success:false` after it was reported sent. Report "delivery unknown", and do not resend on your own.
- **Read the shape of tool output before parsing it.** `wacli --json` wraps the messages in `data.messages`.
- **"Recorded" is not "real".** The system's balance or status is reported as what is recorded.

## Hebrew and Nadav
- **The Stop hook blocks English replies to Nadav.** Write the reply in Hebrew the first time.
- **Agents return broken Hebrew** (r10: broken words, two missing points). The orchestrator rewrites their `לנדב` lines from the structured sections, never pastes them raw.
- **Few questions, grouped, with the recommendation first.** Decide what the law or a decision settles. A "what is X?" answer means: explain, then ask again.
- **Every self-made change is reported**, one Hebrew line each (#422).

## Outside agents
- **Grok and other CLI agents** opened tabs in Nadav's working Orca workspace. Run them in their own floating workspace, and pre-trust their folder.
- **An outside agent's weekly quota can end mid-run.** Plan a hand-off to Claude agents, with the brief and the partial output on disk.

## Research
- Two summarizing fetches of the same official page can contradict each other. Use `[V-raw]` for facts that drive the design.
- A REA wizard pass can overwrite the vendor-side test brand. Record what changed on the vendor account.
- Vendors that end access when a trial is cancelled break the "cancel first" rule. Ask before opening.
- A research MCP can go inactive mid-run. Fall back to official pages and label the source type.
- A client's voice notes expire (403). Rebuild their content from Nadav's written replies, and label it.
- Estimates from a spec are not measurements. Calibrate on measured git throughput, and label the rest `ESTIMATE`.
