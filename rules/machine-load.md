# Machine load: pick the light path that keeps quality and speed

- Before any heavy or repeated local work (test databases, replays, builds, browser runs, parallel agents), choose the setup that loads this computer least while keeping full quality and the fastest wall clock. Load is never the reason to skip a test, a review or a check. Why: on 2026-10-19 five full Supabase stacks (45 containers) ran at once for SQL tests that needed only Postgres, and the 16-core machine sat at load 28-41 for hours (Nadav, 2026-10-19).
- Use the smallest component the check needs: plain Postgres instead of a full Supabase stack when only SQL runs; one long-lived server with a pre-migrated template database, cloned per test (`createdb -T`), instead of a fresh stack per run; one shared build or browser instead of one per agent.
- Every test still starts from a clean state (a fresh clone, a fresh database), never from a database another test wrote to.
- Bound the heavy part: a lock or a cap on concurrent stacks and replays, and tear each one down as soon as its run ends.
- An extra server is fine when it is the lighter path (a staging database, a container on another machine, a cloud instance), as long as it holds no real customer data. Anything that costs money goes through the paid-service approval gate.
- The second machine (omarchy) runs CI for every repo and is weaker; do not move agent work there unless a measurement shows spare capacity, because a slower CI queue slows every agent.
- Measure before and after (load average, container count, run time) and say what the choice saved.
