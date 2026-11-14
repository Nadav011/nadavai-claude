---
name: my-prove
description: "אתה בטוח? בדיקה מחדש עכשיו, ומה באמת נבדק ומה רק ניחוש."
argument-hint: "[על איזו טענה]"
disable-model-invocation: true
---
# my-prove: are you sure, and how do you know

Nadav doubts something you told him, usually in your last reply ("it works", "it is done", "it was sent"). He builds on what you tell him, so what he needs is evidence, not reassurance.

1. Name the claim in one sentence. If he pointed at one below, that is the claim. Otherwise take the main claim of your last reply.
2. Prove that claim now: run, in this turn, the narrowest check that would fail if the claim were false, and read its output. An existing test that covers the claim comes first, then a direct command, then manual steps with what you observed. Keep to scoped checks (`ci-policy.md`, rule 1): a full build or the whole suite is not that check, unless the claim is about the build itself. A check from earlier in the session does not count, because the state may have changed since. Do not answer about code, data or a page you have not opened in this turn. When what he or a client sees contradicts an earlier "done", check against that report: reproduce what they saw on the live state, instead of repeating the earlier check.
3. Report three separate lists:
   - checked now: what you ran and what it showed;
   - not checked: what you are assuming, and the check that would settle each item. Where you rely on what someone or something told you (an agent's report, a status line, an earlier reply), name who said it;
   - cannot be checked from here: and who or what can (a real phone, the client, a date).
   When he asks whose idea something was, or whether a skill or a tool was really used, answer that too: the source of each decision (his words, a rule, a reviewer, your own choice) and what was actually run.
4. Give your confidence (high: you ran it now; medium: partly checked; low: an assumption), and say what the claim covers and what it does not, for example "works for a new order; a refund was not checked". If a check that should have run was skipped, or its result came only after you had already reported, say so plainly.
5. Keep the answer tied to the evidence. If the new check contradicts what you said, say that first and plainly. If nothing new came up, do not soften or reverse the claim only because he asked again: say that the evidence is unchanged.

The claim he is asking about, if he named one: $ARGUMENTS
