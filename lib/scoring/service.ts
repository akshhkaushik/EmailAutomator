import type { DiscoveryRepository, StartupFilters } from "../discovery/repository.ts";
import type { IntelligenceRepository } from "../intelligence/repository.ts";
import { scoreStartupOpportunity } from "./engine.ts";
import { structuredLog } from "../observability.ts";

export async function rankStartupOpportunities(input: {
  discoveryRepository: DiscoveryRepository;
  intelligenceRepository: IntelligenceRepository;
  filters?: StartupFilters;
}) {
  const startups = await input.discoveryRepository.listStartups(input.filters);
  const ranked = await Promise.all(startups.map(async (startup) => {
    const [intelligence, evidence] = await Promise.all([
      input.intelligenceRepository.getIntelligence(startup.id),
      input.intelligenceRepository.listEvidence(startup.id),
    ]);
    return {
      startup,
      scorecard: intelligence ? scoreStartupOpportunity({ intelligence, evidence }) : null,
    };
  }));
  const result = ranked.sort((a, b) => (b.scorecard?.score || 0) - (a.scorecard?.score || 0)
    || (b.scorecard?.scoreConfidence || 0) - (a.scorecard?.scoreConfidence || 0)
    || a.startup.name.localeCompare(b.startup.name));
  structuredLog("info", "scoring.completed", { startups: result.length, scored: result.filter((item) => item.scorecard).length });
  return result;
}
