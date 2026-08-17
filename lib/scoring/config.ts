import type { OpportunityScoringConfig } from "./types.ts";

export const DEFAULT_OPPORTUNITY_SCORING_CONFIG: OpportunityScoringConfig = {
  version: "opportunity-v1",
  weights: {
    fundingMomentum: 20,
    teamLeverage: 15,
    technicalFit: 20,
    founderAccessibility: 15,
    hiringSignal: 10,
    contributionPotential: 15,
    companyMomentum: 5,
  },
  tiers: { S: 85, A: 70, B: 55, C: 0 },
  fundingDayBands: [
    { maxDays: 30, score: 100, label: "within 30 days" },
    { maxDays: 60, score: 85, label: "31–60 days ago" },
    { maxDays: 90, score: 70, label: "61–90 days ago" },
    { maxDays: 180, score: 50, label: "91–180 days ago" },
    { maxDays: null, score: 20, label: "more than 180 days ago" },
  ],
  teamBands: [
    { min: 1, max: 1, score: 80, label: "one-person team" },
    { min: 2, max: 10, score: 100, label: "2–10 people" },
    { min: 11, max: 25, score: 80, label: "11–25 people" },
    { min: 26, max: 50, score: 60, label: "26–50 people" },
    { min: 51, max: null, score: 35, label: "more than 50 people" },
  ],
};

export function validateScoringConfig(config: OpportunityScoringConfig) {
  const total = Object.values(config.weights).reduce((sum, weight) => sum + weight, 0);
  if (total !== 100) throw new Error(`Opportunity score weights must total 100; received ${total}.`);
  for (const [dimension, weight] of Object.entries(config.weights)) {
    if (!Number.isFinite(weight) || weight < 0) throw new Error(`${dimension} weight must be a non-negative number.`);
  }
  if (!(config.tiers.S > config.tiers.A && config.tiers.A > config.tiers.B && config.tiers.B >= config.tiers.C)) {
    throw new Error("Opportunity tier thresholds must descend from S to C.");
  }
  return config;
}
