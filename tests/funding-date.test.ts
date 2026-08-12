import test from "node:test";
import assert from "node:assert/strict";
import { buildStartupIntelligence } from "../lib/intelligence/build-intelligence.ts";
import { daysSince, normalizeFundingDate } from "../lib/intelligence/funding-date.ts";
import type { Evidence } from "../lib/intelligence/types.ts";

test("normalizes funding dates with explicit precision", () => {
  assert.deepEqual(normalizeFundingDate("2025-03-14"), { date: "2025-03-14", precision: "day" });
  assert.deepEqual(normalizeFundingDate("2025-03"), { date: "2025-03-01", precision: "month" });
  assert.deepEqual(normalizeFundingDate("March 2025"), { date: "2025-03-01", precision: "month" });
  assert.deepEqual(normalizeFundingDate("2025"), { date: "2025-01-01", precision: "year" });
  assert.equal(normalizeFundingDate("sometime recently"), null);
  assert.equal(daysSince("2025-03-01", new Date("2025-03-11T18:00:00Z")), 10);
});

test("selects latest dated funding evidence and calculates freshness", () => {
  const evidence: Evidence[] = [
    { id: "seed", startupId: "s", category: "funding", claim: "funding.round", value: { roundType: "Seed", amount: "$1M", date: "2024-01", investors: [] }, sourceName: "Source", sourceUrl: "https://source.test/seed", observedAt: "2024-01-10T00:00:00Z", confidence: "high", metadata: {} },
    { id: "series-a", startupId: "s", category: "funding", claim: "funding.round", value: { roundType: "Series A", amount: "$7M", date: "2025-03", investors: ["North Star"] }, sourceName: "Source", sourceUrl: "https://source.test/a", observedAt: "2025-03-10T00:00:00Z", confidence: "high", metadata: {} },
  ];
  const result = buildStartupIntelligence("s", evidence, "2025-03-11T00:00:00Z", new Date("2025-03-11T00:00:00Z"));
  assert.notEqual(result.funding.latestRound.value, "unknown");
  if (result.funding.latestRound.value !== "unknown") assert.equal(result.funding.latestRound.value.roundType, "Series A");
  assert.equal(result.funding.daysSinceLatestFunding.value, 10);
});
