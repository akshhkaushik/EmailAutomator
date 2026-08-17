import type { ContributionEngineConfig } from "./types.ts";

export const DEFAULT_CONTRIBUTION_ENGINE_CONFIG: ContributionEngineConfig = {
  version: "contribution-v1",
  minimumStartupScore: 55,
  maximumSuggestions: 4,
  scoreWeights: {
    evidenceStrength: 30,
    startupRelevance: 25,
    akshRelevance: 20,
    effortFit: 10,
    expectedImpact: 15,
  },
};

export function validateContributionConfig(config: ContributionEngineConfig) {
  const total = Object.values(config.scoreWeights).reduce((sum, weight) => sum + weight, 0);
  if (total !== 100) throw new Error(`Contribution score weights must total 100; received ${total}.`);
  if (!Number.isFinite(config.minimumStartupScore) || config.minimumStartupScore < 0 || config.minimumStartupScore > 100) throw new Error("Minimum startup score must be between 0 and 100.");
  if (!Number.isInteger(config.maximumSuggestions) || config.maximumSuggestions < 1 || config.maximumSuggestions > 10) throw new Error("Maximum suggestions must be between 1 and 10.");
  return config;
}
