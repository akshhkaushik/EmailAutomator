# Startup Opportunity Scoring

## Purpose

The opportunity score answers one narrow question: **how worthwhile is it for Aksh to spend time pursuing this startup?** It is not a valuation, investment recommendation, or generic assessment of company quality.

The engine is deterministic. It consumes the structured intelligence and evidence ledger created in Phase 2, applies a versioned configuration, and returns a scorecard with seven explained factors. It does not call an LLM, crawl a website, or generate outreach.

```text
StartupIntelligence + EvidenceLedger + AkshCapabilityProfile + ScoringConfig
                                  ↓
                         OpportunityScorecard
                  score + confidence + tier + factors
```

## Domain architecture

The implementation lives in `lib/scoring` rather than UI components:

- `types.ts` defines scorecards, factors, tiers, configuration, and the structured project profile.
- `config.ts` contains the initial weights, funding bands, team bands, tier thresholds, and configuration validation.
- `capability-profile.ts` formalizes all 28 existing catalog projects.
- `concepts.ts` maps sourced company/product text and project metadata into a small controlled capability vocabulary.
- `dimensions.ts` contains independently testable scoring functions.
- `engine.ts` aggregates factors, confidence, and tiers.
- `service.ts` ranks discovered startups without coupling scoring to Redis or UI code.

Scores are derived on read from the current intelligence and configuration. They are not persisted in Phase 3, which prevents stale scorecards after evidence or configuration changes. Historical `ScoreRun` persistence and version comparison can be added when user overrides and learning are introduced.

## Configuration

The initial `opportunity-v1` weights total 100:

| Dimension | Weight |
| --- | ---: |
| Funding momentum | 20% |
| Team-size leverage | 15% |
| Product / technical fit | 20% |
| Founder accessibility | 15% |
| Hiring signal | 10% |
| Contribution opportunity potential | 15% |
| Recent company momentum | 5% |

Weights, funding bands, team bands, and tier thresholds are values in `DEFAULT_OPPORTUNITY_SCORING_CONFIG`. `validateScoringConfig` rejects weights that do not total 100, negative weights, and invalid tier ordering.

Each dimension produces a normalized 0–100 value. Its displayed points are:

```text
earnedPoints = dimensionScore × dimensionWeight / 100
overallScore = round(sum(earnedPoints))
```

The displayed factor points retain one decimal place; the overall score is an integer. This is presentation precision, not a claim that the underlying observations are exact.

## Dimension behavior

### Funding momentum

The scorer uses only `daysSinceLatestFunding` and its linked funding-round evidence:

| Funding age | Normalized score |
| --- | ---: |
| 0–30 days | 100 |
| 31–60 days | 85 |
| 61–90 days | 70 |
| 91–180 days | 50 |
| More than 180 days | 20 |
| Missing or future-dated | 0 / unknown |

Day, month, and year precision do not manufacture a more exact date. Instead, coarser funding dates reduce factor confidence.

### Team-size leverage

Team size is a soft signal. The configured bands initially favor 2–10, then taper rather than rejecting larger teams. A one-person company is not automatically treated as ideal.

For an estimated range, the engine computes the average configured score over the entire integer range. It does not select a favorable endpoint. Wider or conflicting observations reduce confidence based on range width and source confidence.

### Product / technical fit

Fit compares sourced company description, industry, product description/category, and developer-resource labels with Aksh's structured project catalog.

Every catalog project has:

- name and description;
- technologies;
- problem domains;
- demonstrated capabilities;
- repository and demo URLs where available;
- the existing maturity label.

A controlled concept vocabulary recognizes areas such as AI workflows, applied ML, full-stack products, frontend, data pipelines, developer tools, evidence systems, fintech, compliance, document processing, geospatial work, Web3, security, systems work, mobile, marketplaces, and visualization. Matching is deterministic and does not use arbitrary personal data or model-generated biography.

One matched concept is a weak overlap, while several distinct concepts indicate stronger fit. The scorecard retains up to three strongest project matches and the exact matched concepts. Project maturity breaks otherwise equal matches so stronger existing work is explained first; it does not create a match by itself.

### Founder accessibility

This factor uses identified founders, their explicitly sourced roles, and public profile URLs. A technical role can increase relevance. The engine does not infer that a profile is active, that a founder will reply, or that a missing profile means the founder is inaccessible.

### Hiring signal

Explicit open technical roles are the strongest signal. A public recent hiring announcement is a weaker signal. Missing evidence produces an unknown factor with zero confidence rather than a claim that the company is not hiring.

### Contribution opportunity potential

This Phase 3 factor only detects whether an investigation surface may exist. It combines capability overlap with explicit developer information, technical hiring, and recent launches. It does not invent an internal need or propose a contribution. The full contribution engine remains Phase 4.

### Recent company momentum

The factor uses explicit recent product-launch and hiring evidence. Evidence retrieval time is not treated as event time. Missing activity evidence remains unknown.

## Explainability and attribution

Every factor contains:

- normalized score;
- earned and maximum weighted points;
- factor confidence;
- human-readable reason;
- supporting evidence IDs;
- matched catalog projects where relevant.

Evidence IDs are filtered against the current ledger before being returned. The detail UI resolves them to the original source name and URL. A score is therefore always accompanied by its factor breakdown and a path back to public evidence.

## Score confidence

`score` and `scoreConfidence` are separate outputs. Confidence uses the same dimension weights but aggregates factor confidence instead of factor score:

```text
scoreConfidence = round(sum(factorConfidence × dimensionWeight / 100))
```

Phase 2 evidence confidence maps to high, medium, and low numeric inputs. Missing factors contribute zero confidence. Date precision, conflicting team ranges, and sparse product concepts can lower confidence further. Labels are:

- high: 75–100;
- medium: 45–74;
- low: 0–44.

A high score with low confidence is intentionally possible and visible.

## Tiers

Initial configurable thresholds are:

| Tier | Score |
| --- | ---: |
| S | 85–100 |
| A | 70–84 |
| B | 55–69 |
| C | Below 55 |

Tiers are ranking shortcuts, not hidden decision rules or outreach approval.

## API and UI

`GET /api/opportunities` returns filtered startups with their current scorecards and the public scoring configuration summary. It accepts the existing `acceleratorId` and `cohortId` filters and requires the same verified owner identity as discovery and intelligence.

`GET /api/startups/:id/intelligence` now includes the startup's derived scorecard beside intelligence, evidence, and research runs.

The discovery dashboard provides:

- descending score ranking by default;
- alternate confidence and name sorting;
- accelerator, cohort, and S/A/B/C tier filters;
- score, tier, and score confidence;
- expandable factor explanations for every displayed score;
- links to the full evidence and score detail.

The startup detail page shows all seven factors, weighted points, reasons, confidence, evidence sources, and matched project links.

## Determinism

For the same `StartupIntelligence`, evidence ledger, project profile, and configuration version, factor scores and aggregation are reproducible. The intelligence `builtAt` timestamp is carried for traceability but is not used to alter the score.

No network request, current clock read, random value, LLM, or UI state participates in scoring. Funding freshness is calculated by the Phase 2 intelligence builder before the score is produced.

## Limitations

- Missing evidence currently produces zero factor points and zero confidence. The explanation distinguishes unknown from observed negative evidence.
- The controlled concept taxonomy is deliberately small and may miss valid semantic overlap expressed in unfamiliar language.
- Founder accessibility measures only explicit public contact surfaces, not responsiveness or recent activity.
- Company momentum is limited by the Phase 2 sources and does not infer event dates from retrieval timestamps.
- Scorecards are derived on read; historical comparisons, manual overrides, and saved rubric variants are not yet implemented.
- Contribution potential is a signal for Phase 4 investigation, not a generated opportunity.

## Next phase

Phase 4 should build the Contribution Engine on top of high-interest scorecards. It should produce narrow, evidence-backed possible contributions, preserve uncertainty, link each idea to a credible structured project/capability match, and require human review. It must not change Gmail generation or sending safeguards.
