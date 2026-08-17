import { discoveryApiError } from "@/lib/discovery/api";
import { requireDiscoveryAccess } from "@/lib/discovery/auth";
import { getDiscoveryRepository } from "@/lib/discovery/redis-repository";
import { validateListFilters } from "@/lib/discovery/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireDiscoveryAccess(request);
    const filters = validateListFilters(new URL(request.url));
    const startups = await getDiscoveryRepository().listStartups(filters);
    return Response.json({ startups }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return discoveryApiError(error); }
}
