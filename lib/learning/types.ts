import type { OutreachMode } from "../outreach/types.ts";
import type { OpportunityTier } from "../scoring/types.ts";

export const REPLY_CATEGORIES = ["interested", "maybe", "referral", "wrong_person", "rejected", "no_response"] as const;
export type ReplyCategory = typeof REPLY_CATEGORIES[number];

export type OutreachOutcome = {
  id: string;
  startupId: string;
  outreachId: string;
  trackingId: string | null;
  sentAt: string;
  replyStatus: "pending" | "replied" | "no_response";
  replyClassification: ReplyCategory | null;
  followUpCount: number;
  interview: boolean;
  technicalTask: boolean;
  referral: boolean;
  rejection: boolean;
  offer: boolean;
  notes: string;
  startupTier: OpportunityTier;
  fundingStage: string;
  teamSize: string;
  signalTypes: string[];
  outreachMode: OutreachMode;
  contributionType: string;
  buildBeforeAsk: boolean;
  updatedAt: string;
};

export type FollowUpRecommendation = {
  outcomeId: string;
  startupId: string;
  outreachId: string;
  followUpNumber: number;
  cadenceDay: 4 | 10 | 21;
  eligibleAt: string;
  reason: string;
  suggestedAngle: string;
  requiresApproval: true;
};

export type MetricSlice = { label: string; sent: number; replies: number; positiveReplies: number; replyRate: number; positiveReplyRate: number; sampleSize: number; interpretation: string };
export type LearningAnalytics = {
  generatedAt: string;
  totals: { sent: number; replies: number; positiveReplies: number; replyRate: number; positiveReplyRate: number; interviews: number; technicalTasks: number; referrals: number; rejections: number; offers: number; opportunitiesBuilt: number; opportunitiesConverted: number };
  byTier: MetricSlice[];
  byFundingStage: MetricSlice[];
  byTeamSize: MetricSlice[];
  bySignalType: MetricSlice[];
  byOutreachMode: MetricSlice[];
  byContributionType: MetricSlice[];
  buildBeforeAsk: MetricSlice[];
  suggestedAdjustments: Array<{ title: string; evidence: string; sampleSize: number; requiresApproval: true }>;
};
