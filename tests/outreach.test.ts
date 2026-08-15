import test from "node:test";
import assert from "node:assert/strict";
import { buildOutreachContext, assertOutreachMode } from "../lib/outreach/context.ts";
import { DeterministicOutreachGenerator } from "../lib/outreach/generator.ts";
import { coldEmailFormatMetrics } from "../lib/outreach/focused-email.ts";
import { detectEditedCompanyClaims, validateOutreachClaims } from "../lib/outreach/validation.ts";
import { buildStartupIntelligence } from "../lib/intelligence/build-intelligence.ts";
import type { Evidence } from "../lib/intelligence/types.ts";
import type { Startup } from "../lib/discovery/types.ts";
import type { ContributionOpportunity } from "../lib/contributions/types.ts";
import type { BuildSpec } from "../lib/builds/types.ts";

const evidence: Evidence = { id: "evidence_123", startupId: "startup_123", category: "technical", claim: "product.developerInfo", value: { label: "Public API", url: "https://startup.test/docs" }, sourceName: "Startup docs", sourceUrl: "https://startup.test/docs", observedAt: "2026-08-01T00:00:00.000Z", confidence: "high", metadata: {} };
const startup: Startup = { id: "startup_123", name: "Acme", website: "https://startup.test", domain: "startup.test", description: "", acceleratorId: "accel_12345678", cohortId: null, location: "", sourceUrls: [], provenance: [], discoveryStatus: "discovered", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" };
const opportunity: ContributionOpportunity = { id: "opportunity_123", startupId: startup.id, type: "SDK", title: "TypeScript API starter", problem: "API is public.", evidence: [{ evidenceId: evidence.id, claim: evidence.claim, valueSummary: "Public API", sourceName: evidence.sourceName, sourceUrl: evidence.sourceUrl, observedAt: evidence.observedAt, confidence: "high" }], proposedSolution: "Build a typed starter.", expectedImpact: "Copyable integration.", relevantAkshProjects: [{ projectId: "signal", projectName: "Signal Personal Outreach", matchedConcepts: ["typescript", "developer-tools"], repositoryUrl: "https://github.com/akshhkaushik/EmailAutomator", demoUrl: "https://signal.test" }], relevantSkills: ["typescript"], estimatedDifficulty: "small", estimatedEffortHours: 12, contributionScore: 90, contributionScoreBreakdown: { evidenceStrength: 100, startupRelevance: 90, akshRelevance: 80, effortFit: 90, expectedImpact: 80 }, confidence: "high", confidenceScore: 90, status: "approved", buildSpec: null, engineVersion: "test", createdAt: evidence.observedAt, updatedAt: evidence.observedAt };
const completedBuild = { id: "build_123", startupId: startup.id, opportunityId: opportunity.id, title: opportunity.title, problem: opportunity.problem, whyItMatters: opportunity.expectedImpact, scope: "", implementationPlan: [], architecture: [], APIs: [], expectedOutput: [], acceptanceCriteria: [], demoIdea: "", estimatedEffort: 12, knownFromPublicEvidence: opportunity.evidence, assumptions: [], createdAt: evidence.observedAt, updatedAt: evidence.observedAt, status: "completed", proof: { githubUrl: "https://github.com/aksh/proof", demoUrl: "", prUrl: "", documentationUrl: "", screenshotUrl: "", notes: "", attachedAt: evidence.observedAt } } satisfies BuildSpec;

test("constructs compact structured context with evidence injection", () => {
  const context = buildOutreachContext({ startup, intelligence: buildStartupIntelligence(startup.id, [evidence]), evidence: [evidence], opportunity, mode: "contribution", build: null, history: [] });
  assert.equal(context.version, "outreach-context-v1");
  assert.deepEqual(context.evidence.map((item) => item.id), [evidence.id]);
  assert.equal(context.opportunity.id, opportunity.id);
  assert.equal(context.previousOutreachHistory.length, 0);
});

test("outreach modes cannot claim a build without completed proof", () => {
  assert.doesNotThrow(() => assertOutreachMode("contribution", opportunity, null));
  assert.throws(() => assertOutreachMode("build_before_ask", opportunity, null), /proof/);
  assert.doesNotThrow(() => assertOutreachMode("build_before_ask", opportunity, completedBuild));
  assert.doesNotThrow(() => assertOutreachMode("open_source", opportunity, completedBuild));
});

test("deterministic email generation uses evidence and real proof", async () => {
  const context = buildOutreachContext({ startup, intelligence: buildStartupIntelligence(startup.id, [evidence]), evidence: [evidence], opportunity, mode: "build_before_ask", build: completedBuild, history: [] });
  const result = await new DeterministicOutreachGenerator().generate(context, "Ada");
  assert.match(result.body, /I put together a small public proof/);
  assert.match(result.body, /github.com\/aksh\/proof/);
  const format = coldEmailFormatMetrics(result.subject, result.body);
  assert.ok(format.subjectWords <= 4);
  assert.ok(format.contentWords >= 50 && format.contentWords <= 100);
  assert.equal(format.questions, 1);
  assert.deepEqual(result.claims[0].evidenceIds, [evidence.id]);
});

test("unsupported claims invalidate review and therefore cannot pass the send guard", () => {
  const valid = validateOutreachClaims([{ text: "Acme's public materials describe Public API.", evidenceIds: [evidence.id] }], [evidence], "2026-08-12T00:00:00.000Z");
  assert.equal(valid.valid, true);
  const invalid = validateOutreachClaims([{ text: "Acme raised $50M and has 200 employees.", evidenceIds: [evidence.id] }], [evidence]);
  assert.equal(invalid.valid, false);
  assert.deepEqual(invalid.unsupportedClaims, ["Acme raised $50M and has 200 employees."]);
});

test("edited factual company claims are detected for revalidation", () => {
  const claims = detectEditedCompanyClaims("Acme raised $50M. I would enjoy contributing.", "Acme", []);
  assert.equal(claims.length, 1);
  assert.deepEqual(claims[0].evidenceIds, []);
});
