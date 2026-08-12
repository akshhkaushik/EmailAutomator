import type { Evidence, StartupIntelligence } from "../intelligence/types.ts";

export const SCORE_DIMENSIONS = [
  "fundingMomentum",
  "teamLeverage",
  "technicalFit",
  "founderAccessibility",
  "hiringSignal",
  "contributionPotential",
  "companyMomentum",
] as const;

export type ScoreDimension = typeof SCORE_DIMENSIONS[number];
export type OpportunityTier = "S" | "A" | "B" | "C";
export type ScoreConfidenceLabel = "high" | "medium" | "low";

export type OpportunityScoringConfig = {
  version: string;
  weights: Record<ScoreDimension, number>;
  tiers: Record<OpportunityTier, number>;
  fundingDayBands: Array<{ maxDays: number | null; score: number; label: string }>;
  teamBands: Array<{ min: number; max: number | null; score: number; label: string }>;
};

export type CapabilityProject = {
  id: string;
  name: string;
  description: string;
  technologies: string[];
  problemDomains: string[];
  capabilitiesDemonstrated: string[];
  repositoryUrl: string;
  demoUrl: string;
  maturity: "live" | "substantial" | "prototype" | "learning";
};

export type ProjectMatch = {
  projectId: string;
  projectName: string;
  matchedConcepts: string[];
  repositoryUrl: string;
  demoUrl: string;
};

export type DimensionScore = {
  dimension: ScoreDimension;
  label: string;
  score: number;
  confidence: number;
  earnedPoints: number;
  maxPoints: number;
  reason: string;
  evidenceIds: string[];
  projectMatches: ProjectMatch[];
};

export type OpportunityScorecard = {
  startupId: string;
  score: number;
  scoreConfidence: number;
  scoreConfidenceLabel: ScoreConfidenceLabel;
  tier: OpportunityTier;
  factors: DimensionScore[];
  configVersion: string;
  intelligenceBuiltAt: string;
};

export type ScoringInput = {
  intelligence: StartupIntelligence;
  evidence: Evidence[];
  projects?: CapabilityProject[];
  config?: OpportunityScoringConfig;
};
