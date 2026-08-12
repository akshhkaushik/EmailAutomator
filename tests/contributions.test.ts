import test from "node:test";
import assert from "node:assert/strict";
import { buildStartupIntelligence } from "../lib/intelligence/build-intelligence.ts";
import type { Evidence } from "../lib/intelligence/types.ts";
import { generateBuildSpecification } from "../lib/contributions/build-spec.ts";
import { calculateContributionScore, estimateContributionDifficulty, generateContributionOpportunities, matchContributionProjects } from "../lib/contributions/engine.ts";
import { InMemoryContributionRepository } from "../lib/contributions/memory-repository.ts";
import { assertContributionTransition } from "../lib/contributions/transitions.ts";
import { validateContributionStatus } from "../lib/contributions/validation.ts";
import { AKSH_CAPABILITY_PROFILE } from "../lib/scoring/capability-profile.ts";
import type { OpportunityScorecard } from "../lib/scoring/types.ts";

const startupId = "startup_contribution";
const now = "2026-08-12T00:00:00.000Z";

function evidence(id: string, input: Pick<Evidence, "category" | "claim" | "value"> & Partial<Evidence>): Evidence {
  return {
    id,
    startupId,
    category: input.category,
    claim: input.claim,
    value: input.value,
    sourceName: input.sourceName || "Fixture company",
    sourceUrl: input.sourceUrl || `https://fixture.test/${id}`,
    observedAt: input.observedAt || now,
    confidence: input.confidence || "high",
    metadata: input.metadata || {},
  };
}

function scorecard(score = 82): OpportunityScorecard {
  return { startupId, score, scoreConfidence: 80, scoreConfidenceLabel: "high", tier: score >= 85 ? "S" : score >= 70 ? "A" : score >= 55 ? "B" : "C", factors: [], configVersion: "test", intelligenceBuiltAt: now };
}

function generate(items: Evidence[], score = 82) {
  return generateContributionOpportunities({
    startupName: "Fixture AI",
    intelligence: buildStartupIntelligence(startupId, items, now, new Date(now)),
    evidence: items,
    startupScorecard: scorecard(score),
  });
}

test("generates specific opportunities only from cited startup evidence", () => {
  const items = [
    evidence("product", { category: "product", claim: "product.description", value: "An AI workflow platform for evaluating support agents through a public API." }),
    evidence("api", { category: "technical", claim: "product.developerInfo", value: { label: "Public API documentation", url: "https://fixture.test/docs" } }),
  ];
  const opportunities = generate(items);
  assert.ok(opportunities.length >= 2);
  const sdk = opportunities.find((item) => item.type === "SDK / API integration");
  assert.ok(sdk);
  assert.match(sdk.title, /TypeScript integration starter for Public API documentation/);
  assert.deepEqual(new Set(sdk.evidence.map((item) => item.evidenceId)), new Set(["product", "api"]));
  assert.ok(sdk.evidence.every((item) => item.sourceUrl.startsWith("https://fixture.test/")));
  assert.ok(sdk.problem.includes("does not establish current SDK coverage"));
});

test("rejects opportunity generation when evidence or startup score is insufficient", () => {
  assert.deepEqual(generate([]), []);
  const items = [evidence("product", { category: "product", claim: "product.description", value: "An AI workflow platform." })];
  assert.deepEqual(generate(items, 54), []);
});

test("matches contribution needs only to demonstrated catalog projects", () => {
  const matches = matchContributionProjects(["ai-workflows", "evidence", "typescript"], AKSH_CAPABILITY_PROFILE);
  assert.ok(matches.length > 0);
  assert.ok(matches.every((match) => match.matchedConcepts.length > 0));
  assert.ok(matches.every((match) => AKSH_CAPABILITY_PROFILE.some((project) => project.id === match.projectId)));
  assert.deepEqual(matchContributionProjects(["quantum-hardware-fabrication"], AKSH_CAPABILITY_PROFILE), []);
});

test("effort estimation favors small demonstrable work", () => {
  assert.equal(estimateContributionDifficulty(8), "small");
  assert.equal(estimateContributionDifficulty(18), "moderate");
  assert.equal(estimateContributionDifficulty(36), "ambitious");
});

test("contribution score combines evidence, startup relevance, Aksh relevance, effort, and impact deterministically", () => {
  const projectMatches = matchContributionProjects(["ai-workflows", "evidence", "typescript"], AKSH_CAPABILITY_PROFILE);
  const input = {
    evidence: [{ evidenceId: "one", claim: "product.description", valueSummary: "AI workflow", sourceName: "Company", sourceUrl: "https://fixture.test", observedAt: now, confidence: "high" as const }],
    startupRelevance: 90,
    projectMatches,
    estimatedEffortHours: 12,
    expectedImpact: 85,
    weights: { evidenceStrength: 30, startupRelevance: 25, akshRelevance: 20, effortFit: 10, expectedImpact: 15 },
  };
  const first = calculateContributionScore(input);
  const second = calculateContributionScore(input);
  assert.deepEqual(first, second);
  assert.ok(first.contributionScore >= 75);
  assert.deepEqual(Object.keys(first.breakdown).sort(), ["akshRelevance", "effortFit", "evidenceStrength", "expectedImpact", "startupRelevance"]);
});

test("prevents duplicate opportunities across deterministic reruns", () => {
  const items = [
    evidence("product", { category: "product", claim: "product.description", value: "An AI workflow platform with a developer API." }),
    evidence("api", { category: "technical", claim: "product.developerInfo", value: { label: "Developer API", url: "https://fixture.test/api" } }),
  ];
  const first = generate(items);
  const second = generate(items);
  assert.deepEqual(first.map((item) => item.id), second.map((item) => item.id));
  assert.equal(new Set(first.map((item) => item.id)).size, first.length);
});

test("repository preserves reviewed status when suggestions are regenerated", async () => {
  const items = [evidence("product", { category: "product", claim: "product.description", value: "An AI workflow platform." })];
  const [suggestion] = generate(items);
  assert.ok(suggestion);
  const repository = new InMemoryContributionRepository();
  await repository.upsertSuggestions(startupId, [suggestion]);
  const approved = await repository.updateStatus(startupId, suggestion.id, "approved");
  assert.equal(approved.status, "approved");
  await repository.upsertSuggestions(startupId, [{ ...suggestion, updatedAt: "2026-08-13T00:00:00.000Z" }]);
  assert.equal((await repository.get(startupId, suggestion.id))?.status, "approved");
  assert.equal((await repository.list(startupId)).length, 1);
});

test("enforces valid opportunity status transitions", () => {
  assert.doesNotThrow(() => assertContributionTransition("suggested", "approved"));
  assert.doesNotThrow(() => assertContributionTransition("approved", "building"));
  assert.doesNotThrow(() => assertContributionTransition("building", "built"));
  assert.doesNotThrow(() => assertContributionTransition("suggested", "rejected"));
  assert.throws(() => assertContributionTransition("suggested", "built"), /cannot move/);
  assert.throws(() => assertContributionTransition("built", "suggested"), /cannot move/);
});

test("build-before-ask creates a bounded specification without code-generation actions", () => {
  const items = [evidence("product", { category: "product", claim: "product.description", value: "An AI workflow platform." })];
  const [opportunity] = generate(items);
  assert.ok(opportunity);
  const spec = generateBuildSpecification(opportunity, now);
  assert.equal(spec.estimatedEffortHours, opportunity.estimatedEffortHours);
  assert.ok(spec.acceptanceCriteria.some((item) => /No private data|No private data/i.test(item)));
  assert.match(spec.scope, /Exclude production deployment/);
  assert.ok(spec.outputs.includes("Runnable proof of concept"));
});

test("validates contribution status API input", () => {
  assert.equal(validateContributionStatus({ status: "approved" }), "approved");
  assert.throws(() => validateContributionStatus({ status: "emailed" }), /Status must be one of/);
  assert.throws(() => validateContributionStatus(null), /JSON object/);
});
