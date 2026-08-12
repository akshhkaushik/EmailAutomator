import { discoveryApiError, jsonBody } from "@/lib/discovery/api";
import { requireDiscoveryAccess } from "@/lib/discovery/auth";
import { getDiscoveryRepository } from "@/lib/discovery/redis-repository";
import { validateResourceId, ValidationError } from "@/lib/discovery/validation";
import { getIntelligenceRepository } from "@/lib/intelligence/redis-repository";
import { getContributionRepository } from "@/lib/contributions/redis-repository";
import { getBuildRepository } from "@/lib/builds/redis-repository";
import { getOutreachRepository } from "@/lib/outreach/redis-repository";
import { createIntelligenceOutreach } from "@/lib/outreach/service";
import { OUTREACH_MODES, type OutreachMode } from "@/lib/outreach/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { await requireDiscoveryAccess(request); const { id } = await context.params; return Response.json({ drafts: await getOutreachRepository().list(validateResourceId(id, "Startup")) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return discoveryApiError(error); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireDiscoveryAccess(request);
    const body = await jsonBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("Request body must be a JSON object.");
    const input = body as Record<string, unknown>;
    if (typeof input.opportunityId !== "string") throw new ValidationError("Contribution opportunity is required.");
    if (typeof input.mode !== "string" || !OUTREACH_MODES.includes(input.mode as OutreachMode)) throw new ValidationError(`Outreach mode must be one of: ${OUTREACH_MODES.join(", ")}.`);
    const recipientEmail = typeof input.recipientEmail === "string" ? input.recipientEmail.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) throw new ValidationError("Enter a valid recipient email.");
    const { id } = await context.params;
    const result = await createIntelligenceOutreach({
      startupId: validateResourceId(id, "Startup"), opportunityId: validateResourceId(input.opportunityId, "Contribution opportunity"), mode: input.mode as OutreachMode,
      recipientEmail, recipientName: typeof input.recipientName === "string" ? input.recipientName.trim().slice(0, 120) : "",
      discoveryRepository: getDiscoveryRepository(), intelligenceRepository: getIntelligenceRepository(), contributionRepository: getContributionRepository(), buildRepository: getBuildRepository(), outreachRepository: getOutreachRepository(),
    });
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return discoveryApiError(error); }
}
