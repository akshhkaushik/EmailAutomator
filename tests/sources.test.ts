import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CompanyWebsiteSource } from "../lib/intelligence/sources/company-website-source.ts";
import { JobsSource } from "../lib/intelligence/sources/jobs-source.ts";
import { htmlText } from "../lib/intelligence/sources/html.ts";
import type { ResearchContext, ResearchSourceInput } from "../lib/intelligence/types.ts";

const observedAt = "2026-08-11T00:00:00.000Z";

async function input(): Promise<ResearchSourceInput> {
  const company = await readFile(new URL("./fixtures/company-website.html", import.meta.url), "utf8");
  const jobs = await readFile(new URL("./fixtures/jobs.html", import.meta.url), "utf8");
  const documents = new Map([
    ["https://acme.example/", company],
    ["https://acme.example/careers", jobs],
  ]);
  const context: ResearchContext = { async fetchDocument(url, sourceName) {
    const normalized = new URL(url).toString();
    const html = documents.get(normalized);
    if (!html) throw new Error(`Unexpected test URL ${normalized}`);
    return { sourceName, sourceUrl: normalized, html, text: htmlText(html), observedAt };
  } };
  return {
    startup: { id: "startup_123", name: "Acme", website: "https://acme.example/", domain: "acme.example", description: "", acceleratorId: "accelerator_123", cohortId: null, location: "", sourceUrls: ["https://accelerator.test"], provenance: [], discoveryStatus: "discovered", createdAt: observedAt, updatedAt: observedAt },
    accelerator: null, cohort: null, context,
  };
}

test("company source extracts only source-backed structured and visible facts", async () => {
  const evidence = await new CompanyWebsiteSource().collect(await input());
  const claims = new Set(evidence.map((item) => item.claim));
  for (const claim of ["company.description", "company.industry", "company.location", "company.foundedYear", "team.size", "founder.person", "product.description", "product.category", "product.developerInfo", "product.launch", "funding.round"]) assert.equal(claims.has(claim), true, claim);
  const funding = evidence.find((item) => item.claim === "funding.round");
  assert.equal(funding?.sourceUrl, "https://acme.example/");
  assert.match(String(funding?.metadata.supportingText), /raised \$7 million/);
  assert.equal((funding?.value as { datePrecision: string }).datePrecision, "month");
});

test("jobs source follows only the explicit same-origin jobs page and extracts technical roles", async () => {
  const evidence = await new JobsSource().collect(await input());
  const roles = evidence.filter((item) => item.claim === "hiring.technicalRole");
  assert.equal(roles.length, 2);
  assert.deepEqual(roles.map((item) => (item.value as { title: string }).title).sort(), ["Machine Learning Engineer", "Senior Backend Engineer"]);
  assert.equal(evidence.some((item) => item.claim === "hiring.announcement"), true);
  assert.equal(evidence.every((item) => item.sourceUrl === "https://acme.example/careers"), true);
});
