import { discoveryApiError, jsonBody } from "@/lib/discovery/api";
import { requireDiscoveryAccess } from "@/lib/discovery/auth";
import { validateResourceId, ValidationError } from "@/lib/discovery/validation";
import { getIntelligenceRepository } from "@/lib/intelligence/redis-repository";
import { getContributionRepository } from "@/lib/contributions/redis-repository";
import { getBuildRepository } from "@/lib/builds/redis-repository";
import { generateBuildSpec } from "@/lib/builds/engine";
import { scoreStartupOpportunity } from "@/lib/scoring/engine";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { try { await requireDiscoveryAccess(request); const { id } = await context.params; return Response.json({ builds: await getBuildRepository().list(validateResourceId(id, "Startup")) }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return discoveryApiError(error); } }
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireDiscoveryAccess(request); const { id } = await context.params; const startupId = validateResourceId(id, "Startup"); const body = await jsonBody(request);
    if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).opportunityId !== "string") throw new ValidationError("Contribution opportunity is required.");
    const opportunity = await getContributionRepository().get(startupId, validateResourceId((body as { opportunityId: string }).opportunityId, "Contribution opportunity"));
    if (!opportunity) throw new Error("Contribution opportunity was not found.");
    const intelligenceRepository = getIntelligenceRepository(); const [intelligence, evidence] = await Promise.all([intelligenceRepository.getIntelligence(startupId), intelligenceRepository.listEvidence(startupId)]);
    if (!intelligence) throw new Error("Startup intelligence was not found.");
    const spec = await getBuildRepository().upsert(generateBuildSpec(opportunity, scoreStartupOpportunity({ intelligence, evidence })));
    return Response.json({ build: spec }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return discoveryApiError(error); }
}
