---
name: my-design
description: "תעצב או תכין דמו שרואים: מוצרים דומים קודם, שניים-שלושה כיוונים, ונפתח לי מיד."
argument-hint: "[כותבים כאן: איזה מסך, אפליקציה או דמו]"
disable-model-invocation: true
---
# my-design: a design or a demo he can look at

Nadav asks for something he will look at: a screen, the look of an app, a demo site for a client or a prospect. In the sessions where he asked this he had to ask for it to be opened, rejected a first version that looked generic or unlike what he pointed at («הפנוטים גרועים כל העיצוב גרוע ביותר ובכלל לא דומה»), said in another session that what he pointed at was only an example («זה סבתם היה דוגמא»), and asked for an address he could send («איפה הכתובת שאני יכול לשלוח ללקוח»).

What to design: $ARGUMENTS

1. The work itself belongs to the `nadavai:nadav-design` skill: invoke it with the Skill tool and follow the track that fits (app, site, client-demo). Its standard is read even for one screen (`working-style.md`, UI and product work). This prompt sets what comes before and after it.
2. Before anything is drawn, look at two or three real products of the same kind, and at what he pointed at. How closely to follow his reference decides the outcome: when his words do not say, ask once (AskUserQuestion) with the two readings as examples, "as close to it as possible" and "the same spirit, our own look".
3. Facts only he has (names, dates, the domain, a logo) are asked in that same dialog and never invented. A demo with invented people is marked as the skill's client-demo track says (`noindex` on anything invented, a permanent demo line where the track asks for one, his own domain); the marking of a demo that already exists is changed only on his word.
4. Where no direction was approved, show two or three rough directions and stop: the direction is his to judge at its first version (`working-style.md`, Requests). Where one was approved, build on it and change only what the content forces.
5. Check before you show: in a real browser, at the width he will see it and at phone width (`working-style.md`, Verification), right to left, no placeholder text, a clean console.
6. Open it for him at once, as `${NADAVAI_HOME:-$HOME/nadavai}/plugins/nadavai/skills/my-show/SKILL.md` says, with a link he can send when a client will look at it, and say what is still rough. Then wait for his word; polish comes after it.
