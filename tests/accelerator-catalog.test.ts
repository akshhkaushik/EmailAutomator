import test from "node:test";
import assert from "node:assert/strict";
import { ACCELERATOR_CATALOG } from "../lib/discovery/accelerator-catalog.ts";

test("user accelerator catalog is canonical, tiered, and deduplicated", () => {
  assert.equal(new Set(ACCELERATOR_CATALOG.map((item) => item.id)).size, ACCELERATOR_CATALOG.length);
  assert.ok(ACCELERATOR_CATALOG.every((item) => [1, 2, 3, 4].includes(item.tier)));
  assert.equal(ACCELERATOR_CATALOG.find((item) => item.id === "neo")?.tier, 1);
  assert.ok(ACCELERATOR_CATALOG.find((item) => item.id === "neo")?.aliases.includes("NEO"));
  assert.ok(ACCELERATOR_CATALOG.find((item) => item.id === "entrepreneur-first")?.aliases.includes("Entrepreneur First London"));
  assert.ok(ACCELERATOR_CATALOG.some((item) => item.id === "accel-atoms"));
  assert.ok(ACCELERATOR_CATALOG.some((item) => item.id === "plug-and-play"));
  assert.ok(ACCELERATOR_CATALOG.some((item) => item.id === "tinyseed"));
});
