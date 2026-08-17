import test from "node:test";
import assert from "node:assert/strict";
import { ValidationError, validateAcceleratorInput, validateCohortInput, validateDiscoveryInput, validateListFilters } from "../lib/discovery/validation.ts";

test("validates and normalizes accelerator API input", () => {
  const input = validateAcceleratorInput({ name: " Test Accelerator ", website: "https://accelerator.test", portfolioUrl: "https://accelerator.test/portfolio", description: " Public cohort " });
  assert.equal(input.name, "Test Accelerator");
  assert.equal(input.status, "active");
  assert.equal(input.portfolioUrl, "https://accelerator.test/portfolio");
});

test("rejects malformed API payloads and unsafe URL shapes", () => {
  assert.throws(() => validateAcceleratorInput(null), ValidationError);
  assert.throws(() => validateAcceleratorInput({ name: "A", website: "file:///tmp/a", portfolioUrl: "https://a.test" }), /http or https/);
  assert.throws(() => validateCohortInput({ acceleratorId: "accelerator_123", name: "C", year: 2200, portfolioUrl: "https://a.test" }), /between 1950 and 2100/);
  assert.throws(() => validateDiscoveryInput({ acceleratorId: "x" }), /invalid/);
});

test("validates startup listing filters", () => {
  assert.deepEqual(validateListFilters(new URL("https://app.test/api/startups?acceleratorId=accelerator_123")), { acceleratorId: "accelerator_123", cohortId: null });
  assert.throws(() => validateListFilters(new URL("https://app.test/api/startups?cohortId=x")), /invalid/);
});
