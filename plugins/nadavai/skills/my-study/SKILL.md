---
name: my-study
description: "צא למחקר לפני החלטה: שאלה אחת על היקף ותקציב, שלוש אפשרויות עם מקורות, והמלצה אחת."
argument-hint: "[כותבים כאן: על מה המחקר, ומה צריך להחליט]"
disable-model-invocation: true
---
# my-study: research before a decision

Nadav sends a session out to research before he decides: a tool to adopt, whether to build something or buy it, a provider, a market, a person. In the sessions where he asked this, the budget and the scope arrived several messages late, he asked whether other options were looked at («חקראת מערכות אחרות לא רק MEM ? ויש משוה שיכול לעזור לנו ? או שלא צריך ?»), and he asked to see the result on a page. `/nadavai:my-research` is the other half: it checks afterwards whether a research was exhausted.

What to research, and the decision it serves: $ARGUMENTS

1. Ask once, before searching, only what his words leave open (one AskUserQuestion, your recommended answer first): the decision this serves, the money ceiling (free only, or up to how much), and the constraints that rule options out (Hebrew and right-to-left, what it must work with, where it runs). Start meanwhile on what does not depend on the answers.
2. Look at home first: what the repo, the installed tools and the skills already do, an earlier research on the same subject, and tools he already decided against (`grep -ril '<term>' ~/.claude/projects/*/memory/`; `working-style.md`, Learning). An earlier research is read and continued, not repeated.
3. Bring at least three options he did not name. "Use what we already have" and "not needed" are always among them, and for build-or-buy so is a ready product, one sold in Israel included, with its price.
4. Read the sources now, not from memory (`webget`, WebSearch; `working-style.md`, Browser routing): price, limits, licence, upkeep, Hebrew. Every claim keeps its URL. Keep what you checked today apart from what you assume. A source that is closed is named, and another is tried. Nothing is called possible that no source showed working.
5. This is research, so the thing itself is not built and nothing is installed into a project or a machine's setup. Nothing is bought: money waits for him (`acting-on-behalf.md`). Trying an option in a scratch folder, or opening a free account that the check needs, is fine and is named in the report. A bug found on the way is still fixed, as its own commit (`working-style.md`, Code).
6. Put the result on one page and open it for him: the bottom line, one recommendation with the strongest reason against it (`candor.md`), the options side by side with real prices, the links, what was checked against what is assumed, and the next step with how long it takes. Where a picture or a small demo lets him judge, add it.
7. Reply with the recommendation in two lines and the link to the page.
