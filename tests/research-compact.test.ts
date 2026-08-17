import assert from "node:assert/strict";
import test from "node:test";
import { compactResearch, researchSentences } from "../lib/research/compact.ts";

test("retains short, useful accelerator descriptions as research evidence", () => {
  const source = `# ApnaMart

Asset light retail chain

**Website:** [https://apnamart.in/](https://apnamart.in/)

## Founders

Abhishek Singh

Chetan Kumar Garg`;

  assert.ok(researchSentences(source).includes("Asset light retail chain"));
  assert.match(compactResearch([{ url: "https://www.accel.com/companies/apnamart", text: source }]), /Asset light retail chain/);
});

test("filters navigation and cookie boilerplate from compact research", () => {
  const sentences = researchSentences("Accept all cookies\nPrivacy\nDeveloper workflow automation for small support teams");
  assert.deepEqual(sentences, ["Developer workflow automation for small support teams"]);
});
