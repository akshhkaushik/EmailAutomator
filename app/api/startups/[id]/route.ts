import { discoveryApiError } from "@/lib/discovery/api";
import { requireDiscoveryAccess } from "@/lib/discovery/auth";
import { getDiscoveryRepository } from "@/lib/discovery/redis-repository";
import { validateResourceId } from "@/lib/discovery/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireDiscoveryAccess(request);
    const { id } = await context.params;
    const startup = await getDiscoveryRepository().getStartup(validateResourceId(id, "Startup"));
    if (!startup) return Response.json({ error: "Startup was not found." }, { status: 404 });
    return Response.json({ startup }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return discoveryApiError(error); }
}
