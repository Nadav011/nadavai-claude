# Time estimates: how one is made and what Nadav gets

Read before giving Nadav an estimate of how long a program will take, and before a question to him that changes
what a launch contains. When an estimate is computed again is in `rules/working-style.md`, Reporting (at a plan's
approval, at each milestone, when he asks); this file adds no other time. It is the agent's detail, written on
2026-11-14 from one program's estimate that he questioned that day (25 to 87 weeks, recomputed in each of 17
document rounds); his words then were "אם צריך לעדכן משהו תשלח לסשן החוקים שתגיעו לפתרון המושלם הקבוע להכל".
Nothing here makes an agent ask him, wait for him or hold a question back.

- The base is a pace measured on his finished repos, stated with what that pace already contains (tests, review
  and fix rounds, the time he spent judging). Nothing it already contains is counted again: that estimate
  divided the pace by a "quality multiplier" for tests and reviews although the reference repos were already 35%
  and 39% test code. A factor is added only for something named that the reference lacked, with its evidence.
- Size is counted in what a person can use (screens, flows, actions) and converted by a ratio measured on the
  reference repos. Where a finished app of his has about the same count of those units, its real time is shown
  beside the result; a gap between the two is shown, not resolved by picking one, and when no app is close the
  estimate says so. A rule added to a spec does not add size by itself, and a size goes down as well as up.
- A review round of a document does not change the estimate.
- A later launch gets one line; only the piece built next is sized in detail (`guides/documents.md`, first bullet).
- A plan names what really caps its pace, measured, instead of a number of lanes or agents. In the program this
  file came from the caps were the one CI machine (the queue time of a landing), the weekly model limits (stops
  in a week) and the hours a unit waited for him; another program's cap is whatever its own measurement shows.
  The number of agents follows the work (`rules/model-routing.md`), so a structure sized to an agent count is not
  a reason for the calendar.
- What waits on someone else (a store or platform review, a client's answer, an account that has to be opened)
  is started as early as the plan allows and is listed apart from the building time. A signature or a payment is
  named in the estimate and stays behind the approval gates: it is asked and taken only at the moment those
  gates already require.
- He gets the range the measurement gives, the most likely figure inside it with its confidence
  (`rules/candor.md`), and the two or three things that move it most. No more precision than the measurement
  has: weeks, not days, for a program of months. When the high end is more than twice the low end, the same
  sentence says that this is not yet a date to plan by, what would narrow it and when; the range is still shown.
- The split is Reporting's (building, checks, waiting), and it adds up to the estimate; inside building, what his
  decisions on scope added is shown apart. His judging time is already in the base pace and is not added again.
- Once a build has closed enough units to compare (say how many), the next estimate that Reporting calls for
  shows the build's own pace beside the reference pace: units a person can use closed in a week, review rounds
  for a unit, hours a unit waited for him, queue time of a landing. The first weeks alone (setup, the easy
  screens) do not replace the reference pace.
- A question to him that widens or narrows what a launch contains goes out when Requests makes it his, and shows
  for each option what it costs in calendar time from the same model. A range counts as that price, and so does
  "not known yet" with what would narrow it: the lack of a narrow figure never holds the question back.
