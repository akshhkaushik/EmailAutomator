import { discoveryApiError, jsonBody } from "@/lib/discovery/api";
import { requireDiscoveryAccess } from "@/lib/discovery/auth";
import { getDiscoveryRepository } from "@/lib/discovery/redis-repository";
import { validateCohortInput, validateListFilters } from "@/lib/discovery/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireDiscoveryAccess(request);
    const filters = validateListFilters(new URL(request.url));
    const cohorts = await getDiscoveryRepository().listCohorts(filters.acceleratorId);
    return Response.json({ cohorts }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return discoveryApiError(error); }
}

export async function POST(request: Request) {
  try {
    await requireDiscoveryAccess(request);
    const input = validateCohortInput(await jsonBody(request));
    const cohort = await getDiscoveryRepository().createCohort(input);
    return Response.json({ cohort }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return discoveryApiError(error); }
}
