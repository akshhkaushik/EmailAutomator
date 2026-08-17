import { discoveryApiError } from "@/lib/discovery/api";
import { requireDiscoveryAccess } from "@/lib/discovery/auth";
import { getDiscoveryRepository } from "@/lib/discovery/redis-repository";
import { validateResourceId } from "@/lib/discovery/validation";
import { getIntelligenceRepository } from "@/lib/intelligence/redis-repository";
import { scoreStartupOpportunity } from "@/lib/scoring/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireDiscoveryAccess(request);
    const { id } = await context.params;
    const startupId = validateResourceId(id, "Startup");
    const discoveryRepository = getDiscoveryRepository();
    const startup = await discoveryRepository.getStartup(startupId);
    if (!startup) return Response.json({ error: "Startup was not found." }, { status: 404 });
    const repository = getIntelligenceRepository();
    const [intelligence, evidence, runs] = await Promise.all([
      repository.getIntelligence(startupId), repository.listEvidence(startupId), repository.listResearchRuns(startupId, 10),
    ]);
    const scorecard = intelligence ? scoreStartupOpportunity({ intelligence, evidence }) : null;
    return Response.json({ startup, intelligence, evidence, runs, scorecard }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return discoveryApiError(error); }
}
