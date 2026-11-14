---
name: my-creative
description: "פוסט, מודעה או סרטון: כל העובדות נכונות, נפתח לי לראות, ושום דבר לא מתפרסם בלעדיי."
argument-hint: "[כותבים כאן: מה מכינים, ולמי]"
disable-model-invocation: true
---
# my-creative: a post, an ad, a campaign or a video

Nadav asks for marketing material for one of his businesses or for a client: a post, an ad, a boost, a campaign, a short video. In the sessions where he asked this, facts arrived late (names, a date, a price with VAT, the logo), the account that was connected turned out to be another one, a reference he sent was taken as the content itself («מה ששלחתי זה לא האנשיעם כ !! זה סתם דגומא»), and the money limit had to be said in capitals («אני רוצה עד 50 ביום גג !!»).

What to make, and for whom: $ARGUMENTS

1. For an ad, a boost, a campaign, a page post or leads, invoke the Skill tool with skill `nadavai:social-campaigns` and follow it; `social.md` holds either way. For a video or a picture, say which tool will make it and what a run costs before the first paid run (`acting-on-behalf.md`: money is asked at that moment).
2. Collect the facts first, in one dialog, asking only what is missing: dates, prices and whether they include VAT, the phone number or the link people act on, the logo, the page and the ad account (and which browser profile is signed in to them), and the daily budget limit. Faces, testimonials and discounts are never invented.
3. What he pointed at is an example of a style unless he says it is the content: when his words leave it open, ask once.
4. Hold it to his bar: a video is moving footage that looks filmed, not still pictures sliding by; Hebrew copy reads like a person wrote it (the `nadavai:hebrew-content-writer` skill).
5. Show him the exact copy and the finished picture or video, opened as `${NADAVAI_HOME:-$HOME/nadavai}/plugins/nadavai/skills/my-show/SKILL.md` says, with a short list that every fact he gave appears and is spelled right.
6. Nothing is published and nothing is spent without his yes: a post on a page, an ad that starts running and any object created in an ad account wait for him (`working-style.md`, Approval gates). After a change he approved, read the live settings back and record them (`social.md`).
