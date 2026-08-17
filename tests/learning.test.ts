import test from "node:test";
import assert from "node:assert/strict";
import { calculateLearningAnalytics } from "../lib/learning/analytics.ts";
import { recommendFollowUp } from "../lib/learning/follow-ups.ts";
import { InMemoryOutcomeRepository } from "../lib/learning/memory-repository.ts";
import { validateOutcomePatch } from "../lib/learning/validation.ts";
import type { OutreachOutcome } from "../lib/learning/types.ts";

function outcome(id: string, patch: Partial<OutreachOutcome> = {}): OutreachOutcome { return { id, startupId: `startup_${id}`, outreachId: `outreach_${id}`, trackingId: null, sentAt: "2026-08-01T00:00:00.000Z", replyStatus: "pending", replyClassification: null, followUpCount: 0, interview: false, technicalTask: false, referral: false, rejection: false, offer: false, notes: "", startupTier: "A", fundingStage: "Seed", teamSize: "2–10", signalTypes: ["product"], outreachMode: "contribution", contributionType: "SDK", buildBeforeAsk: false, updatedAt: "2026-08-01T00:00:00.000Z", ...patch }; }

test("creates and updates classified outcomes", async () => {
  const repository = new InMemoryOutcomeRepository(); await repository.save(outcome("one"));
  const patch = validateOutcomePatch({ replyClassification: "interested", interview: true, notes: "Call booked" });
  const updated = await repository.update("one", patch);
  assert.equal(updated.replyStatus, "replied"); assert.equal(updated.interview, true); assert.equal(updated.notes, "Call booked");
  assert.throws(() => validateOutcomePatch({ replyClassification: "great_reply" }), /Reply classification/);
});

test("outcome creation is idempotent by outreach", async () => {
  const repository = new InMemoryOutcomeRepository();
  const first = await repository.save(outcome("one"));
  const duplicate = await repository.save(outcome("two", { outreachId: first.outreachId }));
  assert.equal(duplicate.id, first.id);
  assert.equal((await repository.list()).length, 1);
});

test("follow-up cadence is day 4, 10, and 21 and never sends automatically", () => {
  const first = recommendFollowUp(outcome("one"), new Date("2026-08-05T00:00:00.000Z")); assert.equal(first?.cadenceDay, 4); assert.equal(first?.requiresApproval, true);
  assert.equal(recommendFollowUp(outcome("two", { followUpCount: 1 }), new Date("2026-08-10T23:59:59.000Z")), null);
  assert.equal(recommendFollowUp(outcome("two", { followUpCount: 1 }), new Date("2026-08-11T00:00:00.000Z"))?.cadenceDay, 10);
  assert.equal(recommendFollowUp(outcome("three", { followUpCount: 2 }), new Date("2026-08-22T00:00:00.000Z"))?.cadenceDay, 21);
  assert.equal(recommendFollowUp(outcome("reply", { replyStatus: "replied", replyClassification: "maybe" }), new Date("2026-09-01T00:00:00.000Z")), null);
});

test("analytics shows rates with sample size and cautious small-sample language", () => {
  const records = [outcome("a", { replyStatus: "replied", replyClassification: "interested", buildBeforeAsk: true }), outcome("b", { replyStatus: "no_response", replyClassification: "no_response" })];
  const analytics = calculateLearningAnalytics(records, "2026-08-12T00:00:00.000Z");
  assert.equal(analytics.totals.replyRate, 50); assert.equal(analytics.totals.positiveReplyRate, 50);
  assert.equal(analytics.byTier[0].sampleSize, 2); assert.match(analytics.byTier[0].interpretation, /Insufficient sample/);
  assert.equal(analytics.suggestedAdjustments.length, 0);
});

test("learning suggestions require adequate sample and human approval", () => {
  const records = Array.from({ length: 6 }, (_, index) => outcome(String(index), { outreachMode: "build_before_ask", buildBeforeAsk: true, replyStatus: index < 3 ? "replied" : "no_response", replyClassification: index < 3 ? "interested" : "no_response" }));
  const analytics = calculateLearningAnalytics(records);
  assert.ok(analytics.suggestedAdjustments.length > 0); assert.equal(analytics.suggestedAdjustments[0].requiresApproval, true); assert.equal(analytics.suggestedAdjustments[0].sampleSize, 6);
});
