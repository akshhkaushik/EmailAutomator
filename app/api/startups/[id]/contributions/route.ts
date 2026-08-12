import { discoveryApiError } from "@/lib/discovery/api";
import { requireDiscoveryAccess } from "@/lib/discovery/auth";
import { getDiscoveryRepository } from "@/lib/discovery/redis-repository";
import { validateResourceId } from "@/lib/discovery/validation";
import { getIntelligenceRepository } from "@/lib/intelligence/redis-repository";
import { getContributionRepository } from "@/lib/contributions/redis-repository";
import { suggestContributions } from "@/lib/contributions/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireDiscoveryAccess(request);
    const { id } = await context.params;
    const startupId = validateResourceId(id, "Startup");
    const startup = await getDiscoveryRepository().getStartup(startupId);
    if (!startup) return Response.json({ error: "Startup was not found." }, { status: 404 });
    const opportunities = await getContributionRepository().list(startupId);
    return Response.json({ opportunities }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return discoveryApiError(error); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireDiscoveryAccess(request);
    const { id } = await context.params;
    const result = await suggestContributions({
      startupId: validateResourceId(id, "Startup"),
      discoveryRepository: getDiscoveryRepository(),
      intelligenceRepository: getIntelligenceRepository(),
      contributionRepository: getContributionRepository(),
    });
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return discoveryApiError(error); }
}
