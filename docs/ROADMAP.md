# EmailAutomator Evolution Roadmap

This roadmap evolves the existing review-first outreach application into a personal startup intelligence and opportunity discovery system. It is additive: preserve working Gmail send, editing, résumé attachment, self-test suppression, tracking caveats, and explicit human approval throughout.

## Delivery principles

- Evidence before inference: every company claim, signal, score component, and opportunity links back to public evidence.
- Discovery never sends email. Research, scoring, drafting, approval, and sending remain separate states.
- Prefer a modular monolith and the existing Next.js application over a rewrite or premature services.
- Start with bounded, manually inspectable sources and schedules; do not crawl aggressively.
- Version derived artifacts so a changed source, prompt, heuristic, or score never silently rewrites history.
- Treat opens as approximate delivery telemetry, not proof of human interest.

## Phase 0 — Audit

**Goal:** Understand and stabilize the current system before architectural expansion.

**Deliverables:**

- Current architecture and exact workflow map.
- Dependency, data-model, security, testing, deployment, and technical-debt audit.
- Minimum target architecture and migration order.
- Follow-up hardening: characterization tests, complete server-side URL safety, authenticated/rate-limited research, model-output validation, and dependency advisory resolution.
- Extraction plan for research, matching, opportunities, provider orchestration, composition, MIME, and approval boundaries.

**Exit criteria:**

- Existing compose-to-Gmail behavior is covered by deterministic tests.
- Research cannot access internal/reserved destinations after DNS resolution or redirects.
- Research/AI resource usage is authenticated, rate-limited, and budgeted.
- One authoritative deployment/runtime and relational persistence direction is documented.
- Existing human approval behavior remains unchanged.

## Phase 1 — Startup Discovery

**Goal:** Build a deduplicated, inspectable pipeline of startup candidates from accelerators and explicitly configured public sources.

**Deliverables:**

- `Source`/`Accelerator`, `Organization`, `OrganizationSource`, and `DiscoveryRun` records.
- Source adapters that return candidate facts and URLs without triggering outreach.
- Canonical domains, aliases, deduplication, source attribution, and manual merge/reject controls.
- Conservative schedules, per-source budgets, caching, retry/backoff, and crawl/politeness controls.
- Discovery inbox showing new, duplicate, ignored, and accepted candidates.

**Exit criteria:**

- Every startup has at least one source and discovery timestamp.
- Re-running a source is idempotent and does not create duplicate companies.
- A user can inspect and approve candidates before deeper research.
- No discovery action can call Gmail.

## Phase 2 — Startup Intelligence

**Goal:** Convert bounded public research into durable evidence and typed, refreshable startup signals.

**Deliverables:**

- `ResearchRun`, `Evidence`, and `Signal` records with source URL, retrieval/published time, excerpt, content hash, confidence, and extractor version.
- Reusable bounded fetch/extraction service based on the current direct/Jina fallback behavior.
- Typed signals for funding, hiring, launches, founder activity, team size, accelerator status, product direction, and other visible momentum.
- Freshness/staleness policy, conflict handling, and human correction controls.
- Intelligence view that separates source facts from derived interpretations.

**Exit criteria:**

- Every signal cites one or more evidence records.
- Stale and conflicting signals are visible rather than silently overwritten.
- Prompt-injection and runtime-output validation tests pass.
- Research can be refreshed without losing previous versions.

## Phase 3 — Opportunity Scoring

**Goal:** Rank startups transparently for Aksh using evidence-backed, versioned criteria.

**Implementation status:** Initial deterministic `opportunity-v1` engine delivered. It includes the seven requested weighted dimensions, a structured version of all 28 catalog projects, separate score confidence, configurable tiers, source-linked explanations, and sortable/filterable ranking. Historical score runs, user overrides, and version comparison remain deferred until they have a persistence and feedback use case.

**Deliverables:**

- `ScoreRun` and `ScoreComponent` records.
- Initial deterministic rubric covering momentum, product/skill fit, contribution accessibility, evidence quality/freshness, and outreach timing.
- User-adjustable weights and explicit exclusions/hard constraints.
- Score explanation showing each component, supporting signals, missing information, and uncertainty.
- Side-by-side ranking and score-version comparison.

**Exit criteria:**

- Identical inputs and rubric versions reproduce the same score.
- A score can be explained without relying on hidden model prose.
- Missing evidence lowers confidence instead of becoming a fabricated neutral/positive signal.
- Aksh can override rankings and record why.

## Phase 4 — Contribution Engine

**Goal:** Identify one or more concrete, credible ways Aksh could help each promising startup.

**Implementation status:** Initial deterministic `contribution-v1` engine delivered. It requires B-tier-or-higher startup scores, direct evidence, and demonstrated catalog matches; produces scored small-scope hypotheses; persists review status; and generates bounded build-before-ask specifications. User-authored opportunity editing and measured outcome learning remain future work.

**Deliverables:**

- Persisted, versioned project/capability catalog seeded from the current 28 researched projects.
- `ContributionOpportunity` and `ProjectMatch` records.
- Opportunities state the observed problem/priority, target user, narrowly scoped contribution, expected benefit, effort, evidence, and uncertainty.
- Project matching uses skills, maturity, relevance, and evidence rather than title-token overlap alone.
- Accept/reject/edit feedback and reason capture.

**Exit criteria:**

- Every opportunity cites company evidence and at least one credible capability/project match or explicitly states the gap.
- Learning/prototype projects cannot be presented as production evidence.
- Proposed contributions are small enough to prototype and do not invent internal company needs.
- User feedback is stored for later ranking improvements.

## Phase 5 — Outreach Integration

**Goal:** Feed an approved startup opportunity into the existing personalized, review-first Gmail workflow.

**Implementation status:** Delivered with structured context, three proof-gated modes, deterministic concise generation, claim-level evidence validation, immutable generation metadata, editable review, and a server-side pre-Gmail validation guard. The legacy URL-based composer remains supported.

**Deliverables:**

- `OutreachDraft`, `OutreachApproval`, `OutreachMessage`, and append-only outreach event records.
- Draft generation that consumes the selected evidence, opportunity, recipient, and project matches.
- Citation/grounding checks for company-specific claims before review.
- Existing editable preview, résumé requirement, tracking choice, Gmail OAuth, MIME renderer, and single-recipient send reused.
- Approval bound to the exact recipient, subject, body version, and attachment metadata sent.

**Exit criteria:**

- Discovery, intelligence, scoring, and contribution jobs cannot send.
- Only an explicit user action from the review surface can approve/send one message.
- The sent record retains the exact approved content and inputs.
- Existing self-test and tracking safeguards continue to pass end-to-end tests.

## Phase 6 — Build-Before-Ask

**Goal:** For selected opportunities, create a small proof of value before outreach when doing so is ethical, public-data-safe, and genuinely useful.

**Implementation status:** Delivered for approved S-tier opportunities with a durable BuildSpec state machine, explicit evidence/assumption separation, validated user-provided proof URLs, and proof-based outreach gating. No external repository automation is included.

**Deliverables:**

- `BuildProposal`/artifact record linked to an opportunity, evidence, scope, repository/demo, status, and user approval.
- Checklist for public-data rights, security, brand/IP boundaries, time budget, and explicit exclusions.
- Small artifact workflow: proposal → user approval → build → verify → attach/reference in outreach.
- Outreach language that describes the artifact accurately without implying endorsement or access to private systems.

**Exit criteria:**

- No build begins solely because a score is high; Aksh approves scope and time budget.
- Artifacts use only authorized/public data and contain no secrets or impersonation.
- Every claim about the artifact is testable and linked to the actual repository/demo.
- The original contribution opportunity remains useful even if the build is skipped.

## Phase 7 — Follow-up & Learning

**Goal:** Track outcomes, manage respectful follow-ups, and improve future rankings/opportunities from reliable feedback.

**Implementation status:** Initial outcome records, reply classification, Day 4/10/21 approval-only recommendations, segmented rates with sample sizes, and human-review-only learning suggestions are delivered. Automated reply ingestion and automatic score changes remain intentionally absent.

**Deliverables:**

- Outcome events for sends, approximate opens, replies, bounces, follow-ups, calls/interviews, contributions, rejection, no response, and manual notes.
- Gmail/thread integration only with newly approved scopes and a clear migration/consent step if reply detection is automated.
- User-approved follow-up queue with frequency caps, stop conditions, and editable drafts.
- Funnel analytics by source, score band, signal, opportunity type, project match, and message version.
- Versioned learning process that prioritizes replies/conversions and explicit feedback over opens.

**Exit criteria:**

- Follow-ups never send automatically and stop after reply/rejection/opt-out or configured limits.
- Outcome provenance distinguishes observed provider events from manual labels and inference.
- Ranking changes can be explained and rolled back by version.
- Retention, deletion, and export controls cover research, recipient, outreach, and analytics data.

## Phase 8 — Production Hardening & Quality

**Goal:** Make the feature-complete workflow secure, observable, idempotent, testable, and operable without adding product scope.

**Implementation status:** Delivered with consistent owner authorization, DNS-aware SSRF protection, bounded requests, rate limits, job locks/status, retry boundaries, prompt-injection separation, stricter LLM grounding, send/outcome idempotency, structured privacy-safe logs, browser security headers, expanded critical-path tests, and security/operations runbooks.

**Exit criteria:**

- Lint, type checking, all unit tests, and the production build pass.
- Public web content remains untrusted and cannot override model instructions.
- Duplicate discovery, research, evidence, Gmail sends, outcomes, and follow-up recommendations are prevented or safely replayed.
- Gmail remains single-recipient and explicit-review-only.
- Production requires owner allowlisting and durable Redis configuration.

## Recommended sequence now

Run a controlled staging exercise with production-like Google OAuth and Redis configuration, using a self-test Gmail recipient and fixture accelerator. Confirm logs, failure alerts, backup/export, and rollback procedures before changing production traffic. Do not add automated sending or automatic scoring-weight changes.
