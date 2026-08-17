import { discoveryApiError } from "@/lib/discovery/api";
import { requireDiscoveryAccess } from "@/lib/discovery/auth";
import { validateResourceId } from "@/lib/discovery/validation";
import { generateBuildSpecification } from "@/lib/contributions/build-spec";
import { getContributionRepository } from "@/lib/contributions/redis-repository";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string; opportunityId: string }> }) {
  try {
    await requireDiscoveryAccess(request);
    const { id, opportunityId } = await context.params;
    const startupId = validateResourceId(id, "Startup");
    const contributionId = validateResourceId(opportunityId, "Contribution opportunity");
    const repository = getContributionRepository();
    const existing = await repository.get(startupId, contributionId);
    if (!existing) return Response.json({ error: "Contribution opportunity was not found." }, { status: 404 });
    const opportunity = await repository.saveBuildSpec(startupId, contributionId, generateBuildSpecification(existing));
    return Response.json({ opportunity }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return discoveryApiError(error); }
}
