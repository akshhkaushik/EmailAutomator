import { discoveryApiError, jsonBody } from "@/lib/discovery/api";
import { requireDiscoveryAccess } from "@/lib/discovery/auth";
import { PublicPortfolioPageSource } from "@/lib/discovery/public-portfolio-source";
import { enforceDiscoveryRateLimit } from "@/lib/discovery/rate-limit";
import { discoveryRedisFromEnvironment, getDiscoveryRepository } from "@/lib/discovery/redis-repository";
import { runDiscovery } from "@/lib/discovery/service";
import { validateDiscoveryInput } from "@/lib/discovery/validation";
import { withOperationLock } from "@/lib/reliability";

export const maxDuration = 30;
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await requireDiscoveryAccess(request);
    await enforceDiscoveryRateLimit(identity.email);
    const input = validateDiscoveryInput(await jsonBody(request));
    const redis = discoveryRedisFromEnvironment();
    if (!redis) throw new Error("Startup discovery storage is not configured. Connect Upstash Redis first.");
    const result = await withOperationLock(redis, `discovery:${input.acceleratorId}:${input.cohortId || "all"}`, 45, () => runDiscovery({
      repository: getDiscoveryRepository(), source: new PublicPortfolioPageSource(), acceleratorId: input.acceleratorId, cohortId: input.cohortId,
    }));
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return discoveryApiError(error); }
}
