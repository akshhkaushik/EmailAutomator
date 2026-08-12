# Startup Intelligence and Evidence Layer

## Scope

Phase 2 adds the evidence-first pipeline:

```text
Startup → Research adapters → Evidence ledger → Derived StartupIntelligence
```

The subsystem attempts to collect public company, funding, team, founder, product, technical, hiring, and activity information. Missing or unsupported facts remain `unknown`. It does not calculate opportunity scores, select outreach targets, generate email, or send email.

## Core invariant

No factual value enters `StartupIntelligence` directly from an adapter or model. Adapters first create source-attributed `Evidence`; the deterministic intelligence builder then derives its view only from persisted evidence IDs.

An intelligence field contains:

- `value`, or the literal `unknown`
- the supporting `evidenceIds`
- evidence/derivation confidence

The detail UI links every populated important field back to the source records in the evidence ledger.

## Evidence model

`lib/intelligence/types.ts` defines the first-class `Evidence` entity:

| Field | Meaning |
| --- | --- |
| `id` | Stable evidence record ID |
| `startupId` | Startup being observed |
| `category` | One of `company`, `funding`, `team`, `founder`, `product`, `hiring`, `technical`, `activity` |
| `claim` | Small supported claim vocabulary such as `company.location`, `team.size`, or `funding.round` |
| `value` | JSON-compatible structured value copied/extracted from the source |
| `sourceName` | Human-readable source label |
| `sourceUrl` | Exact retrieved or discovery source |
| `observedAt` | First observation time for this source/value |
| `confidence` | `high`, `medium`, or `low` |
| `metadata` | Extraction method, supporting text, structured-data flag, and `lastObservedAt` |

The claim vocabulary is intentionally small and category-checked. New claims should be added only when a real adapter and intelligence consumer need them.

### Evidence ledger and idempotency

`EvidenceLedger` writes through `IntelligenceRepository`. An evidence fingerprint is the SHA-256 hash of:

```text
startup + category + claim + canonical JSON value + source URL
```

Observation time and confidence are not part of identity. Re-running unchanged research:

- reuses the existing evidence ID
- preserves the original `observedAt`
- updates `metadata.lastObservedAt`
- retains the stronger confidence if extraction confidence improves

A changed value creates a new historical evidence record. This preserves source changes without producing uncontrolled duplicates.

## Research runs and persistence

Every explicit research action creates a `ResearchRun` with source IDs, status, evidence IDs, source errors, and start/completion timestamps. Status is:

- `completed`: every configured source finished
- `partial`: at least one source succeeded and at least one failed
- `failed`: all configured sources failed

Evidence, research runs, and the current derived intelligence view are stored through `IntelligenceRepository`. Production uses the existing Upstash Redis service under `signal:intelligence:*`; deterministic tests use `InMemoryIntelligenceRepository`. Records do not expire with outreach analytics.

## Source adapter architecture

Adapters implement:

```ts
interface StartupResearchSource {
  readonly id: string;
  collect(input: ResearchSourceInput): Promise<EvidenceDraft[]>
}
```

`ResearchSourceInput` contains the startup, its primary accelerator/cohort records, and a request-local `ResearchContext`. The context caches fetched documents, so multiple adapters requesting the company homepage share one guarded request.

### Implemented adapters

#### AcceleratorSource

Uses existing Phase 1 provenance without a new network request. It records:

- accelerator/cohort membership
- portfolio description, when present
- portfolio location, when present

The original accelerator/cohort source URL and discovery timestamp are retained.

#### CompanyWebsiteSource

Reads the startup homepage and extracts only explicit public content:

- meta or JSON-LD company description
- JSON-LD industry, address, founding year, and exact employee count
- JSON-LD Person records for founders/roles/profile URLs
- JSON-LD product/application description and category
- explicit same-origin developer/API documentation links
- launch statements only when the page says they are recent or includes the current/previous year
- strict funding sentences containing a funding/round verb plus an explicit amount or round type

Supporting page text is stored in evidence metadata for heuristic launch/funding extraction.

#### JobsSource

Uses the cached homepage to locate one explicit same-origin careers/jobs link, then fetches at most that one page. It records:

- recognizable technical role titles
- explicit engineering/technical hiring announcements

The adapter does not follow job-detail links or paginate.

### Deferred adapters

Dedicated funding databases/news providers, GitHub organization APIs, LinkedIn, and other company-data services are not implemented because the repository has no appropriate authenticated integration. Their future adapters must produce the same evidence contract and must not bypass the ledger.

## Responsible retrieval

Research reuses the guarded Phase 1 public-page boundary:

- HTTP(S) only; no credentials in URLs
- public DNS/IP validation for destinations and redirects
- `robots.txt` checks for each requested page/redirect
- at most three redirects
- ten-second page timeout and one-megabyte HTML cap
- inert HTML/JSON parsing; scripts are never executed
- request-local caching
- at most the homepage plus one same-origin jobs page
- five research runs per verified account per minute

No live browser, recursive crawl, Jina fallback, or private/authenticated page access is used.

## Research orchestration

`researchStartup` performs:

1. Load the persisted startup and its primary accelerator/cohort.
2. Create a running `ResearchRun`.
3. Execute the configured adapters through a shared cached context.
4. Capture source failures without discarding successful source results.
5. Upsert adapter drafts into `EvidenceLedger`.
6. Read the complete startup ledger, including historical observations.
7. Deterministically build `StartupIntelligence`.
8. Save the current intelligence view and complete the research run.

Running the same fixture research twice creates two auditable runs but one evidence record for each unchanged fact.

## Structured intelligence

### Company

- description
- industry/category
- location
- founded year

For scalar conflicts, the builder selects the highest-confidence evidence, breaking equal-confidence ties by observation time. Conflicting records remain visible in the ledger.

### Funding

`funding.round` evidence stores round type, amount, normalized date, and investors when explicitly present. Missing members are `unknown` or empty at the evidence boundary and become `unknown` in intelligence.

Dates normalize with precision:

- `YYYY-MM-DD` → day
- `YYYY-MM` or `Month YYYY` → month, represented by the first day
- `YYYY` → year, represented by January 1

The current view selects the most recent **dated public round** and exposes `datePrecision`. `daysSinceLatestFunding` is deterministically calculated from its normalized date and cites the same evidence. Undated funding evidence remains visible but cannot produce freshness.

### Team

Team observations are never collapsed into one authoritative count. The current view keeps the latest observation per source URL/name, for example:

```text
Company website: 6
Public directory: 7
Derived estimate: 6–7 (estimate)
```

The estimate is labeled `estimate`, cites all observations, and is never high confidence. Two close observations produce medium confidence; otherwise the estimate is low confidence. No observations produce `unknown`.

### Founders

Founder name, role, and profile URL are collected only from explicit structured Person data in implemented sources. Missing role/profile members remain `unknown`.

### Product and technical information

- structured product description/category
- evidence-backed recent launch statements
- explicit public developer/API links

### Hiring

- open technical role titles on the selected jobs page
- explicit engineering hiring statements
- `engineeringActivity: observed` only when at least one supported role/announcement exists

No hiring evidence produces `unknown`, not a negative conclusion.

## Confidence model

- **High**: explicit structured data or an exact public role/resource link.
- **Medium**: page metadata, a constrained page-text extraction with supporting text, or a grounded LLM extraction.
- **Low**: weak but still source-backed observations or derived estimates with limited agreement.

Confidence expresses extraction/support quality, not truth certainty. A high-confidence record can still conflict with another source; both remain in the ledger.

## Conflict resolution

- Scalar fields: highest confidence, then latest observation.
- Team size: preserve per-source observations and derive a labeled range.
- Funding: most recent normalized dated round; undated records cannot determine freshness.
- Lists: deduplicate exact normalized values while retaining supporting evidence IDs.
- Changed source values: create new evidence; do not overwrite history.
- Missing/conflicting data that cannot be resolved safely: `unknown` or an explicitly labeled estimate.

## LLM boundaries

Phase 2 makes **no LLM calls** for startup intelligence. Deterministic sources are sufficient for the first implementation.

`validateLlmEvidenceOutput` defines the boundary for a future extraction adapter. It accepts a candidate only when:

- the category and claim are on the allowed category/claim map
- the source URL was actually retrieved in the current context
- a supporting quote is present verbatim after whitespace normalization in that retrieved document
- the value is JSON-compatible and is not `unknown`

Accepted LLM extraction is capped at medium confidence and receives the retrieved document's source name, URL, and timestamp. Unsupported quotes, invented URLs, mismatched categories, invalid values, and claims without evidence are rejected. This validator cannot prove semantic entailment by itself; future LLM adapters still require claim-specific validation and tests.

## APIs and UI

Protected API routes:

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/startups/[id]/research` | POST | Run bounded evidence collection and rebuild intelligence |
| `/api/startups/[id]/intelligence` | GET | Retrieve startup, current intelligence, evidence ledger, and recent research runs |

Both reuse the verified Google identity and optional `DISCOVERY_OWNER_EMAIL` allowlist from Phase 1.

The Discovery dashboard now offers **View intelligence** for each startup. The dedicated `/startups/[id]` detail page shows company, funding, team observations/estimate, founders, product, hiring, evidence sources, confidence, last researched time, and recent source failures. Research remains an explicit user action.

## Testing

Fixture and in-memory tests cover:

- evidence creation and source attribution
- duplicate evidence and changed-value history
- confidence promotion and scalar selection
- missing information returning `unknown`
- conflicting team observations and estimated ranges
- funding-date normalization and `daysSinceLatestFunding`
- research-run and evidence idempotency
- company/jobs adapter extraction from local HTML
- LLM source, quote, category/claim, and unknown-value validation

No test relies on a live website or model.

## Limitations

- Only accelerator provenance, a server-rendered homepage, and at most one same-origin jobs page are researched.
- Generic HTML/JSON-LD extraction cannot cover JavaScript-only or unconventional sites.
- Funding extraction from company page text is intentionally strict and incomplete; a dedicated reputable funding source adapter is still needed.
- Investor extraction supports only simple “led by” wording.
- “Latest round” means latest normalized dated public round in the ledger, not a guarantee that no newer undisclosed/undated round exists.
- Team estimates are source-observation ranges, not verified headcount.
- Founder activity, GitHub activity, and general news/activity feeds are not implemented.
- Research evidence is durable in Redis but should move behind a relational repository as the history/query model grows.
- The LLM validator is implemented and tested, but no LLM research adapter is enabled.
- Scoring is intentionally absent.

## Next phase

The exact next recommended phase is **Phase 3 — Opportunity Scoring**: create a deterministic, versioned scoring rubric that consumes evidence-backed intelligence, exposes every component and missing-data penalty, and never treats unknown information as a positive signal.
