# Intelligence-to-Outreach Architecture

## Complete pipeline

```text
Startup discovery
  → bounded research
  → EvidenceLedger
  → StartupIntelligence
  → OpportunityScorecard
  → approved ContributionOpportunity
  → optional completed BuildSpec + user proof
  → OutreachContext
  → auditable draft
  → claim validation
  → human review
  → existing Gmail sender
  → Outcome
```

The legacy company-URL compose flow remains available and unchanged. The intelligence flow is additive and reuses the existing editable review surface concepts, résumé attachment, Gmail OAuth, MIME rendering, tracking, self-test handling, and explicit Send button.

## Structured OutreachContext

`OutreachContext` contains a compact startup record, sourced founders, selected signals, only the evidence needed by the opportunity, the approved opportunity, matched catalog projects, outreach mode, prior audited outreach history, and verified build proof when applicable. It does not include an unstructured website scrape.

When Gemini is configured, the outreach generator receives only the serialized structured context and must return schema-constrained subject, body, and claim/evidence-ID mappings. Without a configured model, the deterministic `outreach-v1` generator provides the same grounded structure. Provider prose never becomes evidence, and both paths pass through the same ledger validator.

## Outreach modes

- `contribution`: proposes the approved small contribution.
- `build_before_ask`: says a proof was built only when its BuildSpec is completed and proof is attached.
- `open_source`: says work was done only with completed proof and a GitHub, PR, documentation, or demo URL.

All modes require an approved contribution opportunity. Build modes cannot be selected successfully from API or UI until their proof gate passes.

## Email composition

Intelligence emails follow a short structure: sourced recent signal, concrete observation, contribution or verified proof, one matched project, and a low-friction CTA. Generic praise, unsupported metrics, invented recipients, and internal requirements are excluded.

## Evidence validation and send guard

Generated company claims carry evidence IDs. Validation checks that every ID exists and that the claim's meaningful and numeric terms are supported by those evidence values. Editing the body invalidates the UI state. Newly introduced factual company sentences are detected and must be supported.

Validation occurs twice:

1. before review is marked valid;
2. again inside `/api/send` when `outreachDraftId` is present.

An invalid intelligence draft receives HTTP 422 and Gmail is not called. Legacy sends without an intelligence audit ID retain their existing behavior.

## Audit record

Each intelligence draft stores generated/updated timestamps, generator model, context version, evidence IDs, opportunity/build IDs, mode, recipient, subject, body, detected claims, validation result, and sent timestamp. This allows reconstruction of why the message was produced.

## Build-before-ask

Phase 6 BuildSpecs are available only for approved S-tier opportunities. They contain the public problem, why it matters, bounded scope, implementation plan, architecture, public interfaces, expected output, acceptance criteria, demo, effort, evidence, and explicitly separated assumptions.

State transitions are `draft → approved → building → completed`, with abandonment allowed before completion. Completion requires user-provided proof. Proof accepts validated public GitHub, demo, PR, documentation, and screenshot URLs plus notes. Build-before-ask and open-source outreach additionally require a GitHub repository, pull request, or demo URL; notes, screenshots, and documentation alone cannot unlock a claim that work was built. The application neither creates nor uploads proof and never modifies external repositories.

## Human approval and compatibility

Contribution approval, BuildSpec approval, proof attachment, draft validation, and email approval are distinct actions. Only pressing the final review button invokes the existing single-recipient Gmail route. Resume attachment remains required. No bulk or autonomous sender was introduced.

## APIs

- `/api/startups/:id/outreach` lists or creates structured audited drafts.
- `/api/outreach/:id/validate` validates edited content.
- `/api/startups/:id/builds` lists or creates Phase 6 BuildSpecs.
- `/api/startups/:id/builds/:buildId` updates build state or attaches proof.
- `/api/send` optionally applies the intelligence audit guard, then uses the existing Gmail implementation.

## Limitations

The generator uses structured Gemini output when `GEMINI_API_KEY` is configured and otherwise falls back to an intentionally deterministic renderer; both paths use the same evidence validation gate. Claim validation is conservative lexical validation over ledger facts, not semantic proof. Screenshot proof is represented by a user-provided public URL rather than uploaded bytes. Recipient discovery is not automated. Follow-up draft composition remains a recommendation rather than a one-click generated message.
