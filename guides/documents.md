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
- A plan or a spec that replaces part of an older one carries over the decisions of his that the replaced
  part held, each as the words he typed or the option text he picked together with the question it
  answered, in the language he used. Where the older part only restates a decision, his words are looked up
  where he gave them (the project's decision record, the interview file, the conversation in which he typed or
  picked them, among others); where they are not found, point to the old line by file, line and the commit that
  holds it (for a file git does not track, a dated copy of that older file kept beside the new plan, pointed to
  instead), write "words not found", and do not copy or restate that line. Such a point counts as decided only
  when he approved the older plan that holds that line; otherwise it is handled as Requests says for a point
  nobody decided, never dropped and never marked as his. Where he has since typed or picked
  a change to one, his later words are written right after the older ones, with the date; where the two differ
  the later words win, and the older words stay in force for what the later ones do not change. Detail
  that an agent derives from a decision is written outside the quote, as the agent's.
- A direction, a brief or a fix instruction that relies on a pick of his quotes it as he gave it, in the
  language he used: the option text together with the question when he picked an option, or the words he
  typed when he did not. A translation, or the concrete detail derived from it, is written beside the
  quote as the agent's, never inside it.
- A plan built on another session's spec is checked against it when that spec is frozen, not at each merge.
  Between freezes the two sessions exchange a list.
- A spec that depends on another app is closed only after a reader with that app's code has checked the handoff
  against it: that app's live session when this session can reach it, or else a read-only agent started in its repo.
- What the reviews of a demo or a document found about rules and edge cases is written once, as cases for the real
  code's tests.
