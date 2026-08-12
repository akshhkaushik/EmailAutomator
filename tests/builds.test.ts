import test from "node:test";
import assert from "node:assert/strict";
import { generateBuildSpec } from "../lib/builds/engine.ts";
import { InMemoryBuildRepository } from "../lib/builds/memory-repository.ts";
import { assertBuildTransition } from "../lib/builds/transitions.ts";
import { hasBuildProof, validateBuildProof } from "../lib/builds/validation.ts";
import type { ContributionOpportunity } from "../lib/contributions/types.ts";
import type { OpportunityScorecard } from "../lib/scoring/types.ts";

const opportunity: ContributionOpportunity = { id: "opportunity_12345678", startupId: "startup_12345678", type: "SDK / API integration", title: "Build API starter", problem: "Public evidence shows API documentation.", evidence: [{ evidenceId: "evidence_1", claim: "product.developerInfo", valueSummary: "Public API", sourceName: "Company", sourceUrl: "https://company.test/docs", observedAt: "2026-08-01T00:00:00.000Z", confidence: "high" }], proposedSolution: "Build a typed starter.", expectedImpact: "A copyable integration path.", relevantAkshProjects: [{ projectId: "signal", projectName: "Signal", matchedConcepts: ["typescript"], repositoryUrl: "https://github.com/akshhkaushik/EmailAutomator", demoUrl: "https://example.test" }], relevantSkills: ["typescript"], estimatedDifficulty: "small", estimatedEffortHours: 12, contributionScore: 90, contributionScoreBreakdown: { evidenceStrength: 100, startupRelevance: 90, akshRelevance: 70, effortFit: 90, expectedImpact: 85 }, confidence: "high", confidenceScore: 88, status: "approved", buildSpec: null, engineVersion: "test", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" };
const scorecard: OpportunityScorecard = { startupId: opportunity.startupId, score: 90, scoreConfidence: 80, scoreConfidenceLabel: "high", tier: "S", factors: [], configVersion: "test", intelligenceBuiltAt: "2026-08-01T00:00:00.000Z" };

test("build spec separates public evidence from assumptions", () => {
  const spec = generateBuildSpec(opportunity, scorecard, "2026-08-12T00:00:00.000Z");
  assert.equal(spec.knownFromPublicEvidence.length, 1);
  assert.ok(spec.assumptions.length > 0);
  assert.match(spec.scope, /Do not deploy/);
  assert.ok(spec.acceptanceCriteria.some((item) => /No private data/.test(item)));
});

test("build specs require S-tier approved opportunities", () => {
  assert.throws(() => generateBuildSpec(opportunity, { ...scorecard, tier: "A", score: 80 }), /S-tier/);
  assert.throws(() => generateBuildSpec({ ...opportunity, status: "suggested" }, scorecard), /Approve/);
});

test("proof validates public URLs and PR shapes", () => {
  const proof = validateBuildProof({ githubUrl: "https://github.com/aksh/example", prUrl: "https://github.com/startup/repo/pull/42", notes: "User supplied." }, "2026-08-12T00:00:00.000Z");
  assert.equal(hasBuildProof(proof), true);
  assert.throws(() => validateBuildProof({ githubUrl: "http://localhost/repo" }), /public hostname/);
  assert.throws(() => validateBuildProof({ prUrl: "https://github.com/startup/repo/issues/42" }), /pull request/);
  assert.throws(() => validateBuildProof({ notes: "no URL" }), /proof URL/);
});

test("completion is gated on explicit proof and state transitions", async () => {
  const repository = new InMemoryBuildRepository();
  let spec = await repository.upsert(generateBuildSpec(opportunity, scorecard));
  await assert.rejects(() => repository.updateStatus(spec.startupId, spec.id, "completed"), /cannot move/);
  spec = await repository.updateStatus(spec.startupId, spec.id, "approved");
  spec = await repository.updateStatus(spec.startupId, spec.id, "building");
  await assert.rejects(() => repository.updateStatus(spec.startupId, spec.id, "completed"), /Attach verifiable proof/);
  spec = await repository.attachProof(spec.startupId, spec.id, validateBuildProof({ demoUrl: "https://demo.example.com" }));
  assert.equal((await repository.updateStatus(spec.startupId, spec.id, "completed")).status, "completed");
  assert.throws(() => assertBuildTransition("completed", "building", spec.proof), /cannot move/);
});
