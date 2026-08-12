import type { Evidence, EvidenceConfidence, StartupIntelligence } from "../intelligence/types.ts";
import type { CapabilityProject, OpportunityScorecard, ProjectMatch } from "../scoring/types.ts";

export const CONTRIBUTION_STATUSES = ["suggested", "approved", "building", "built", "rejected"] as const;
export type ContributionStatus = typeof CONTRIBUTION_STATUSES[number];
export type ContributionDifficulty = "small" | "moderate" | "ambitious";
export type ContributionConfidence = "high" | "medium" | "low";

export type ContributionEvidence = {
  evidenceId: string;
  claim: string;
  valueSummary: string;
  sourceName: string;
  sourceUrl: string;
  observedAt: string;
  confidence: EvidenceConfidence;
};

export type ContributionScoreBreakdown = {
  evidenceStrength: number;
  startupRelevance: number;
  akshRelevance: number;
  effortFit: number;
  expectedImpact: number;
};

export type BuildSpecification = {
  problem: string;
  scope: string;
  proposedImplementation: string[];
  inputs: string[];
  outputs: string[];
  acceptanceCriteria: string[];
  estimatedEffortHours: number;
  relevantApis: Array<{ label: string; url: string }>;
  potentialDemo: string;
  generatedAt: string;
};

export type ContributionOpportunity = {
  id: string;
  startupId: string;
  type: string;
  title: string;
  problem: string;
  evidence: ContributionEvidence[];
  proposedSolution: string;
  expectedImpact: string;
  relevantAkshProjects: ProjectMatch[];
  relevantSkills: string[];
  estimatedDifficulty: ContributionDifficulty;
  estimatedEffortHours: number;
  contributionScore: number;
  contributionScoreBreakdown: ContributionScoreBreakdown;
  confidence: ContributionConfidence;
  confidenceScore: number;
  status: ContributionStatus;
  buildSpec: BuildSpecification | null;
  engineVersion: string;
  createdAt: string;
  updatedAt: string;
};

export type ContributionEngineConfig = {
  version: string;
  minimumStartupScore: number;
  maximumSuggestions: number;
  scoreWeights: ContributionScoreBreakdown;
};

export type ContributionEngineInput = {
  startupName: string;
  intelligence: StartupIntelligence;
  evidence: Evidence[];
  startupScorecard: OpportunityScorecard;
  projects?: CapabilityProject[];
  config?: ContributionEngineConfig;
};
