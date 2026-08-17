import test from "node:test";
import assert from "node:assert/strict";
import { deduplicateDiscoveredStartups, normalizeDomain, normalizeWebsite } from "../lib/discovery/normalize.ts";

const discoveredAt = "2026-08-11T00:00:00.000Z";

test("normalizes equivalent website forms to one domain", () => {
  assert.equal(normalizeDomain("https://www.Example.com/path?q=1"), "example.com");
  assert.equal(normalizeDomain("http://example.com/"), "example.com");
  assert.equal(normalizeDomain("example.com"), "example.com");
  assert.equal(normalizeWebsite("example.com/path"), "https://example.com/");
});

test("deduplicates by domain even when portfolio names differ", () => {
  const result = deduplicateDiscoveredStartups([
    { name: "Example", website: "https://www.example.com", description: "", location: "", sourceUrl: "https://accelerator.test/a", discoveredAt },
    { name: "Example Incorporated", website: "http://example.com/", description: "Second", location: "Delhi", sourceUrl: "https://accelerator.test/a", discoveredAt },
  ]);
  assert.equal(result.length, 1);
  assert.equal(normalizeDomain(result[0].website), "example.com");
});

test("does not merge missing-domain startups by name across sources", () => {
  const result = deduplicateDiscoveredStartups([
    { name: "Same Name", website: "", description: "First", location: "", sourceUrl: "https://accelerator.test/a", discoveredAt },
    { name: "Same Name", website: "", description: "Second", location: "", sourceUrl: "https://accelerator.test/b", discoveredAt },
  ]);
  assert.equal(result.length, 2);
});

test("merges duplicate missing-website entries only within the same source", () => {
  const sourceUrl = "https://accelerator.test/cohort";
  const result = deduplicateDiscoveredStartups([
    { name: "No Site", website: "", description: "", location: "", sourceUrl, discoveredAt },
    { name: "No Site", website: "", description: "Description", location: "", sourceUrl, discoveredAt },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].website, "");
});
