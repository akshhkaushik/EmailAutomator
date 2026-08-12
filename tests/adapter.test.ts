import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PublicPortfolioPageSource, parsePublicPortfolioHtml } from "../lib/discovery/public-portfolio-source.ts";
import { normalizeDomain } from "../lib/discovery/normalize.ts";

const sourceUrl = "https://accelerator.test/cohort-2026";
const discoveredAt = "2026-08-11T00:00:00.000Z";

test("parses JSON-LD, portfolio cards, missing websites, and ordinary external links", async () => {
  const html = await readFile(new URL("./fixtures/portfolio.html", import.meta.url), "utf8");
  const startups = parsePublicPortfolioHtml(html, { sourceUrl, discoveredAt });
  assert.equal(startups.length, 3);
  assert.deepEqual(startups.map((startup) => startup.name).sort(), ["Alpha Systems", "Beta Labs", "Gamma Works"]);
  const alpha = startups.find((startup) => startup.name === "Alpha Systems");
  assert.equal(normalizeDomain(alpha?.website || ""), "alpha.example");
  assert.equal(alpha?.location, "Bengaluru, India");
  const beta = startups.find((startup) => startup.name === "Beta Labs");
  assert.equal(beta?.website, "");
  assert.equal(beta?.location, "London, UK");
});

test("tolerates malformed pages without executing or inventing entries", async () => {
  const html = await readFile(new URL("./fixtures/malformed-portfolio.html", import.meta.url), "utf8");
  assert.deepEqual(parsePublicPortfolioHtml(html, { sourceUrl, discoveredAt }), []);
});

test("adapter uses an injected page fetcher instead of a live website in tests", async () => {
  const html = '<article class="startup-card"><h2>Fixture Co</h2><a href="https://fixture.example">Site</a></article>';
  const source = new PublicPortfolioPageSource(async (url) => ({ html, sourceUrl: url }));
  const startups = await source.discover({
    sourceUrl,
    accelerator: { id: "accelerator_123", name: "Test", website: "https://accelerator.test/", portfolioUrl: sourceUrl, description: "", status: "active", createdAt: discoveredAt, updatedAt: discoveredAt },
    cohort: null,
  });
  assert.equal(startups.length, 1);
  assert.equal(startups[0].name, "Fixture Co");
});
