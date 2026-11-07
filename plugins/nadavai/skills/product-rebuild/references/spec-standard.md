# Spec standard (stage 3)

## CAPABILITIES.md (the master inventory)
One row per capability:
- id
- name
- source: the current system, a competitor with its path, or BEYOND-MARKET
- status: designed, partly or missing
- the surfaces that reach it
- the owning spec block (exactly one)
- the wave: launch or after
- "lost if we stopped here"
- "replaced on purpose" (Nadav confirms each such row)
- full-access gaps

**Rules:**
- A split id names its other half, by id, in both specs.
- The coverage map (`DEMO-FEATURE-COVERAGE.md` in MediZen) is generated from this file, never edited by hand.
- A script checks the table after every round: every id has one owner, nothing is duplicated, and every split names its other half.

## Domains
Split the product into 10-20 domains. MediZen had 16:
1. shell and help
2. calendar
3. public booking
4. patient record
5. money
6. reports
7. leads
8. messages
9. automations
10. AI
11. team
12. settings and import
13. marketing and commerce
14. privacy, security and legal
15. mobile and notifications
16. operator and second vertical

Every product also needs go-to-market. File names: `spec/NN-domain.md`, plus `00-INDEX.md` and `GAPS.md`.

## A block
```
### <ID> <name>
Source: CAPABILITIES ids · decisions #N · law
States: empty · loading · normal · error · offline · permission · edge cases
Defaults: each with DECIDED (#N) / LAW / ASSUMPTION / PROPOSED
Wording: the exact Hebrew strings (generic masculine, calm, no exclamation marks)
Action-safety: for each outside effect, the contract from `nadavai:action-safety new`. One approval binds one exact version.
Acceptance tests: numbered, each observable
Measures: what we count after launch, with an ESTIMATE label when it is a target
```

## Per file
- `## Open questions`: Q-NNN rows, each with its options and a recommendation. Q-ids map to rows in the triage JSON.
- `## Review log`: one line per critic round or decision pass, such as "decisions 7.11: #N applied".

## Rounds
1. A pre-mortem by a second model on the domain split.
2. One writer per domain.
3. A fresh Opus critic per domain, which returns REVISE or APPROVE with findings.
4. A reviser applies every finding.
5. Recount `00-INDEX.md` and `GAPS.md`.

Repeat until each domain gets APPROVE and the recount shows nothing missing or duplicated.

Each round gets a response table in `00-INDEX.md`, with the finding, what changed and where.

## Workflow shape
One agent per domain file. An agent writes its own file only. The recount agent is the only one that writes `00-INDEX.md` and `GAPS.md`. Agents do not commit; the orchestrator commits after `git status`.
