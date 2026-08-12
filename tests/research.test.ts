import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryDiscoveryRepository } from "../lib/discovery/memory-repository.ts";
import { InMemoryIntelligenceRepository } from "../lib/intelligence/memory-repository.ts";
import { researchStartup } from "../lib/intelligence/orchestrator.ts";
import type { StartupResearchSource } from "../lib/intelligence/types.ts";

test("research is idempotent for unchanged evidence", async () => {
  const discoveryRepository = new InMemoryDiscoveryRepository();
  const intelligenceRepository = new InMemoryIntelligenceRepository();
  const accelerator = await discoveryRepository.createAccelerator({ name: "A", website: "https://a.test/", portfolioUrl: "https://a.test/startups", description: "", status: "active" });
  const stored = await discoveryRepository.upsertStartup({
    discovered: { name: "Example", website: "https://example.test/", description: "", location: "", sourceUrl: accelerator.portfolioUrl, discoveredAt: "2026-01-01T00:00:00.000Z" },
    acceleratorId: accelerator.id, cohortId: null, cohortName: null, discoverySource: "fixture",
  });
  const source: StartupResearchSource = { id: "fixture-source", async collect() {
    return [{ category: "company", claim: "company.description", value: "Evidence-backed description", sourceName: "Fixture", sourceUrl: "https://example.test/", observedAt: "2026-01-01T00:00:00.000Z", confidence: "high", metadata: {} }];
  } };
  const context = { async fetchDocument() { throw new Error("Fixture source does not fetch."); } };
  const first = await researchStartup({ startupId: stored.startup.id, discoveryRepository, intelligenceRepository, sources: [source], context });
  const second = await researchStartup({ startupId: stored.startup.id, discoveryRepository, intelligenceRepository, sources: [source], context });
  assert.equal(first.evidenceCreated, 1);
  assert.equal(second.evidenceCreated, 0);
  assert.equal(second.evidenceReused, 1);
  assert.equal((await intelligenceRepository.listEvidence(stored.startup.id)).length, 1);
  assert.equal((await intelligenceRepository.listResearchRuns(stored.startup.id)).length, 2);
  assert.equal(second.intelligence.company.description.value, "Evidence-backed description");
});

test("unexpected research failures leave a completed failed job record", async () => {
  const discoveryRepository = new InMemoryDiscoveryRepository();
  class FailingIntelligenceRepository extends InMemoryIntelligenceRepository {
    async saveIntelligence(): Promise<never> { throw new Error("storage write failed"); }
  }
  const intelligenceRepository = new FailingIntelligenceRepository();
  const accelerator = await discoveryRepository.createAccelerator({ name: "A", website: "https://a.test/", portfolioUrl: "https://a.test/startups", description: "", status: "active" });
  const stored = await discoveryRepository.upsertStartup({ discovered: { name: "Example", website: "https://example.test/", description: "", location: "", sourceUrl: accelerator.portfolioUrl, discoveredAt: "2026-01-01T00:00:00.000Z" }, acceleratorId: accelerator.id, cohortId: null, cohortName: null, discoverySource: "fixture" });
  const source: StartupResearchSource = { id: "fixture-source", async collect() { return []; } };
  await assert.rejects(() => researchStartup({ startupId: stored.startup.id, discoveryRepository, intelligenceRepository, sources: [source], context: { async fetchDocument() { throw new Error("unused"); } } }), /storage write failed/);
  const runs = await intelligenceRepository.listResearchRuns(stored.startup.id);
  assert.equal(runs[0].status, "failed");
  assert.ok(runs[0].completedAt);
  assert.equal(runs[0].errors[0].sourceId, "orchestrator");
});
