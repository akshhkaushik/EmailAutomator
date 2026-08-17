import type { LearningAnalytics, MetricSlice, OutreachOutcome } from "./types.ts";

const POSITIVE = new Set(["interested", "maybe", "referral"]);
function rate(count: number, total: number) { return total ? Math.round(count / total * 1000) / 10 : 0; }
function slice(label: string, records: OutreachOutcome[]): MetricSlice {
  const replies = records.filter((item) => item.replyStatus === "replied").length;
  const positiveReplies = records.filter((item) => item.replyClassification && POSITIVE.has(item.replyClassification)).length;
  return { label, sent: records.length, replies, positiveReplies, replyRate: rate(replies, records.length), positiveReplyRate: rate(positiveReplies, records.length), sampleSize: records.length, interpretation: records.length < 5 ? "Insufficient sample; show the rate without drawing a conclusion." : "Descriptive association only; this does not establish causation." };
}
function grouped(records: OutreachOutcome[], values: (item: OutreachOutcome) => string[]) {
  const groups = new Map<string, OutreachOutcome[]>();
  for (const item of records) for (const value of values(item).filter(Boolean)) groups.set(value, [...(groups.get(value) || []), item]);
  return [...groups.entries()].map(([label, rows]) => slice(label, rows)).sort((a, b) => b.sampleSize - a.sampleSize || a.label.localeCompare(b.label));
}

export function calculateLearningAnalytics(records: OutreachOutcome[], generatedAt = new Date().toISOString()): LearningAnalytics {
  const overall = slice("Overall", records);
  const byTier = grouped(records, (item) => [item.startupTier]);
  const byMode = grouped(records, (item) => [item.outreachMode]);
  const candidates = [...byTier.map((metric) => ({ family: "startup tier", metric })), ...byMode.map((metric) => ({ family: "outreach mode", metric }))]
    .filter(({ metric }) => metric.sampleSize >= 5).sort((a, b) => b.metric.positiveReplyRate - a.metric.positiveReplyRate);
  const best = candidates[0];
  return {
    generatedAt,
    totals: { sent: records.length, replies: overall.replies, positiveReplies: overall.positiveReplies, replyRate: overall.replyRate, positiveReplyRate: overall.positiveReplyRate, interviews: records.filter((item) => item.interview).length, technicalTasks: records.filter((item) => item.technicalTask).length, referrals: records.filter((item) => item.referral).length, rejections: records.filter((item) => item.rejection).length, offers: records.filter((item) => item.offer).length, opportunitiesBuilt: records.filter((item) => item.buildBeforeAsk).length, opportunitiesConverted: records.filter((item) => item.buildBeforeAsk && (item.interview || item.technicalTask || item.offer)).length },
    byTier,
    byFundingStage: grouped(records, (item) => [item.fundingStage || "unknown"]),
    byTeamSize: grouped(records, (item) => [item.teamSize || "unknown"]),
    bySignalType: grouped(records, (item) => item.signalTypes.length ? item.signalTypes : ["unknown"]),
    byOutreachMode: byMode,
    byContributionType: grouped(records, (item) => [item.contributionType || "unknown"]),
    buildBeforeAsk: grouped(records, (item) => [item.buildBeforeAsk ? "Build-before-ask" : "Contribution without build proof"]),
    suggestedAdjustments: best ? [{ title: `Review ${best.family}: ${best.metric.label}`, evidence: `${best.metric.label} has a ${best.metric.positiveReplyRate}% positive reply rate in the current descriptive sample. Compare against other groups before changing weights.`, sampleSize: best.metric.sampleSize, requiresApproval: true }] : [],
  };
}
