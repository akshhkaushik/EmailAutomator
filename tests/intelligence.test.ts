import test from "node:test";
import assert from "node:assert/strict";
import { buildStartupIntelligence } from "../lib/intelligence/build-intelligence.ts";
import type { Evidence } from "../lib/intelligence/types.ts";

const base = { startupId: "startup_123", metadata: {}, observedAt: "2026-01-01T00:00:00.000Z" };

function evidence(id: string, input: Partial<Evidence> & Pick<Evidence, "category" | "claim" | "value" | "sourceName" | "sourceUrl" | "confidence">): Evidence {
  return { id, ...base, ...input };
}

test("returns unknown rather than guessing when evidence is missing", () => {
  const result = buildStartupIntelligence("startup_123", [], "2026-01-01T00:00:00.000Z");
  assert.equal(result.company.description.value, "unknown");
  assert.equal(result.funding.latestRound.value, "unknown");
  assert.equal(result.team.estimate, "unknown");
  assert.equal(result.founders.value, "unknown");
  assert.equal(result.hiring.engineeringActivity.value, "unknown");
});

test("keeps conflicting team observations and derives an explicitly labeled range", () => {
  const items = [
    evidence("one", { category: "team", claim: "team.size", value: { count: 6, label: "company" }, sourceName: "Company", sourceUrl: "https://company.test", confidence: "high" }),
    evidence("two", { category: "team", claim: "team.size", value: { count: 7, label: "LinkedIn" }, sourceName: "LinkedIn", sourceUrl: "https://linkedin.test/company", confidence: "medium" }),
  ];
  const result = buildStartupIntelligence("startup_123", items, "2026-01-01T00:00:00.000Z");
  assert.equal(result.team.observations.length, 2);
  assert.deepEqual(result.team.estimate, { min: 6, max: 7, label: "estimate", evidenceIds: ["one", "two"], confidence: "medium" });
});

test("prefers higher-confidence scalar evidence without discarding the ledger", () => {
  const items = [
    evidence("low", { category: "company", claim: "company.location", value: "Unknown region", sourceName: "Directory", sourceUrl: "https://directory.test", confidence: "low" }),
    evidence("high", { category: "company", claim: "company.location", value: "Bengaluru, India", sourceName: "Company", sourceUrl: "https://company.test", confidence: "high" }),
  ];
  const result = buildStartupIntelligence("startup_123", items, "2026-01-01T00:00:00.000Z");
  assert.equal(result.company.location.value, "Bengaluru, India");
  assert.deepEqual(result.company.location.evidenceIds, ["high"]);
  assert.equal(result.evidenceIds.length, 2);
});
