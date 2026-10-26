# Action contract: <stable action ID — business operation>

Template: replace bracketed fields; keep unknowns explicit. Record a reason for each inapplicable requirement. Do not include real personal data, secrets or raw sensitive payloads.

## Scope and evidence identity

- Product / action / requested scope: <...>
- Contract version / date / owner: <...>
- Evidence state: <not-audited | discovered | specified | implemented | verified | blocked>
- Last supported state if blocked / blocker / next responsible role: <...>
- Adopted skill version / standard version: <...>
- Loaded skill location / SKILL.md and standard.md content digests: <...>
- Repository revision / working-diff identity / relevant configuration and shared-pattern versions: <...>
- Covered entry points, roles and tenants / excluded or undiscovered paths: <...>
- Business rule sources and approvals / applicable AS requirements with exclusions: <...>

## Identity and access

- Actor and tenant boundary / affected entities: <...>
- Entry points, including direct writes, background/inbound and maintenance paths: <...>
- Authoritative enforcement paths and code references: <...>
- Operation identity, payload fingerprint, lifetime and replay/mismatch policy: <...>
- Read dependencies: completeness, freshness, failed/empty/partial states and action gates: <...>

## Preconditions and lifecycle

- Required/conditional fields, normalization, cross-field and state rules: <...>
- Configuration, current authorization and concurrency protection at execution: <...>
- Draft versus final requirements / later edits that could violate invariants: <...>
- Approved incomplete save: durable outstanding items, reason, owner, deadline/escalation, repair and downstream inclusion/labeling: <...>
- Pending operations, historical records and caller compatibility; shared consumers tested versus unverified: <...>
- Finalized protected fields/artifacts, snapshot retention and authorized correction with actor/time/reason/version traceability: <...>

## Effects and completion

- Intended writes/external effects / atomic local boundary: <...>
- Mandatory outcomes and proof / separately approved ancillary outcomes: <...>
- Permitted transitions and truthful queued, partial, unknown, completed and conflict states: <...>
- Durable intent before dispatch / immutable effect-bound snapshot while in-flight or unknown: <...>
- Crash/response-loss handling, trustworthy lookup, safe retry prerequisites and provider limits: <...>
- Callback authentication, duplicate/order checks, unknown-operation quarantine and legitimate reversals: <...>
- Batch atomicity or parent/per-item identities, counts, resume and cancellation: <...>
- Cancellation race, reversal limitations and high-impact safeguard: <...>

## User experience

- Persistent plain-language problem message: affected action, known cause/effects, next step and who can take it: <...>
- Field/summary/status presentation, accessible disabled explanation and all safe known corrections: <...>
- Authorized repair destination, access recheck, controlled return and intentional resubmission: <...>
- Safe work preservation, retention, session/logout/tenant switch and offline policy: <...>
- Keyboard, announcements/focus, screen reader, mobile/zoom and RTL evidence or gaps: <...>

## Recovery and evidence
- Continuing recovery role/queue, responsible person, fallback and owner transfer: <...>
- Late/stuck detection, detector-failure detection, deadline, escalation and user notification: <...>
- Reconciliation/manual authority, closing evidence, unresolved disposition and late contradictory evidence: <...>
- Safe diagnostics/support reference, mandatory effect records versus optional telemetry, retention and access: <...>

## Acceptance and evidence

Select applicable scenarios from the standard and add domain-specific ones. A planned check is not a passing result. Keep earlier observations when evidence changes.

| Requirement / entry point / role | Synthetic scenario and expected effect boundary | Check / evidence artifact | Tested revision + diff/config / date / environment | Observed result and gap |
| --- | --- | --- | --- | --- |
| <AS-ID / path / role> | <input, failure or race; expected state/effects> | <test or observation reference> | <identity> | <not run / pass / fail / blocked; limits> |

- Risk tier and rationale / required evidence depth: <...>
- Reused pattern evidence and dependency versions / action-specific wiring checks: <...>
- Uncovered scenarios, missing manual observations and deployment/provider uncertainty: <...>
- Superseded evidence and reason / current claim supported by evidence: <...>
- Next bounded slice / necessary approval or missing fact: <...>
