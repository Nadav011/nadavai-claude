# Action safety and understandable recovery

Version: 1.0, 2026-10-26. This reusable standard originated in the Opus 5.5-reviewed action-safety specification. Skill packaging and application coverage are verified separately.

Status: behavioral requirements for existing and new applications. Installing this skill provides development guidance; it does not change runtime behavior or establish application coverage.

Each target project owns its action inventory, contracts and evidence. Use the templates linked from the skill entrypoint, or update equivalent existing project documents. Record this standard version and the actual inspected project revision.

## 1. Product commitment

An application must make its state understandable to a nontechnical person. An action may proceed only when its required conditions are satisfied. When a problem prevents safe completion, block the affected action, explain what is known, and provide the next safe step. Where the user can correct the problem, take them to the authorized place to do so without unnecessarily losing their work. Report completion only when the action's promised outcome is confirmed.

This applies to missing or invalid information, invalid business state, unavailable dependencies, permission changes, technical failures, partial effects, and uncertain outcomes. Informational notices and optional missing information do not block unrelated safe work. A system failure must not be presented as a mistake made by the user.

### Goals

- Every inventoried action has explicit prerequisites, completion evidence, recovery ownership, and tested failure behavior.
- Users can identify the affected action, understand the problem, and find a safe next step without interpreting technical errors.
- Required validation cannot be bypassed through another entry point or a competing request.
- Partial, delayed, and uncertain results remain visible and recoverable without unsafe duplication.
- New features preserve these guarantees; existing products acquire measured coverage through an explicit adoption inventory.

### Boundaries

- This is a shared behavioral contract, not a requirement for one universal form, dialog, backend, or validation library.
- It does not promise that every failure can be predicted, that external effects can be rolled back, or that software will have zero defects.
- Drafts, final submissions, and independent sub-actions may have different requirements. Optional fields do not become mandatory by default.
- This standard does not independently authorize mutations. The user's execution scope and existing approval boundaries govern code changes, production operations, permissions, payment behavior, migrations and global installation.
- This is not tax or legal guidance. Domain-specific conditions require a separately established source of truth and review.

## 2. Required contract for each action

Before implementing or claiming coverage, fill in the following five groups. An action means a business operation or state transition, not merely a screen or button. Read operations need equivalent definitions for completeness, freshness, failures, and dependent actions.

| Contract group | Required definition |
| --- | --- |
| Identity and access | Stable action name; actor and tenant scope; authorized entry points; affected entities; operation identifier where effects require deduplication. |
| Preconditions | Required and conditional fields; value and cross-field rules; business-state and configuration dependencies; permission checks; draft versus final rules; authoritative validation point. |
| Effects and completion | Intended writes and external effects; required versus ancillary outcomes; evidence that proves each outcome; concurrency control; atomic local boundary; permitted state transitions. |
| User experience | Meaning of loading, empty, stale, blocked, pending and final states; safe problem messages; field associations; authorized repair destination; return context; retry availability; accessibility behavior. |
| Recovery and evidence | Responsible owner; retry and reconciliation policy; background deadline and escalation; cancellation semantics; privacy and retention rules; acceptance tests and evidence location. |

Unavailable facts must remain unknown. Default values must not turn an unavailable prerequisite into permission to execute, or an unread result into a successful outcome. Product-approved legacy defaults must be explicit and separately tested.

## 3. Enforcement and state integrity

### AS-01: Authoritative validation

Validate required data and business meaning at the trusted execution boundary, before the relevant effects. Browser validation provides early help and must agree with authoritative rules. Equivalent actions must enforce equivalent invariants through UI, mobile, API, import, bot, webhook, administration, and background jobs where those entry points exist. A read-only preview or dry run is not evidence that a later write will still be valid.

For every final-state invariant, identify the lowest appropriate authoritative boundary shared by all applicable writes. Account for direct client-SDK table access, RPCs, triggers, edit screens, maintenance scripts, migrations, backfills and operator writes. Use existing constraints, protected server operations and access controls as appropriate; document authorized maintenance exceptions and how they preserve or explicitly repair the invariant. Do not claim that a privileged operator is technically incapable of bypassing database protections. Invariants apply both when entering a final state and when later modifying protected fields of that record.

Define blankness and normalization consistently for each field across layers. Required identifiers must reject whitespace-only or invisible-format-only input, including non-breaking spaces and direction marks; never strip meaningful Unicode from free text indiscriminately. Field-specific normalization must preserve valid identifiers and international names.

Acceptance: invalid or missing mandatory input submitted through every supported entry point is refused with no prohibited effect, including updates that remove a final record's required values. Controlled imports may quarantine invalid records, but may not report them as activated successfully. Test the same Unicode edge cases at the UI and authoritative boundary.

### AS-02: Current state and concurrency

Conditions that can change must be protected at execution, not only checked earlier. Use the application's existing authoritative mechanisms for atomic local updates, constraints, reservations, version checks, or locking as appropriate. Recheck applicable conditions when a queued operation executes. Never assume a browser refresh or initial eligibility check reserves a resource.

Acceptance: concurrent attempts for a single available resource cannot both complete; changed permissions or business state cannot be bypassed by an older form or queued request.

### AS-03: Explicit completion boundary

Define which outcomes constitute the requested action and which are independent ancillary work. For example, a booking and its notification may have separate outcomes if the product contract says so. Receipt of an HTTP response or acceptance into a queue is not sufficient evidence of the promised business result.

Record product/domain approval for classifying a previously promised or required outcome as ancillary. Do not relabel a failed obligation as optional to make an operation appear complete. When incomplete saving is explicitly allowed, use the persistent outstanding-work contract in AS-18 and define how dependent reads and actions treat it.

Acceptance: success wording and navigation match confirmed outcomes. The screen cannot close a workflow as complete while a required outcome remains unconfirmed. A completed sub-action remains visible when another sub-action fails.

### AS-04: Duplicate protection and uncertain effects

For effects that must not repeat, assign a stable operation identity across retries and competing entry points. Define replay behavior, identity lifetime, payload mismatch handling, and provider capabilities. A timeout, lost response, or server error does not establish that nothing happened. An uncertain effect requires status lookup or reconciliation before any retry that could duplicate it. A new identifier must not bypass the unresolved operation.

Durably record the operation's identity, intent and appropriately protected payload fingerprint before starting an external effect, and supply a stable provider key where supported. If that record cannot be committed, do not start the effect. Survive a crash between recording intent, dispatch, provider execution and recording the result; distinguish an unstarted intent from an uncertain dispatched attempt using actual evidence.

From dispatch until the outcome is established, protect the effect-bound input version/snapshot, including while the outcome is unknown. Changes to those inputs for the active operation must be refused with a clear explanation or routed to a supported cancellation path; never alter the dispatched payload implicitly through a repair form or referenced entity. Independent changes may not rewrite that snapshot. After resolution, use the applicable correction path, including AS-20 for finalized data, without unnecessarily locking unrelated work.

Document the longest applicable retry/redelivery window and retain the minimum necessary deduplication evidence throughout it. Unresolved operations require explicit disposition rather than silent expiration. Data minimization may separate minimal replay protection from private payloads; it must not silently reopen a duplicate-execution window. Resolve retention conflicts before enabling affected retries or cleanup. If evidence arrives after a manual resolution and contradicts it, record a conflict and assign recovery instead of overwriting the history.

Acceptance: double clicks, refreshes, reconnects, repeated deliveries and supported retries do not duplicate the effect; conflicting reuse is refused; uncertainty is visible. Promise deduplication only within the actual guarantees of the local system and external provider.

### AS-05: Safe configuration, access, and result handling

Check required service configuration and access without exposing secrets or private entity details. Validate external responses before trusting identifiers or completion flags. A successful transport response containing a business rejection is a rejection. An unknown response shape is not success. Revalidate authorization when opening repair destinations and resuming work.

Acceptance: missing configuration, business-error payloads, malformed responses, expired access and revoked permissions have safe explicit outcomes; no cross-tenant repair link or protected data leaks through an error.

## 4. Truthful states and readable data

The names below describe semantics. Applications may reuse suitable existing states rather than invent another state framework.

| State | What is known | Permitted message and continuation |
| --- | --- | --- |
| Blocked / rejected | Preconditions failed; the protected effect did not start. | Name the known problem and offer correction. Do not imply that independent prior effects were undone. |
| Saved with outstanding requirements | An explicitly allowed incomplete record exists; its final requirements remain open. | Show what is saved and what is outstanding, with an owner and repair path. Do not label the dependent final action complete. |
| Accepted / queued | The request is durably recorded for later work. | Say it was received or queued, show how to check it, and define cancellation if supported. |
| In progress | Execution has started; the final result is not yet established. | Show progress or a bounded waiting explanation; prevent competing submission where unsafe. |
| Completed | All mandatory outcomes for this action are confirmed. | State what completed; distinguish any separate ancillary failure. |
| Partially completed | Confirmed effects exist; some required work remains. | Identify completed and remaining work, recovery owner and next safe step. |
| Outcome unknown | Available evidence cannot establish whether an effect happened. | Explain that the result is being checked only if a check actually exists; otherwise provide an actual status/support path. Block unsafe repetition. |
| Unresolved, disposition recorded | Evidence remains unavailable; an authorized role has recorded how the uncertainty will be handled. | Keep the uncertain outcome explicit, with its rationale and recovery plan. This is not confirmed completion and does not unlock unsafe repetition. |
| Failed with known outcome | Execution failed and the system has established which effects, if any, occurred. | Describe the established effect boundary and a safe retry or recovery path. |
| Cancelled | Cancellation has been confirmed for the defined remaining scope. | Explain any work already performed or effects that cannot be cancelled. A cancellation request alone is not confirmation. |
| Conflict / duplicate detected | Credible evidence contradicts a prior resolution or indicates conflicting effects. | Preserve the evidence and history, block unsafe repetition, and route to the authorized recovery owner. |

### AS-06: Honest loading, empty, partial and stale states

Separate initial loading, successful empty results, loading failure, incomplete/paginated results and stale retained data. Never replace a failed read with a truthful-looking empty list, zero balance, available slot, or default setting. Define freshness for decisions that depend on current information. Prevent affected decisions when required data cannot be verified; allow unrelated safe work.

Acceptance: failed reads cannot appear as an empty success; incomplete results are identified; a recovery path exists; stale displays cannot authorize a mutation whose current prerequisites are unknown.

### AS-07: Complete background lifecycle

Define expected duration, the point at which waiting becomes late, status refresh behavior, recovery deadline, escalation owner and a terminal disposition for each asynchronous action. Persist enough safe state that closing a tab, restarting the app or a worker restart does not erase the operation's identity. Maintain that identity only as permitted by access and retention rules.

Detect overdue operations without requiring the user to return. Verify the health of the detector/reconciler using an independent signal, such as an existing scheduler heartbeat monitored through a separate path. An alert produced only by the failed detector is not sufficient. State the actual support response expectation and a fallback when the primary recovery mechanism is unavailable.

Acceptance: a queued operation cannot remain an unexplained spinner indefinitely; returning users can find authorized operation status; late and exhausted work reaches a recovery owner. Do not promise automatic resolution or notification unless those mechanisms exist and are verified.

### AS-08: Cancellation and reversibility

State what can be cancelled, until when, and what cancellation means. Check cancellation races against actual execution. High-impact destructive actions, financial/legal commitments and irreversible external effects must provide an appropriate safeguard: effective reversal where genuinely permitted, a review/correction step, or explicit confirmation of the actual effect. Show relevant amount, scope, target and recipient/item count. Reuse existing safeguards where sufficient and specify one for any high-impact action, new or existing, that has none; routine reversible actions do not require another confirmation. External delivery or issuance is not presumed reversible. Finalized-record corrections follow AS-20.

Acceptance: cancellation racing with completion yields the actual result; an irreversible effect is not silently repeated or described as rolled back.

## 5. Understandable correction and recovery

### AS-09: Actionable problem contract

User-facing problems must provide the affected action, known cause when safe, what is known about prior effects, the next safe step and who can take it. Use stable internal reason codes and field/entity associations where useful; translate them into product language. Unknown causes must stay unknown. Raw stack traces, SQL errors, provider diagnostics and HTTP codes are not the primary explanation.

Show all currently known, safe-to-disclose correction needs together. Prioritize blockers without inventing additional requirements. Technical causes must not falsely blame the user. Provide a nonsecret support reference when it helps investigation.

Acceptance: a person unfamiliar with the software can identify what happened and select the next step without interpreting a technical code. If the system cannot yet determine the cause, the message states the known impact and real recovery path.

### AS-10: Proportionate and persistent feedback

Choose inline field errors for local corrections, a form summary for multiple issues, persistent operation status for background/partial/uncertain results, and an existing dialog only when a decision requires interruption. Toasts may supplement feedback but cannot be the only location for a blocker or required recovery instruction. A disabled control needs an accessible, discoverable explanation. Avoid duplicate alarms for the same issue.

Acceptance: instructions remain available long enough to act on them, including after a transient notification disappears. Informational and optional warnings do not unnecessarily block work. Error styling is not conveyed by color alone.

### AS-11: Direct, authorized repair and return

For a current-form issue, associate the message with the exact control, reveal its containing section, and move focus predictably after failed submission. For another entity or screen, offer a clear action to the exact authorized repair destination. Preserve safe input and return context, then revalidate the original action. Do not silently rerun a charge, send, issuance or other irreversible effect merely because the user returned.

If the user cannot repair the source, identify the authorized role or actual support route without exposing protected information. If multiple prerequisites depend on each other, offer an ordered path and detect circular or inaccessible repair paths. Return destinations must be application-controlled, not arbitrary redirect URLs.

For protected data on a finalized record, route to the authorized correction action in AS-20 rather than an ordinary edit form. Session-expiry recovery is conditional on safe storage, reauthentication and renewed authorization; shared-device isolation and retention take precedence over preserving input.

Acceptance: correction works across tabs, dialogs and screens, with expired sessions and changed permissions; the original work is recoverable within policy; no dead link, authorization bypass or unintended resubmission occurs.

### AS-12: Accessible language and interaction

Use plain product-specific language, meaningful labels, keyboard access, programmatic field associations and appropriate status announcements. Do not steal focus for ordinary background updates. An interrupted flow must support predictable focus and return. Verify mobile layout, zoom, RTL and screen-reader behavior for applicable products. Error messages must explain a format or valid alternative when the user needs it.

Direction-isolate support references, identifiers, numbers and dates embedded in RTL text using the product's existing formatting conventions. Test the visual order and assistive-technology reading order of each adopted message pattern.

Acceptance: users can find, understand and correct the issue without relying on color, pointer interaction, a disappearing message, or a technical term. Automated accessibility checks supplement manual keyboard and screen-reader checks.

### AS-13: Work preservation and safe navigation

Define what unsaved work survives navigation, reload, session expiry, offline periods and app restart, and for how long. Warn before preventable loss and explain genuine limitations; do not promise recovery that does not exist. Use the lightest appropriate storage and avoid automatically retaining passwords, payment secrets, or other data whose storage is not approved. Draft access, expiry and cleanup must be scoped to the correct actor/tenant, including on shared devices.

Acceptance: repair navigation does not unnecessarily discard work; any supported recovery uses the correct identity and respects retention; logout or tenant switching does not expose a previous user's draft. Offline work is visibly unsynced until confirmed; offline execution is allowed only where explicitly designed.

## 6. Operational ownership and ongoing coverage

### AS-14: Recovery ownership and escalation

Every partial, unknown, late or exhausted action must have an owner, a real resolution path and an escalation rule. Define safe reconciliation, permitted manual intervention, evidence needed to close the issue, and how the user learns the outcome. A support button or retry button alone is insufficient if no one can resolve the underlying state. Automatic retries must be limited, classified by cause and safe for the effect.

Assign ownership to a continuing role/work queue with a current responsible person and fallback, including transfer when that person leaves or loses access. Name which role may manually resolve uncertainty, what evidence it must retain, and which later contradictory evidence enters the conflict state. A manual assertion without sufficient evidence must not unlock unsafe replay.

If sufficient evidence cannot be obtained, an explicitly authorized role may record an unresolved disposition with its rationale, required domain/risk approval, continuing replay restrictions and plan for detecting/correcting later contradictory or duplicate effects. This can end an operational waiting/escalation cycle without inventing a factual outcome: the result remains uncertain, never confirmed complete. Such a disposition is not permission to repeat, reverse, erase or waive the effect; any exceptional follow-up action needs its own domain contract and applicable approval.

Acceptance: simulate a stuck operation and identify who receives it, how it is investigated, and what confirmed evidence changes its state. A technical outage does not become an impossible user correction task.

### AS-15: Privacy-safe diagnostics and measurement

Record enough safe structured evidence to distinguish validation refusals, provider/business failures, technical failures, uncertain effects and recovery. Correlate attempts with their operation without logging form contents, patient/customer names, secrets or unnecessary personal identifiers. Apply existing retention, access and masking policies. User-visible support references must not grant access.

Acceptance: diagnostic evidence supports investigation and state reconstruction without exposing sensitive input; redaction and tenant separation are tested. Best-effort monitoring must not fabricate user-facing success or block otherwise safe execution. Mandatory audit/effect records remain part of the action's prerequisites where the domain requires them; they are distinct from optional telemetry.

### AS-16: Inventory, tests and change discipline

Track coverage per action, entry point and relevant role/product, including reads that gate mutations. Record the source of each business rule, authoritative enforcement, recovery behavior and fresh evidence. Do not infer full coverage from one form, one validator, the existence of a skill, or a source-text scan.

New actions require this contract and its checks before release. Existing actions move through discovery, specification, implementation and verification; unresolved high-risk actions cannot be marked covered. Changed prerequisites require review of existing pending operations, historical records, drafts, dependent actions and backwards-compatible callers. Do not invent missing historical values or silently make previous records disappear.

Evidence of an active unsafe duplication, forbidden write, cross-tenant exposure or false completion must be triaged immediately through the existing incident and approval process, rather than waiting in the adoption queue. An ordinary change to an uncovered action must preserve existing guarantees and test its changed behavior; it does not automatically require rebuilding the entire action or product. Full coverage continues through the adoption sequence, with unresolved risk stated explicitly.

Acceptance: the adoption inventory identifies uncovered surfaces and test gaps. Regression checks exercise behavior, state changes and actual side-effect boundaries; a documentation claim alone never moves an action to verified.

### AS-17: Batch and multi-item outcomes

Define whether a batch is genuinely atomic or consists of independent item effects. For independent effects, retain a parent operation and stable per-item identities, item outcomes and privacy-safe counts. Resume only work whose retry is established safe; do not repeat completed items or automatically replay uncertain ones. Default cancellation applies to unstarted items; cancelling started work requires confirmed provider/domain support. A parent summary must distinguish completed, failed, pending, unknown and cancelled items.

Acceptance: a partially delivered batch interrupted by response loss can be resumed without resending completed items; unknown items remain protected; counts match per-item evidence; cancellation reports its actual scope. An atomic local batch proves all-or-nothing behavior within its stated boundary.

### AS-18: Persistent outstanding work

If product/domain owners explicitly allow a required detail or outcome to be completed later, persist an outstanding item with its reason, affected record, owner, due/escalation policy and authorized repair path. Show it on the record and in a discoverable outstanding-work view, reusing existing queues or lists where suitable. Optional unpromised information does not create a mandatory obligation by default.

For each affected balance, report, export, document and other derived read, define how an incomplete record is included or excluded and how that status is labeled. Recording an observed economic event does not imply that the money was never received merely because a record is incomplete. Required dependent final actions stay blocked until their prerequisites are met. Any exceptional waiver must be explicitly permitted by the domain, authorized, recorded and reflected in the true outcome; mandatory legal/security rules are not silently waived.

Acceptance: an allowed incomplete save remains discoverable after navigation/restart, cannot silently become finalized, and has consistent downstream treatment. Required outstanding work cannot disappear by dismissing a toast or relabeling the outcome ancillary.

### AS-19: Trusted inbound events and ordered transitions

Authenticate incoming callbacks/events according to the integration's actual supported mechanism and replay rules before allowing effects. Validate their business meaning, operation identity and permitted state transition. Deduplicate repeated events; older or conflicting events must not regress authoritative state merely because they arrived later. Legitimate later reversals or corrections are explicit domain transitions, not permission to overwrite completion arbitrarily.

If the integration offers no verifiable event authentication, treat the inbound event only as a trigger for an authenticated provider status lookup. The unauthenticated payload must never establish completion, regress authoritative state or originate records. If no trustworthy lookup or other approved verification exists, quarantine it and keep the outcome unconfirmed rather than treating lack of provider support as a validation exemption.

An event for an unknown operation must enter a defined quarantine/reconciliation path. If an integration legitimately originates new records, give that intake its own authenticated action contract and full finalization checks; do not promote an unmatched callback directly into assumed completion. Keep diagnostic content protected and bounded by retention.

Acceptance: forged, duplicate, delayed, out-of-order, unmatched and legitimate reversal events follow the declared policy without duplicate effects, false completion or lost recovery work.

### AS-20: Finalized records and subsequent correction

Define which fields and issued artifacts become protected after finalization. Preserve the authoritative version/snapshot on which an issued output was based for the applicable retention period. Changes to protected finalized data require a distinct domain-approved correction or reopening transition, appropriate authority, a reason and an audit trail; ordinary edits cannot silently rewrite issued history. Unprotected metadata may remain editable if the contract allows it.

Record actor, time, reason and references to protected before/after versions or the minimum necessary change evidence. Sensitive historical content belongs only in an access-controlled audit/version store where justified; never copy patient/customer or payment details into ordinary diagnostics. Define effects on dependent records and outputs rather than implying that an external artifact was altered or reversed.

Migrations, backfills and manual operator writes affecting protected finalized fields require equivalent actor/reason/version traceability, recorded in bulk where appropriate. Maintenance authority does not silently exempt issued history from this contract.

Acceptance: an ordinary edit cannot change protected issued data; authorized correction preserves traceability, applies the correct domain transition, revalidates dependent actions and respects privacy/retention. Repair navigation leads to correction rather than a bypassing edit form.

## 7. Acceptance scenario catalog

Each action selects the applicable scenarios and explains any not-applicable entry. Use synthetic data and the smallest suitable test environment. Add domain-specific scenarios rather than claiming this catalog enumerates all possible failures.

| Scenario group | Required proof |
| --- | --- |
| Input and state | Missing required data; Unicode whitespace/invisible-only and malformed values; conditional and cross-field rules; boundary dates/amounts; unavailable configuration; stale or changed business state; appropriate draft/final/outstanding differences; downstream treatment of incomplete records. |
| Access and entry points | Same invariant across supported channels and direct write paths; updates that remove final-state requirements; actor/tenant isolation; permission/session changes before execution and repair; authorized maintenance; no inaccessible repair loop or unauthorized detail disclosure. |
| Execution and effects | Double submit; concurrent conflicting operations; crash around durable intent/dispatch/result; response loss after effects; malformed or business-error response; forged/duplicate/out-of-order/unmatched inbound events; partial batch effects; safe retry identity and payload mismatch; late evidence contradicting a resolution. |
| User recovery | Complete correction list; clear status and effects; inline/summary/repair destination; return context; no data loss outside explicit policy; readable mobile/RTL layout; keyboard and screen reader; intentional resubmission. |
| Lifecycle and operations | Loading versus empty/error/stale results; offline/reconnect; cancellation race; tab/app/worker restart; late/exhausted queue; failed reconciliation and detector failure; owner transfer/escalation; safe evidence expiration; privacy-safe diagnostics; historical records, finalized correction and draft compatibility. |

### Evidence depth and freshness

All requirements above are mandatory where applicable. Risk changes the depth and reuse of evidence, not whether invalid execution or false success is allowed. Classify actual harm and exposure in each product: T1 covers high-impact money/documents, clinical/sensitive changes, external sends and destructive operations; T2 covers other core workflows; T3 covers lower-risk reversible work. Raise a tier when the real consequence warrants it.

Every authoritative action path needs relevant behavioral tests. Shared accessible components and unchanged message/repair patterns may reuse documented pattern-level manual evidence; record that dependency and test action-specific wiring. T1 flows also need their own end-to-end recovery/accessibility evidence and appropriate nontechnical task observation. This does not require a separate manual user session for every equivalent role/channel combination.

Evidence must identify the tested revision, relevant rule/configuration and shared-pattern versions. Reuse is valid only while none of those dependencies has changed in a way that affects the claim. A code/rule/provider-configuration change invalidates affected evidence and requires the smallest sufficient recheck. Provider behavior and deployment parity are separate facts from a local passing test.

For touched integrations, first assess and extend existing synthetic provider fakes/fixtures. The harness must support failure injection for relevant cases such as commit-then-timeout, malformed/business-error response and repeated/out-of-order delivery. Add a minimal fixture only when no suitable one exists; do not require a new framework or real customer transaction to test failure behavior.

### Release evidence and measures

- Before claiming an action covered: all its mandatory prerequisites, completion states and applicable acceptance scenarios have fresh passing evidence; none has an unresolved unsafe duplication, forbidden write or false-completion finding.
- Coverage measure: verified action/entry-point pairs divided by inventoried pairs, with roles/products and exclusions shown. Discovery remains open until checked against actual routes, jobs, integrations and authoritative write paths.
- Recovery measure: every inventoried partial/unknown/late state has a tested owner and escalation path; track overdue and unresolved operations without personal content.
- Usability measure: in an observed synthetic scenario, a nontechnical participant can explain the problem and take the intended next step without interpreting a technical code. Record observations rather than inventing a usability score or guaranteeing comprehension.
- Incident measure: track false completion, silent failure, lost work and duplicate effects separately. Passing checks is not a promise of zero future incidents; incidents update the action contract and regression coverage.

## 8. Adoption in existing and new applications

| Existing application | New application |
| --- | --- |
| Inventory existing actions, entry points, known incidents and safeguards before changing behavior. | Include the action contract when specifying each user story and integration. |
| Rank by real harm and exposure; prioritize money/documents, sensitive data, external sends, destructive actions and core workflows as applicable. | Reuse the product's validators, state patterns, accessible components and authoritative enforcement from the first implementation. |
| Reproduce the relevant behavior with synthetic regression cases; identify rules that are intentionally permissive today and obtain required product/domain approval for changes. | Define draft/final rules, real completion evidence, failure states and recovery ownership before building the happy path. |
| Implement bounded slices; test pending/history compatibility and observe synthetic failures before controlled release. Record verified and uncovered scope separately. | Release only with the applicable behavioral, accessibility, concurrency and recovery evidence. |
| Continue until the inventory is covered; preserve the gate for subsequent changes and reconcile the inventory when new surfaces are discovered. | Maintain the inventory with every new action, channel and material rule change. |

## 9. Existing tools and implementation boundaries

Prefer the application's current validation, form, query, error, storage and observability tools when they meet the contract. Existing form/schema validation, authoritative server/database protections and operation tracking are starting points to assess, not proof of complete coverage. Discover the target project's actual tools rather than assuming any framework, provider or backend. No dependency installation is required by this specification.

Skills such as [zod-skill](https://github.com/anivar/zod-skill) and [form-builder](https://github.com/danielmeppiel/form-builder) guide development; they do not enforce runtime behavior. Shared schemas and error presentation reduce drift, but domain-specific prerequisites, execution integrity and recovery still need implementation. Do not introduce a universal rules engine, new state framework or new telemetry solely to satisfy this document without evidence that existing mechanisms are insufficient.

## 10. Sources and interpretation

Sources were reviewed during the requirements discussion on 2026-10-26. This document is a product-policy synthesis; no source below independently mandates every provision for every app.

- [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html): syntactic/semantic validation and authoritative server checks. It does not define an application's business rules.
- [OWASP Transaction Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html): server enforcement and execution-linked state/authorization checks. Generalizing those principles to other mutable prerequisites is an engineering decision.
- [W3C WCAG 2.2 input assistance](https://www.w3.org/WAI/WCAG22/quickref/#input-assistance): textual error identification and correction suggestions; prevention requirements have defined scope and alternatives. Direct repair navigation and Hebrew wording here are product requirements, not claims of a universal WCAG mandate.
- [Stripe advanced error handling](https://docs.stripe.com/error-low-level): a concrete example of uncertain external effects and reconciliation. Its provider-specific retry rules do not automatically apply to a different integration.
- [Zod](https://github.com/colinhacks/zod) and [React Hook Form resolvers](https://github.com/react-hook-form/resolvers): existing technical building blocks; local compatibility and actual usage must be checked before changes.
