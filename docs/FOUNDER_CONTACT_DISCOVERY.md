# Founder Contact Discovery

## Purpose

This subsystem connects a qualified discovered startup to a professional founder recipient without converting a guessed address into a fact.

```text
Accelerator shortlist → cohort/portfolio discovery → research and scoring
→ evidence-backed founder + company domain → candidate patterns
→ provider verification and provenance → personalized draft → human review → Gmail
```

## Inputs and constraints

- Startup selection remains driven by the existing deterministic opportunity score, confidence, tier filters, and evidence ledger.
- A contact lookup requires a normalized startup domain and a founder identified by public evidence.
- At most five evidence-backed founders are checked per request. The endpoint is owner-authenticated and rate-limited to five runs per minute.
- No social-network private data, credentials, or arbitrary supplied identities are used.

## Pattern candidates

The local engine ranks a bounded deterministic order: `first@domain`, `first.last@domain`, `firstlast@domain`, `flast@domain`, `f.last@domain`, and then lower-probability last-name variants. The first five checks run concurrently to stay within serverless execution limits, but selection always chooses the earliest safely deliverable result in that ranking. Each attempted candidate retains its rank, status, confidence, and timestamp. An unverified combination is not a usable recipient and is stored with `unverified`/`unresolved` status.

## Provider order and stored-contact reuse

The direct-link workflow first checks successful send history for an exact normalized founder-name and company-domain match. A match reuses that address without spending another provider credit. It never reuses an address across a different founder or domain.

When `SNOV_CLIENT_ID` and `SNOV_CLIENT_SECRET` are configured, Snov.io is the primary external adapter. The server obtains a short-lived access token, submits one name-and-domain lookup, polls only that bounded task, and maps the returned SMTP status into the local verification model. It retains:

- returned address and pattern;
- public versus inferred origin;
- verification status and timestamp;
- confidence score;
- public source URLs and observation dates.

The credentials and access token are server-only and are never returned to the UI or logged. `HUNTER_API_KEY` remains a backwards-compatible fallback only when both Snov.io variables are absent.

## Outreach gating

- `valid`: selectable.
- `accept_all`: selectable only at confidence 85 or higher.
- `unknown`, `invalid`, `unverified`, or unresolved: not automatically selectable.
- A draft associated with a discovered contact stores the contact ID. Its recipient cannot be silently edited during claim validation.
- Drafting never sends. Evidence validation, résumé attachment, explicit review, and the existing Gmail send button remain mandatory.

## Limitations

Email verification is probabilistic and can become stale. Catch-all domains cannot prove that an individual mailbox exists. Provider absence or failure produces no verified recipient rather than a guess. Users may still type a manual address into the legacy workflow; that manual path remains clearly separate from discovered-contact provenance.
