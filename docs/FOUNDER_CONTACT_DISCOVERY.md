# Founder Contact Discovery

## Purpose

This subsystem connects a qualified discovered startup to a professional founder recipient without converting a guessed address into a fact.

```text
Accelerator shortlist → cohort/portfolio discovery → research and scoring
→ evidence-backed founder + company domain → candidate patterns
→ native evidence aggregation and provenance → personalized draft → human review → Gmail
```

## Inputs and constraints

- Startup selection remains driven by the existing deterministic opportunity score, confidence, tier filters, and evidence ledger.
- A contact lookup requires a normalized startup domain and a founder identified by public evidence.
- At most five evidence-backed founders are checked per request. The endpoint is owner-authenticated and rate-limited to five runs per minute.
- No social-network private data, credentials, or arbitrary supplied identities are used.

## Pattern candidates

The local engine ranks a bounded deterministic order: `first@domain`, `first.last@domain`, `firstlast@domain`, `flast@domain`, `f.last@domain`, and then lower-probability last-name variants. The first five checks run concurrently to stay within serverless execution limits, but selection always chooses the earliest safely deliverable result in that ranking. Each attempted candidate retains its rank, status, confidence, and timestamp. An unverified combination is not a usable recipient and is stored with `unverified`/`unresolved` status.

## Native public evidence

The engine follows at most four same-domain pages whose links indicate contact, team, founder, leadership, about, company, or people content. It extracts only syntactically valid addresses on the normalized company domain. An exact founder candidate that is publicly published and whose domain has a usable MX record is `valid` without an external provider.

Visible name/address pairings can teach the engine a likely company pattern and move that candidate earlier in the ordered review list. Pattern evidence and MX existence are deliberately insufficient to unlock sending because neither proves that the individual mailbox exists.

Every candidate retains a structured evidence list with the signal kind, source, explanation, score contribution, observation timestamp, and optional public URL. Missing MX records invalidate every candidate; transient DNS uncertainty keeps selection blocked.

## Optional provider adapters

Provider adapters implement the common `FounderEmailFinder` interface. Hunter is currently the first optional adapter. When configured, the server calls it for the five highest-ranked candidates and aggregates its result with native public and DNS evidence. It retains:

- returned address and pattern;
- public versus inferred origin;
- verification status and timestamp;
- confidence score;
- public source URLs and observation dates.

API keys are server-only and are never returned to the UI or logged. Provider failure becomes an unknown signal; it does not erase native evidence or make a guess usable.

## Outreach gating

- `valid`: selectable.
- `accept_all`: selectable only at confidence 85 or higher.
- `unknown`, `invalid`, `unverified`, or unresolved: not automatically selectable.
- Verifications expire after 90 days and must be refreshed before an audited send.
- A draft associated with a discovered contact stores the contact ID. Its recipient cannot be silently edited during claim validation.
- Drafting never sends. Evidence validation, résumé attachment, explicit review, and the existing Gmail send button remain mandatory.

## Limitations

Email verification is probabilistic and can become stale. Catch-all domains cannot prove that an individual mailbox exists. Public pages can also be stale, so the evidence retains observation timestamps and source URLs. Provider absence or failure does not disable native discovery, but insufficient evidence still produces no verified recipient rather than a guess. Users may still type a manual address into the legacy workflow; that manual path remains clearly separate from discovered-contact provenance.
