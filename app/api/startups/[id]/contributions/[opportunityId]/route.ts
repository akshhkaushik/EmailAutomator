import { discoveryApiError, jsonBody } from "@/lib/discovery/api";
import { requireDiscoveryAccess } from "@/lib/discovery/auth";
import { validateResourceId } from "@/lib/discovery/validation";
import { getContributionRepository } from "@/lib/contributions/redis-repository";
import { validateContributionStatus } from "@/lib/contributions/validation";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string; opportunityId: string }> }) {
  try {
    await requireDiscoveryAccess(request);
    const { id, opportunityId } = await context.params;
    const opportunity = await getContributionRepository().updateStatus(
      validateResourceId(id, "Startup"),
      validateResourceId(opportunityId, "Contribution opportunity"),
      validateContributionStatus(await jsonBody(request)),
    );
    return Response.json({ opportunity }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return discoveryApiError(error); }
}
