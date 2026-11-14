# Plans, specs, work orders and handoffs: keeping them small

Read before writing one. How many review rounds a document gets is in `rules/working-style.md`, Second model
("Review rounds converge"): one independent round, then it is frozen and built from. This file is the agent's detail,
written on 2026-11-14 from what five of Nadav's sessions measured that day (16 rounds on one build plan, 75 reviews of
one spec, work orders at revision 6, nothing built from them); his words were "הכי מלא שיש" with no duplication and
nothing that only delays.

- A piece that is not built next is not detailed further until its turn. It keeps his decisions, the safety rules
  for money, messages to people, data and filings, its acceptance lines, and the research and contracts with other
  apps that are needed now. The full spec comes right before the piece is built, against the code as it is then
  (`working-style.md`, Requests).
- A decision or a fact is written in one place and other places point to it. A figure repeated across files is
  checked by a script where the project already has one, or else replaced by a pointer.
- A plan he has to approve opens with what he decides, one line each, before any argument. A work order says what
  to build and how it is checked, without the argument.
- A plan or a spec that replaces part of an older one lists the decisions of his that the replaced part carried,
  each one kept as he typed or picked it. Where he has since typed or picked a change to one, name that change.
  An agent does not mark a decision of his as changed.
- A direction, a brief or a fix instruction that restates a pick of his quotes the words he picked, the option
  text when he picked an option or the words he typed when he did not, and does not restate them in other words.
- A plan built on another session's spec is checked against it when that spec is frozen, not at each merge.
  Between freezes the two sessions exchange a list.
- A spec that depends on another app is closed only after a reader with that app's code has checked the handoff
  against it: that app's live session when this session can reach it, or else a read-only agent started in its repo.
- What the reviews of a demo or a document found about rules and edge cases is written once, as cases for the real
  code's tests.
