import { AKSH_CAPABILITY_PROFILE } from "./capability-profile.ts";
import { DEFAULT_OPPORTUNITY_SCORING_CONFIG, validateScoringConfig } from "./config.ts";
import {
  scoreCompanyMomentum,
  scoreContributionPotential,
  scoreFounderAccessibility,
  scoreFundingMomentum,
  scoreHiringSignal,
  scoreTeamLeverage,
  scoreTechnicalFit,
} from "./dimensions.ts";
import type { OpportunityScorecard, OpportunityScoringConfig, OpportunityTier, ScoreConfidenceLabel, ScoringInput } from "./types.ts";

function tierForScore(score: number, config: OpportunityScoringConfig): OpportunityTier {
  if (score >= config.tiers.S) return "S";
  if (score >= config.tiers.A) return "A";
  if (score >= config.tiers.B) return "B";
  return "C";
}

export function confidenceLabel(confidence: number): ScoreConfidenceLabel {
  return confidence >= 75 ? "high" : confidence >= 45 ? "medium" : "low";
}

export function assignOpportunityTier(score: number, config = DEFAULT_OPPORTUNITY_SCORING_CONFIG) {
  return tierForScore(score, validateScoringConfig(config));
}

export function scoreStartupOpportunity(input: ScoringInput): OpportunityScorecard {
  const config = validateScoringConfig(input.config || DEFAULT_OPPORTUNITY_SCORING_CONFIG);
  const projects = input.projects || AKSH_CAPABILITY_PROFILE;
  const evidenceById = new Map(input.evidence.map((item) => [item.id, item]));
  const factors = [
    scoreFundingMomentum(input.intelligence, evidenceById, config),
    scoreTeamLeverage(input.intelligence, evidenceById, config),
    scoreTechnicalFit(input.intelligence, evidenceById, projects, config),
    scoreFounderAccessibility(input.intelligence, evidenceById, config),
    scoreHiringSignal(input.intelligence, evidenceById, config),
    scoreContributionPotential(input.intelligence, evidenceById, projects, config),
    scoreCompanyMomentum(input.intelligence, evidenceById, config),
  ];
  const score = Math.round(factors.reduce((sum, item) => sum + item.earnedPoints, 0));
  const scoreConfidence = Math.round(factors.reduce((sum, item) => sum + item.confidence * item.maxPoints / 100, 0));
  return {
    startupId: input.intelligence.startupId,
    score,
    scoreConfidence,
    scoreConfidenceLabel: confidenceLabel(scoreConfidence),
    tier: tierForScore(score, config),
    factors,
    configVersion: config.version,
    intelligenceBuiltAt: input.intelligence.builtAt,
  };
}
