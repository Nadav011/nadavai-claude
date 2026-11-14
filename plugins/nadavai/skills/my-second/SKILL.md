---
name: my-second
description: "תביא חוות דעת שנייה: מישהו אחר בודק את העבודה, או מנסה גרסה משלו."
argument-hint: "[על מה, ואיזה מודל]"
disable-model-invocation: true
---
# my-second: a second opinion from another model

Nadav wants another model on this: to check the work, to argue against the plan, or to try its own version and see whether it comes out better.

What he wants checked, and by whom if he said: $ARGUMENTS

If that is empty, the subject is the main piece of work or the plan of this session.

1. Say first what was already reviewed here: which reviewer ran, on what, when, and what it found. He often asks whether a review already ran; the same review is not run twice on the same commit.
2. Decide which of two jobs this is. A review checks what exists. A competing attempt gives the other model the same request and references without your solution, so that its answer is its own. It writes in a git worktree or a copy of its own, never in this session's working tree, where it would write over work that is not committed; its result is compared from there.
3. Choose the reviewer the way `working-style.md` (Second model) sets, reading that section now: which provider comes first for this kind of review, which are out of quota, and how each is told that the review is read-only. A model he named wins when it can run; when it cannot, say why and use the next one.
4. The reviewer gets the artifact, the request in Nadav's words and the file paths, not your conclusions. On a plan it argues against it: the plan failed a month from now, and why. For work in the areas that section names (auth, payments, data, money), it is told so in those words.
5. Read the raw output before you count the answer, because a provider can fail and still exit clean. Check each finding against the code or the page yourself: a finding is a lead.
6. Report: who reviewed, what it found, and what you did with each finding (fixed, rejected with the reason, left for him). For a competing attempt, show the two versions side by side, each with its link, and say which you recommend.

A rejection stands until the work is fixed and reviewed again.
