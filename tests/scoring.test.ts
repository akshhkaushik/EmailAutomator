import test from "node:test";
import assert from "node:assert/strict";
import { buildStartupIntelligence } from "../lib/intelligence/build-intelligence.ts";
import type { Evidence } from "../lib/intelligence/types.ts";
import { AKSH_CAPABILITY_PROFILE } from "../lib/scoring/capability-profile.ts";
import { DEFAULT_OPPORTUNITY_SCORING_CONFIG } from "../lib/scoring/config.ts";
import {
  scoreCompanyMomentum,
  scoreContributionPotential,
  scoreFounderAccessibility,
  scoreFundingMomentum,
  scoreHiringSignal,
  scoreTeamLeverage,
  scoreTechnicalFit,
} from "../lib/scoring/dimensions.ts";
import { assignOpportunityTier, scoreStartupOpportunity } from "../lib/scoring/engine.ts";

const startupId = "startup_scoring";
const researchedAt = "2026-01-31T00:00:00.000Z";
const now = new Date(researchedAt);

function item(id: string, input: Pick<Evidence, "category" | "claim" | "value"> & Partial<Evidence>): Evidence {
  return {
    id,
    startupId,
    category: input.category,
    claim: input.claim,
    value: input.value,
    sourceName: input.sourceName || "Fixture source",
    sourceUrl: input.sourceUrl || `https://fixture.test/${id}`,
    observedAt: input.observedAt || researchedAt,
    confidence: input.confidence || "high",
    metadata: input.metadata || {},
  };
}

function intelligence(evidence: Evidence[]) {
  return buildStartupIntelligence(startupId, evidence, researchedAt, now);
}

function evidenceMap(evidence: Evidence[]) { return new Map(evidence.map((record) => [record.id, record])); }
const config = DEFAULT_OPPORTUNITY_SCORING_CONFIG;

test("recent funding receives the highest deterministic funding score", () => {
  const evidence = [item("funding", { category: "funding", claim: "funding.round", value: { roundType: "Series A", amount: "$7M", date: "2026-01-15", investors: ["Example Ventures"] } })];
  const result = scoreFundingMomentum(intelligence(evidence), evidenceMap(evidence), config);
  assert.equal(result.score, 100);
  assert.equal(result.earnedPoints, 20);
  assert.match(result.reason, /16 days ago/);
  assert.deepEqual(result.evidenceIds, ["funding"]);
});

test("stale funding remains a low signal and missing funding remains unknown", () => {
  const staleEvidence = [item("stale", { category: "funding", claim: "funding.round", value: { roundType: "Seed", date: "2024-12-01" } })];
  assert.equal(scoreFundingMomentum(intelligence(staleEvidence), evidenceMap(staleEvidence), config).score, 20);
  const missing = scoreFundingMomentum(intelligence([]), new Map(), config);
  assert.equal(missing.score, 0);
  assert.equal(missing.confidence, 0);
  assert.match(missing.reason, /unknown/);
});

test("uncertain and conflicting team sizes lower confidence without false precision", () => {
  const conflicting = [
    item("team-small", { category: "team", claim: "team.size", value: { count: 7, label: "Company" }, sourceUrl: "https://company.test/team" }),
    item("team-large", { category: "team", claim: "team.size", value: { count: 40, label: "Directory" }, sourceUrl: "https://directory.test/company", confidence: "medium" }),
  ];
  const uncertain = scoreTeamLeverage(intelligence(conflicting), evidenceMap(conflicting), config);
  const certainEvidence = [item("team-certain", { category: "team", claim: "team.size", value: { count: 7, label: "Company" } })];
  const certain = scoreTeamLeverage(intelligence(certainEvidence), evidenceMap(certainEvidence), config);
  assert.ok(uncertain.score < 100 && uncertain.score > 60);
  assert.ok(uncertain.confidence < certain.confidence);
  assert.match(uncertain.reason, /conflict/);
});

test("strong technical fit uses the structured project catalog and cites source evidence", () => {
  const evidence = [item("product", { category: "product", claim: "product.description", value: "A TypeScript AI workflow platform with public APIs and audit evidence." })];
  const result = scoreTechnicalFit(intelligence(evidence), evidenceMap(evidence), AKSH_CAPABILITY_PROFILE, config);
  assert.equal(result.score, 100);
  assert.deepEqual(result.evidenceIds, ["product"]);
  assert.ok(result.projectMatches.length > 0);
  assert.ok(result.projectMatches[0].matchedConcepts.length >= 4);
});

test("weak fit does not invent an overlap", () => {
  const evidence = [item("product", { category: "product", claim: "product.description", value: "A subscription service for freshly prepared organic snacks." })];
  const result = scoreTechnicalFit(intelligence(evidence), evidenceMap(evidence), AKSH_CAPABILITY_PROFILE, config);
  assert.equal(result.score, 0);
  assert.equal(result.projectMatches.length, 0);
  assert.ok(result.confidence > 0);
});

test("low-confidence research keeps a strong textual match low confidence", () => {
  const evidence = [item("low-fit", { category: "product", claim: "product.description", value: "A TypeScript AI workflow API platform.", confidence: "low" })];
  const result = scoreTechnicalFit(intelligence(evidence), evidenceMap(evidence), AKSH_CAPABILITY_PROFILE, config);
  assert.ok(result.score >= 85);
  assert.ok(result.confidence <= 35);
});

test("founder accessibility only uses identified roles and public profile URLs", () => {
  const evidence = [item("founder", { category: "founder", claim: "founder.person", value: { name: "Ada Example", role: "Co-founder and CTO", profileUrl: "https://example.test/ada" } })];
  const result = scoreFounderAccessibility(intelligence(evidence), evidenceMap(evidence), config);
  assert.equal(result.score, 100);
  assert.match(result.reason, /Public activity is not inferred/);
  assert.deepEqual(result.evidenceIds, ["founder"]);
});

test("technical roles produce a hiring signal and remain source-attributed", () => {
  const evidence = [item("job", { category: "hiring", claim: "hiring.technicalRole", value: { title: "Founding Engineer" }, confidence: "medium" })];
  const result = scoreHiringSignal(intelligence(evidence), evidenceMap(evidence), config);
  assert.equal(result.score, 80);
  assert.equal(result.confidence, 65);
  assert.deepEqual(result.evidenceIds, ["job"]);
});

test("contribution potential detects a possible surface without proposing work", () => {
  const evidence = [
    item("product", { category: "product", claim: "product.description", value: "An AI workflow API platform built with TypeScript." }),
    item("developer", { category: "technical", claim: "product.developerInfo", value: { label: "Developer API", url: "https://fixture.test/docs" } }),
  ];
  const result = scoreContributionPotential(intelligence(evidence), evidenceMap(evidence), AKSH_CAPABILITY_PROFILE, config);
  assert.ok(result.score >= 70);
  assert.match(result.reason, /no contribution is proposed yet/i);
  assert.deepEqual(new Set(result.evidenceIds), new Set(["product", "developer"]));
});

test("recent launches produce company momentum while missing activity remains unknown", () => {
  const evidence = [item("launch", { category: "product", claim: "product.launch", value: "Launched the public beta this month" })];
  assert.equal(scoreCompanyMomentum(intelligence(evidence), evidenceMap(evidence), config).score, 100);
  const missing = scoreCompanyMomentum(intelligence([]), new Map(), config);
  assert.equal(missing.score, 0);
  assert.equal(missing.confidence, 0);
});

test("score aggregation equals the explained weighted factors", () => {
  const evidence = [
    item("funding", { category: "funding", claim: "funding.round", value: { roundType: "Seed", amount: "$2M", date: "2026-01-10" } }),
    item("team", { category: "team", claim: "team.size", value: { count: 8, label: "Company" } }),
    item("product", { category: "product", claim: "product.description", value: "A TypeScript AI workflow API platform with audit evidence." }),
    item("founder", { category: "founder", claim: "founder.person", value: { name: "Ada Example", role: "CTO", profileUrl: "https://fixture.test/ada" } }),
    item("job", { category: "hiring", claim: "hiring.technicalRole", value: { title: "Founding Engineer" } }),
    item("launch", { category: "product", claim: "product.launch", value: "Launched a developer beta this month" }),
  ];
  const scorecard = scoreStartupOpportunity({ intelligence: intelligence(evidence), evidence });
  assert.equal(scorecard.score, Math.round(scorecard.factors.reduce((sum, factor) => sum + factor.earnedPoints, 0)));
  assert.equal(scorecard.factors.length, 7);
  assert.ok(scorecard.scoreConfidence > 0 && scorecard.scoreConfidence <= 100);
  assert.ok(scorecard.factors.every((factor) => factor.reason.length > 0));
});

test("tier assignment follows configurable boundaries", () => {
  assert.equal(assignOpportunityTier(85), "S");
  assert.equal(assignOpportunityTier(84), "A");
  assert.equal(assignOpportunityTier(70), "A");
  assert.equal(assignOpportunityTier(69), "B");
  assert.equal(assignOpportunityTier(55), "B");
  assert.equal(assignOpportunityTier(54), "C");
});

test("every existing project has a complete structured capability profile", () => {
  assert.equal(AKSH_CAPABILITY_PROFILE.length, 28);
  for (const project of AKSH_CAPABILITY_PROFILE) {
    assert.ok(project.name && project.description && project.repositoryUrl);
    assert.ok(project.technologies.length > 0);
    assert.ok(project.problemDomains.length > 0);
    assert.ok(project.capabilitiesDemonstrated.length > 0);
  }
});
