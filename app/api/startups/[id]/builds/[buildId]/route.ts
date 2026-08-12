import { discoveryApiError, jsonBody } from "@/lib/discovery/api";
import { requireDiscoveryAccess } from "@/lib/discovery/auth";
import { validateResourceId } from "@/lib/discovery/validation";
import { getBuildRepository } from "@/lib/builds/redis-repository";
import { validateBuildProof, validateBuildStatus } from "@/lib/builds/validation";

export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string; buildId: string }> }) {
  try { await requireDiscoveryAccess(request); const { id, buildId } = await context.params; const startupId = validateResourceId(id, "Startup"); const specId = validateResourceId(buildId, "Build specification"); const input = await jsonBody(request); const repository = getBuildRepository(); const action = new URL(request.url).searchParams.get("action"); const build = action === "proof" ? await repository.attachProof(startupId, specId, validateBuildProof(input)) : await repository.updateStatus(startupId, specId, validateBuildStatus(input)); return Response.json({ build }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return discoveryApiError(error); }
}
