import assert from "node:assert/strict";
import test from "node:test";
import { markdownAlternateUrl } from "../lib/discovery/http.ts";
import { companyNameFromContent, foundersFromContent, linkedCompanyUrlFromContent } from "../lib/research/content.ts";

const ACCEL_FIXTURE = `# AegisAI

Agentic AI for email security

**Website:** [https://www.aegisai.ai/](https://www.aegisai.ai/)

## Founders

Cy Khormaee

Ryan Luo

**Investment Type:** seed

## Partners

- Eric Wolford
`;

const SHORT_ACCEL_FIXTURE = `# ApnaMart

Asset light retail chain

**Website:** [https://apnamart.in/](https://apnamart.in/)

## Founders

Abhishek Singh

Chetan Kumar Garg
`;

test("uses an advertised same-origin Markdown representation for oversized profile pages", () => {
  const source = new URL("https://www.accel.com/companies/aegisai");
  const link = '</companies/aegisai.md>; rel="alternate"; type="text/markdown"';
  assert.equal(markdownAlternateUrl(link, source)?.toString(), "https://www.accel.com/companies/aegisai.md");
  assert.equal(markdownAlternateUrl('<https://attacker.example/a.md>; rel="alternate"; type="text/markdown"', source), null);
});

test("extracts the company, founder list, and official website from an accelerator Markdown profile", () => {
  const source = new URL("https://www.accel.com/companies/aegisai.md");
  assert.equal(companyNameFromContent(ACCEL_FIXTURE, source), "AegisAI");
  assert.deepEqual(foundersFromContent(ACCEL_FIXTURE).map(({ name }) => name), ["Cy Khormaee", "Ryan Luo"]);
  assert.equal(linkedCompanyUrlFromContent(ACCEL_FIXTURE, source)?.toString(), "https://www.aegisai.ai/");
});

test("extracts sparse accelerator profiles even when the official site is client-rendered", () => {
  const source = new URL("https://www.accel.com/companies/apnamart");
  assert.equal(companyNameFromContent(SHORT_ACCEL_FIXTURE, source), "ApnaMart");
  assert.deepEqual(foundersFromContent(SHORT_ACCEL_FIXTURE).map(({ name }) => name), ["Abhishek Singh", "Chetan Kumar Garg"]);
  assert.equal(linkedCompanyUrlFromContent(SHORT_ACCEL_FIXTURE, source)?.toString(), "https://apnamart.in/");
});
