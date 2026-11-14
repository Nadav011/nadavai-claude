---
name: my-prove
description: "אתה בטוח? איך בדקת? בודק שוב עכשיו ומפריד בין מה שנבדק למה שרק הנחה."
argument-hint: "[על איזו טענה]"
disable-model-invocation: true
---
# my-prove: are you sure, and how do you know

Nadav doubts something you told him, usually in your last reply ("it works", "it is done", "it was sent"). He builds on what you tell him, so what he needs is evidence, not reassurance.

1. Name the claim in one sentence. If he pointed at one below, that is the claim. Otherwise take the main claim of your last reply.
2. Invoke the Skill tool with skill `oh-my-claudecode:verify` and prove that claim now: run the check again in this turn and read its output. If that skill cannot load, run the narrowest check that would fail if the claim were false. A check from earlier in the session does not count, because the state may have changed since.
3. Report three separate lists:
   - checked now: what you ran and what it showed;
   - not checked: what you are assuming, and the check that would settle each item;
   - cannot be checked from here: and who or what can (a real phone, the client, a date).
4. Give your confidence (high: you ran it now; medium: partly checked; low: an assumption), and say what the claim covers and what it does not, for example "works for a new order; a refund was not checked".
5. Keep the answer tied to the evidence. If the new check contradicts what you said, say that first and plainly. If nothing new came up, do not soften or reverse the claim only because he asked again: say that the evidence is unchanged.

The claim he is asking about, if he named one: $ARGUMENTS
