# Time estimates: how one is made and what Nadav gets

Read before giving Nadav an estimate of how long a program will take, and before a question to him that changes
what a launch contains. When an estimate is computed again is in `rules/working-style.md`, Reporting (at a plan's
approval, at each milestone, when he asks). This file is the agent's detail, written on 2026-11-14 from one
program's estimate that he questioned that day (25 to 87 weeks, recomputed in each of 17 document rounds); his
words then were "אם צריך לעדכן משהו תשלח לסשן החוקים שתגיעו לפתרון המושלם הקבוע להכל". Nothing here makes an agent
ask him or wait for him.

- The base is a pace measured on his finished repos, stated with what that pace already contains (tests, review
  and fix rounds, the time he spent judging). Nothing it already contains is multiplied in again: that estimate
  divided the pace by a "quality multiplier" for tests and reviews although the reference repos were already 35%
  and 39% test code. A factor is added only for something named that the reference lacked, with its evidence.
- Size is counted in what a person can use (screens, flows, actions) and converted by a ratio measured on the
  reference repos, then checked against one finished app of similar size. A rule added to a spec does not add
  size by itself, and a size goes down as well as up.
- A review round of a document does not change the estimate. It changes only at the points Reporting names.
- Only the piece built next is sized in detail; a later launch gets one line.
- A plan names what really caps its pace and measures it, instead of a number of lanes or agents: here that has
  been the one CI machine (the queue time of a landing), the weekly model limits (stops in a week) and the hours
  a unit waits for him. The number of agents follows the work (`rules/model-routing.md`), so a structure sized to
  an agent count is not a reason for the calendar.
- What waits on someone else (a store or platform review, a client, an account, a contract) is started as early
  as the plan allows and is listed apart from the building time.
- He gets one number with its confidence (`rules/candor.md`) and the two or three things that move it most, split
  into what the work needs, what his decisions on scope cost, what the method costs (checks, reviews, CI) and
  what waits on others. No more precision than the measurement has: weeks, not days, for a program of months. A
  range whose high end is more than about twice its low end is reported as "not known yet", with what would
  settle it and when.
- After the first four weeks of a build the estimate comes from that build's own numbers: units a person can use
  closed in a week, review rounds for a unit, hours a unit waited for him, queue time of a landing.
- A question to him that widens or narrows what a launch contains shows, for each option, what it costs in
  calendar time from the same model. A scope question without that is a question without a fact he would weigh
  (`guides/review-rounds.md`, what a real fault is).
