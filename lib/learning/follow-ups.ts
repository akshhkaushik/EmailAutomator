import type { OutreachOutcome, FollowUpRecommendation } from "./types.ts";

const DAY = 86_400_000;
const CADENCE = [{ day: 4 as const, angle: "Add one useful detail, question, or clarification tied to the original contribution." }, { day: 10 as const, angle: "Share genuinely new public evidence or completed contribution proof; do not repeat the first email." }, { day: 21 as const, angle: "Close the loop politely with one final low-friction option to respond or redirect." }];

export function recommendFollowUp(outcome: OutreachOutcome, now = new Date()): FollowUpRecommendation | null {
  if (outcome.replyStatus !== "pending" || outcome.replyClassification && outcome.replyClassification !== "no_response") return null;
  const next = CADENCE[outcome.followUpCount];
  if (!next) return null;
  const eligibleAt = new Date(Date.parse(outcome.sentAt) + next.day * DAY);
  if (now.getTime() < eligibleAt.getTime()) return null;
  return { outcomeId: outcome.id, startupId: outcome.startupId, outreachId: outcome.outreachId, followUpNumber: outcome.followUpCount + 1, cadenceDay: next.day, eligibleAt: eligibleAt.toISOString(), reason: `No reply is recorded ${next.day} days after the initial outreach.`, suggestedAngle: next.angle, requiresApproval: true };
}
