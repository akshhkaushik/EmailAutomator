import test from "node:test";
import assert from "node:assert/strict";
import { EvidenceLedger } from "../lib/intelligence/evidence-ledger.ts";
import { InMemoryIntelligenceRepository } from "../lib/intelligence/memory-repository.ts";

test("creates evidence with source attribution and reuses a duplicate fingerprint", async () => {
  const repository = new InMemoryIntelligenceRepository();
  const ledger = new EvidenceLedger(repository, "startup_123");
  const first = await ledger.record({
    category: "company", claim: "company.location", value: "Delhi", sourceName: "Company website",
    sourceUrl: "https://example.test/about", observedAt: "2026-01-01T00:00:00.000Z", confidence: "low", metadata: {},
  });
  const repeated = await ledger.record({
    category: "company", claim: "company.location", value: "Delhi", sourceName: "Company website",
    sourceUrl: "https://example.test/about", observedAt: "2026-02-01T00:00:00.000Z", confidence: "high", metadata: {},
  });
  assert.equal(first.created, true);
  assert.equal(repeated.created, false);
  assert.equal(first.evidence.id, repeated.evidence.id);
  assert.equal(repeated.evidence.sourceName, "Company website");
  assert.equal(repeated.evidence.sourceUrl, "https://example.test/about");
  assert.equal(repeated.evidence.observedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(repeated.evidence.metadata.lastObservedAt, "2026-02-01T00:00:00.000Z");
  assert.equal(repeated.evidence.confidence, "high");
  assert.equal((await ledger.all()).length, 1);
});

test("creates a new evidence record when a source value changes", async () => {
  const repository = new InMemoryIntelligenceRepository();
  const ledger = new EvidenceLedger(repository, "startup_123");
  for (const count of [6, 7]) {
    await ledger.record({ category: "team", claim: "team.size", value: { count, label: "company" }, sourceName: "Company", sourceUrl: "https://example.test", observedAt: `2026-01-0${count}T00:00:00.000Z`, confidence: "high", metadata: {} });
  }
  assert.equal((await ledger.all()).length, 2);
});
