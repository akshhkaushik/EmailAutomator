# Contribution Opportunity Engine

## Purpose

The Contribution Opportunity Engine answers:

> What could Aksh concretely build or contribute that would be useful to this startup?

It generates bounded hypotheses, not assertions about a startup's private systems or roadmap. Every suggestion must be caused by public evidence, match a capability demonstrated in Aksh's Phase 3 project catalog, and fit a small proof-of-value scope. The engine does not call an LLM, generate code, create pull requests, modify external repositories, draft email, or send Gmail messages.

```text
Startup Evidence
  + StartupIntelligence
  + Hiring / Technical Signals
  + OpportunityScorecard
  + AkshCapabilityProfile
                  ↓
      ContributionOpportunity[]
                  ↓ explicit user action
      approve / reject / build specification
```

## Architecture

The deterministic domain module is under `lib/contributions`:

- `types.ts` defines opportunities, evidence references, score components, statuses, and build specifications.
- `config.ts` contains the version, minimum startup score, suggestion limit, and contribution-score weights.
- `engine.ts` detects evidence-backed candidates, matches projects, estimates effort, calculates score/confidence, and prevents duplicates.
- `build-spec.ts` creates a bounded build-before-ask specification.
- `transitions.ts` enforces workflow state changes.
- `repository.ts` isolates persistence.
- `memory-repository.ts` supports deterministic tests.
- `redis-repository.ts` stores durable workflow state in the existing Upstash Redis service.
- `service.ts` orchestrates startup retrieval, intelligence/evidence loading, Phase 3 scoring, detection, and persistence.
- `validation.ts` validates status-update API input.

The subsystem extends the existing modular monolith. It adds no dependencies and does not change the Gmail pipeline.

## ContributionOpportunity model

Each stored opportunity contains:

- stable `id` and `startupId`;
- flexible `type`, title, problem hypothesis, proposed solution, and expected impact;
- embedded evidence references with ledger ID, claim, value summary, source, URL, observation time, and confidence;
- matched project IDs/names/URLs and the exact overlapping capability concepts;
- relevant skills derived only from those matched concepts;
- estimated difficulty and integer effort hours;
- `contributionScore`, its five-part breakdown, and separate confidence;
- workflow status;
- optional build-before-ask specification;
- engine version and timestamps.

Stable IDs are SHA-256 fingerprints of startup, detector key, and sorted evidence IDs. Running the same engine over unchanged evidence therefore reuses the same opportunity rather than creating duplicates. Persistence preserves reviewed status and an existing build specification during regeneration.

## Opportunity taxonomy

The current detectors can suggest:

- SDK or API integration starter, when public developer information is evidenced;
- AI/ML evaluation harness, when sourced product text explicitly indicates AI or applied ML;
- inspectable data, document, or geospatial pipeline, when the sourced product depends on those domains;
- narrow interactive launch demo, when a recent launch and a compatible public product surface are both evidenced;
- auditable workflow validator, when public product evidence combines fintech with compliance or audit concerns.

The taxonomy is deliberately small and extensible. A startup is not forced into a category. Hiring evidence currently strengthens relevant product/launch candidates; a job listing alone does not establish a specific internal problem.

## Evidence requirements

Generation requires all of the following:

1. A current Phase 2 intelligence record.
2. A Phase 3 startup opportunity score of at least 55 (initially B tier).
3. At least one evidence-ledger record directly used by a detector.
4. At least one matching demonstrated project capability.

Candidates with missing evidence or no project match are discarded. Evidence references are resolved against the current ledger; unknown IDs are removed.

The problem text distinguishes observation from hypothesis. For example, public API evidence can justify a TypeScript integration starter, but it cannot justify saying that the startup lacks an SDK. The generated text explicitly says current SDK coverage is unknown.

## Project matching

Matching reuses the formal `AKSH_CAPABILITY_PROFILE` introduced in Phase 3. Candidate concepts are compared against each project's technologies, problem domains, demonstrated capabilities, and description using the controlled Phase 3 concept vocabulary.

Matches require at least one shared concept. Results retain the exact concepts and prefer broader overlap; maturity only breaks otherwise equal matches. Learning and prototype work remains labeled in the catalog and is never promoted into an unsupported production claim.

`relevantSkills` is derived from matched concepts. The engine does not inspect arbitrary personal data or invent capabilities outside the catalog.

## Effort and difficulty

Detectors assign a fixed, reviewable effort estimate appropriate to their bounded scope. Initial difficulty labels are:

- small: up to 12 hours;
- moderate: 13–24 hours;
- ambitious: more than 24 hours.

Contribution scoring rewards small demonstrations without making large work impossible:

- up to 8 hours: effort-fit 100;
- 9–16 hours: 90;
- 17–24 hours: 75;
- 25–40 hours: 55;
- more than 40 hours: 30.

Current built-in suggestions range from 12 to 24 hours.

## Contribution scoring

`contribution-v1` uses configurable weights totaling 100:

| Component | Weight |
| --- | ---: |
| Evidence strength | 30% |
| Relevance to startup | 25% |
| Relevance to Aksh | 20% |
| Effort fit | 10% |
| Expected impact | 15% |

Evidence strength combines evidence confidence and a capped corroboration benefit. Startup relevance and expected impact are deterministic detector constants representing signal specificity and the bounded artifact's plausible utility. Aksh relevance derives from the number of distinct matched capability concepts. Effort fit uses the bands above.

```text
contributionScore = round(sum(component × configured weight / 100))
```

Opportunity confidence is separate:

```text
confidence = 55% evidence strength
           + 25% startup relevance
           + 20% Aksh relevance
```

Confidence labels are high at 75+, medium at 45–74, and low below 45. The UI always displays the score, confidence, explanation, component values, and evidence.

## Status workflow

Supported states are:

```text
suggested → approved → building → built
     └──────────────→ rejected
rejected → suggested
```

The current UI exposes the requested Approve and Reject actions. `building` and `built` are supported domain states for Phase 6 workflow integration. Invalid jumps such as `suggested → built` are rejected. Repeating the current status is idempotent.

## Build-before-ask specification

`Generate Build Spec` creates and stores a specification containing:

- problem;
- bounded scope and explicit exclusions;
- proposed implementation steps;
- public/synthetic inputs;
- outputs;
- acceptance criteria;
- estimated effort;
- evidenced public APIs, when available;
- a short potential demo plan.

The spec requires fixture provenance, deterministic tests, failure handling, setup documentation, source attribution, and no private data or production credentials. It explicitly excludes production deployment and external repository modifications. Generation does not change opportunity status.

## API and UI

Protected endpoints use the same verified owner identity and private no-store responses as discovery/intelligence:

- `GET /api/startups/:id/contributions` lists saved opportunities.
- `POST /api/startups/:id/contributions` deterministically regenerates and upserts suggestions.
- `PATCH /api/startups/:id/contributions/:opportunityId` applies a validated status transition.
- `POST /api/startups/:id/contributions/:opportunityId/build-spec` generates and stores the bounded specification.

The startup detail page shows contribution score, confidence, effort, why it matters, proposed solution, expected impact, evidence sources, project/skill fit, score components, workflow status, and the build specification. It provides Approve, Reject, and Generate Build Spec actions.

## Limitations

- Detection uses a conservative hand-authored taxonomy; valid ideas outside supported signals remain absent rather than guessed.
- Startup relevance and expected-impact values are deterministic rubric inputs, not measured outcomes.
- Opportunities are not automatically deleted when a later run produces fewer candidates. Their cited evidence remains inspectable and reviewed decisions are preserved.
- The engine does not inspect a startup repository, documentation coverage, issue tracker, private roadmap, or internal architecture.
- Build specifications are plans only and do not create code or external changes.
- User notes, editing, `building`/`built` UI controls, and outcome learning remain future work.

## Recommended next phase

Proceed to Phase 5 — Outreach Integration. Allow an explicitly approved contribution opportunity to be selected as grounded input to the existing editable outreach draft, while preserving exact evidence links and the existing one-recipient human approval before Gmail sending. Do not auto-send or treat an opportunity approval as email approval.
