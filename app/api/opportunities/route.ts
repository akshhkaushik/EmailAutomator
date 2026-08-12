import { discoveryApiError } from "@/lib/discovery/api";
import { requireDiscoveryAccess } from "@/lib/discovery/auth";
import { getDiscoveryRepository } from "@/lib/discovery/redis-repository";
import { validateListFilters } from "@/lib/discovery/validation";
import { getIntelligenceRepository } from "@/lib/intelligence/redis-repository";
import { DEFAULT_OPPORTUNITY_SCORING_CONFIG } from "@/lib/scoring/config";
import { rankStartupOpportunities } from "@/lib/scoring/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireDiscoveryAccess(request);
    const opportunities = await rankStartupOpportunities({
      discoveryRepository: getDiscoveryRepository(),
      intelligenceRepository: getIntelligenceRepository(),
      filters: validateListFilters(new URL(request.url)),
    });
    return Response.json({
      opportunities,
      scoringConfig: {
        version: DEFAULT_OPPORTUNITY_SCORING_CONFIG.version,
        weights: DEFAULT_OPPORTUNITY_SCORING_CONFIG.weights,
        tiers: DEFAULT_OPPORTUNITY_SCORING_CONFIG.tiers,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return discoveryApiError(error); }
}
