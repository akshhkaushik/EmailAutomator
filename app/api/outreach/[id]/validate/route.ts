import { discoveryApiError, jsonBody } from "@/lib/discovery/api";
import { requireDiscoveryAccess } from "@/lib/discovery/auth";
import { getDiscoveryRepository } from "@/lib/discovery/redis-repository";
import { ValidationError, validateResourceId } from "@/lib/discovery/validation";
import { getIntelligenceRepository } from "@/lib/intelligence/redis-repository";
import { getOutreachRepository } from "@/lib/outreach/redis-repository";
import { detectEditedCompanyClaims, validateOutreachClaims } from "@/lib/outreach/validation";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireDiscoveryAccess(request);
    const { id } = await context.params;
    const repository = getOutreachRepository();
    const draft = await repository.get(validateResourceId(id, "Outreach draft"));
    if (!draft) return Response.json({ error: "Outreach draft was not found." }, { status: 404 });
    const input = await jsonBody(request);
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new ValidationError("Request body must be a JSON object.");
    const body = typeof (input as Record<string, unknown>).body === "string" ? String((input as Record<string, unknown>).body).trim() : "";
    const subject = typeof (input as Record<string, unknown>).subject === "string" ? String((input as Record<string, unknown>).subject).trim() : "";
    const recipientEmail = typeof (input as Record<string, unknown>).recipientEmail === "string" ? String((input as Record<string, unknown>).recipientEmail).trim().toLowerCase() : "";
    if (!body || !subject || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) throw new ValidationError("Recipient, subject, and body are required for validation.");
    if (draft.recipientContactId && recipientEmail !== draft.recipientEmail) throw new ValidationError("A discovered founder recipient cannot be changed without selecting and verifying a new contact.");
    const startup = await getDiscoveryRepository().getStartup(draft.startupId);
    if (!startup) throw new Error("Startup was not found.");
    const evidence = await getIntelligenceRepository().listEvidence(draft.startupId);
    const editedClaims = detectEditedCompanyClaims(body, startup.name, draft.detectedClaims);
    const claims = [...draft.detectedClaims.filter((claim) => body.includes(claim.text)), ...editedClaims.filter((claim) => !draft.detectedClaims.some((original) => original.text === claim.text))];
    const validation = validateOutreachClaims(claims, evidence);
    const updated = await repository.updateValidatedContent(draft.id, subject, body, recipientEmail, validation);
    return Response.json({ draft: updated }, { status: validation.valid ? 200 : 422, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return discoveryApiError(error); }
}
