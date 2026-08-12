import test from "node:test";
import assert from "node:assert/strict";
import { validateLlmEvidenceOutput } from "../lib/intelligence/llm-validation.ts";
import type { ResearchDocument } from "../lib/intelligence/types.ts";

const document: ResearchDocument = {
  sourceName: "Company news",
  sourceUrl: "https://example.test/news",
  html: "",
  text: "The company raised $7 million in a Series A led by North Star Ventures.",
  observedAt: "2026-01-01T00:00:00.000Z",
};

test("accepts LLM extraction only when a supporting quote exists in a retrieved source", () => {
  const result = validateLlmEvidenceOutput([{
    category: "funding", claim: "funding.round", value: { amount: "$7 million", roundType: "Series A" },
    sourceUrl: document.sourceUrl, supportingQuote: "raised $7 million in a Series A",
  }], [document]);
  assert.equal(result.length, 1);
  assert.equal(result[0].sourceName, "Company news");
  assert.equal(result[0].confidence, "medium");
});

test("drops explicit unknowns and rejects unsupported LLM claims", () => {
  assert.deepEqual(validateLlmEvidenceOutput([{ category: "team", claim: "team.size", value: "unknown", sourceUrl: document.sourceUrl, supportingQuote: "not present anywhere" }], [document]), []);
  assert.throws(() => validateLlmEvidenceOutput([{ category: "funding", claim: "funding.round", value: { amount: "$9M" }, sourceUrl: document.sourceUrl, supportingQuote: "raised $9M from invented investors" }], [document]), /not found/);
  assert.throws(() => validateLlmEvidenceOutput([{ category: "funding", claim: "funding.round", value: { amount: "$7M" }, sourceUrl: "https://other.test", supportingQuote: "raised $7 million in a Series A" }], [document]), /was not retrieved/);
  assert.throws(() => validateLlmEvidenceOutput([{ category: "funding", claim: "team.size", value: 7, sourceUrl: document.sourceUrl, supportingQuote: "raised $7 million in a Series A" }], [document]), /does not match/);
});
