import type { DiscoveryRepository } from "../discovery/repository.ts";
import type { IntelligenceRepository } from "../intelligence/repository.ts";
import { scoreStartupOpportunity } from "../scoring/engine.ts";
import { generateContributionOpportunities } from "./engine.ts";
import type { ContributionRepository } from "./repository.ts";
import { structuredLog } from "../observability.ts";

export async function suggestContributions(input: {
  startupId: string;
  discoveryRepository: DiscoveryRepository;
  intelligenceRepository: IntelligenceRepository;
  contributionRepository: ContributionRepository;
}) {
  const startedAt = Date.now();
  structuredLog("info", "opportunity_generation.started", { startupId: input.startupId });
  const startup = await input.discoveryRepository.getStartup(input.startupId);
  if (!startup) throw new Error("Startup was not found.");
  const [intelligence, evidence] = await Promise.all([
    input.intelligenceRepository.getIntelligence(input.startupId),
    input.intelligenceRepository.listEvidence(input.startupId),
  ]);
  if (!intelligence) throw new Error("Research this startup before suggesting contributions.");
  const scorecard = scoreStartupOpportunity({ intelligence, evidence });
  const suggestions = generateContributionOpportunities({ startupName: startup.name, intelligence, evidence, startupScorecard: scorecard });
  const opportunities = await input.contributionRepository.upsertSuggestions(startup.id, suggestions);
  structuredLog("info", "opportunity_generation.completed", { startupId: startup.id, generated: suggestions.length, total: opportunities.length, durationMs: Date.now() - startedAt });
  return { startup, scorecard, generated: suggestions.length, opportunities };
}
