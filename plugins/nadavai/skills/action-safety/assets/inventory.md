# Action safety inventory: <application>

This inventory records bounded evidence, not certification. Replace bracketed fields with findings or explicit unknowns. Reuse existing equivalent records instead of duplicating them.

## Assessment boundary

- Mode / request / date / assessor: <...>
- Adopted skill version / standard version: <...>
- Loaded skill location / SKILL.md and standard.md content digests: <...>
- Repository revision / working-diff identity / relevant configuration: <...>
- Products, roles, tenant scope and environments assessed: <...>
- Discovery scope / selection rationale / risk priorities: <...>
- Sources searched: <routes/forms, APIs/RPCs, SDK/direct writes, imports/admin, jobs/queues, bots, inbound callbacks, scripts/maintenance, reads gating actions>
- Unsearched sources, inaccessible paths and unknown action population: <...>
- Output location / read-only or operational constraints: <...>

## Coverage by business action

Use separate rows when entry points, roles or products have different evidence. Group rows by business action; a screen or shared validator is not an action. Tier reflects actual harm/exposure, not a waiver of requirements.

| Action ID / product | Entry point(s) / role scope | Tier / harm | Evidence state | Contract / rule source | Authoritative boundary | Evidence snapshot | Gaps / next slice / owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <action / product> | <named paths / roles> | <T1/T2/T3 + reason> | <not-audited/discovered/specified/implemented/verified/blocked> | <link or unknown> | <path or unknown> | <link, revision+diff/config, result or not run> | <bounded gap and responsible role> |

States: `not-audited` means a known surface is unassessed; `discovered` means located; `specified` means requirements defined; `implemented` means behavior exists but proof is incomplete; `verified` requires all applicable fresh behavioral evidence for the bounded claim; `blocked` records a concrete blocker and retains the last supported state. Source scans alone never establish `verified`.

## Honest coverage statement

- Inventoried action/entry-point pairs: <count, counting convention, role/product breakdown>
- Verified pairs: <count and links to supporting evidence>
- Coverage among inventoried pairs: <verified / inventoried; unknown if denominator unavailable>
- Discovery completeness and how checked: <routes/jobs/integrations/write paths reconciled, or selected sample only>
- Explicit exclusions / uncovered roles, channels and actions: <...>
- Shared-pattern evidence reused / versions and action-specific checks: <...>
- Stale or invalidated claims after this change / prior evidence retained at: <...>

Do not describe a selected sample as whole-application coverage. Missing evidence is not a passing result. Keep runtime verification distinct from implementation inspection, deployment parity and provider guarantees.

## Findings and bounded work

| Finding / action | Demonstrated behavior or hypothesis | Evidence / revision | Harm / priority | Next bounded action | Owner / required authority / blocker |
| --- | --- | --- | --- | --- | --- |
| <ID / action> | <observed or unverified> | <safe reference> | <impact> | <specify, reproduce, implement or verify> | <role / authority / missing fact> |

- Immediate incident triage, if evidenced: <unsafe duplication, forbidden write, tenant exposure or false completion; existing incident route>
- Pending/in-flight, historical/finalized and deferred-obligation compatibility gaps: <...>
- Recovery ownership and late/stuck detection gaps: <...>

## Assessment history and learning

Append new dated snapshots or link versioned artifacts; retain earlier evidence and explain supersession. Do not overwrite a prior verdict silently. Store only synthetic or privacy-safe evidence.

| Date / revision + working diff/config | Assessed scope | Findings and state changes | Evidence retained / superseded | Demonstrated lesson / local follow-up or authorized upstream proposal |
| --- | --- | --- | --- | --- |
| <identity> | <actions/channels/roles> | <supported change> | <links + reason> | <evidence-backed improvement> |
