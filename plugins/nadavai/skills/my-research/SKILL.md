---
name: my-research
description: "מיצינו את המחקר? לכל שאלה: נענתה עם מקור, סותרת, לא נמצאה או לא נשאלה."
argument-hint: "[איזה מחקר]"
disable-model-invocation: true
---
# my-research: did we exhaust the research

Nadav asks whether the research is complete. "We read a lot" does not answer that. The answer is a list of questions, each with its state.

The research in question: $ARGUMENTS

If that is empty, it is the research this session did.

1. Write the questions the research had to answer, taken from what Nadav asked for and from what the product decisions that follow depend on. If no such list was written at the start, write it now and say so.
2. Give each question one state:
   - answered: the answer in one line, its source (a URL or a file), whether you read the source yourself or know it from an agent's summary, and your confidence in it;
   - contradicted: the sources disagree. Say which ones, and what would settle it;
   - not found: with where you searched ("searched X, Y and Z and found nothing");
   - not asked yet.
3. For each conclusion that a decision rests on, name the competing explanation or option that the research would have to rule out, and say whether it did. A conclusion with no rival that was looked at is weaker than it reads.
4. Look for what the list itself is missing: a competitor, a market, a kind of user or a part of the product that no question covers. A report with no gaps is suspect.
5. Say which findings reached a spec, a plan or a decision, and which still sit only in a research file.
6. Answer: exhausted or not, the count in each state, and the three questions most worth closing next, each with how long it would take.

A finding that a decision rests on, and that you know only from a summary, you check again at its source. Start no new research in this turn: report first.
