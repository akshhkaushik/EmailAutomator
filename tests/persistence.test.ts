import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryDiscoveryRepository } from "../lib/discovery/memory-repository.ts";

const discoveredAt = "2026-08-11T00:00:00.000Z";

test("persists accelerators, cohorts, startups, filters, retrieval, and provenance", async () => {
  const repository = new InMemoryDiscoveryRepository();
  const first = await repository.createAccelerator({ name: "First", website: "https://first.test/", portfolioUrl: "https://first.test/startups", description: "", status: "active" });
  const second = await repository.createAccelerator({ name: "Second", website: "https://second.test/", portfolioUrl: "https://second.test/startups", description: "", status: "active" });
  const cohort = await repository.createCohort({ acceleratorId: first.id, name: "Summer", year: 2026, portfolioUrl: "https://first.test/summer", source: "public-portfolio-page" });
  assert.equal((await repository.listAccelerators()).length, 2);
  assert.equal((await repository.listCohorts(first.id))[0].id, cohort.id);

  const firstUpsert = await repository.upsertStartup({
    discovered: { name: "Example", website: "https://www.example.com", description: "First", location: "", sourceUrl: cohort.portfolioUrl, discoveredAt },
    acceleratorId: first.id, cohortId: cohort.id, cohortName: cohort.name, discoverySource: "public-portfolio-page",
  });
  const secondUpsert = await repository.upsertStartup({
    discovered: { name: "Example Inc", website: "http://example.com/", description: "Second", location: "Delhi", sourceUrl: second.portfolioUrl, discoveredAt },
    acceleratorId: second.id, cohortId: null, cohortName: null, discoverySource: "public-portfolio-page",
  });
  assert.equal(firstUpsert.created, true);
  assert.equal(secondUpsert.created, false);
  assert.equal(firstUpsert.startup.id, secondUpsert.startup.id);
  assert.equal(secondUpsert.startup.provenance.length, 2);
  assert.equal((await repository.listStartups({ acceleratorId: first.id })).length, 1);
  assert.equal((await repository.listStartups({ acceleratorId: second.id })).length, 1);
  assert.equal((await repository.listStartups({ cohortId: cohort.id })).length, 1);
  assert.equal((await repository.getStartup(firstUpsert.startup.id))?.domain, "example.com");
});

test("keeps same-name startups without domains separate across source pages", async () => {
  const repository = new InMemoryDiscoveryRepository();
  const accelerator = await repository.createAccelerator({ name: "A", website: "https://a.test/", portfolioUrl: "https://a.test/one", description: "", status: "active" });
  for (const sourceUrl of ["https://a.test/one", "https://a.test/two"]) {
    await repository.upsertStartup({
      discovered: { name: "Nameless Domain", website: "", description: "", location: "", sourceUrl, discoveredAt },
      acceleratorId: accelerator.id, cohortId: null, cohortName: null, discoverySource: "public-portfolio-page",
    });
  }
  assert.equal((await repository.listStartups()).length, 2);
});
