import { discoveryApiError } from "@/lib/discovery/api";
import { requireDiscoveryAccess } from "@/lib/discovery/auth";
import { enforceStartupResearchRateLimit } from "@/lib/discovery/rate-limit";
import { discoveryRedisFromEnvironment, getDiscoveryRepository } from "@/lib/discovery/redis-repository";
import { validateResourceId } from "@/lib/discovery/validation";
import { researchStartup } from "@/lib/intelligence/orchestrator";
import { getIntelligenceRepository } from "@/lib/intelligence/redis-repository";
import { withOperationLock } from "@/lib/reliability";

export const maxDuration = 30;
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireDiscoveryAccess(request);
    await enforceStartupResearchRateLimit(identity.email);
    const { id } = await context.params;
    const startupId = validateResourceId(id, "Startup");
    const redis = discoveryRedisFromEnvironment();
    if (!redis) throw new Error("Startup intelligence storage is not configured. Connect Upstash Redis first.");
    const result = await withOperationLock(redis, `research:${startupId}`, 45, () => researchStartup({
      startupId, discoveryRepository: getDiscoveryRepository(), intelligenceRepository: getIntelligenceRepository(),
    }));
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return discoveryApiError(error); }
}
