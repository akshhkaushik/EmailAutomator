import { getFounderContactRepository } from "@/lib/contacts/redis-repository";
import { founderEmailProviderFromEnvironment } from "@/lib/contacts/provider";
import { discoverFounderContacts } from "@/lib/contacts/service";
import { discoveryApiError, jsonBody } from "@/lib/discovery/api";
import { requireDiscoveryAccess } from "@/lib/discovery/auth";
import { getDiscoveryRepository } from "@/lib/discovery/redis-repository";
import { enforceFounderContactRateLimit } from "@/lib/discovery/rate-limit";
import { validateResourceId, ValidationError } from "@/lib/discovery/validation";
import { getIntelligenceRepository } from "@/lib/intelligence/redis-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireDiscoveryAccess(request);
    const { id } = await context.params;
    const finder = founderEmailProviderFromEnvironment();
    return Response.json({ contacts: await getFounderContactRepository().list(validateResourceId(id, "Startup")), providerConfigured: Boolean(finder), provider: finder?.id || null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return discoveryApiError(error); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireDiscoveryAccess(request);
    await enforceFounderContactRateLimit(identity.email);
    const body = await jsonBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("Request body must be a JSON object.");
    const founderNameValue = (body as Record<string, unknown>).founderName;
    if (founderNameValue !== undefined && typeof founderNameValue !== "string") throw new ValidationError("Founder name must be a string.");
    const { id } = await context.params;
    const finder = founderEmailProviderFromEnvironment();
    const contacts = await discoverFounderContacts({
      startupId: validateResourceId(id, "Startup"), founderName: typeof founderNameValue === "string" ? founderNameValue.trim().slice(0, 160) : undefined,
      discoveryRepository: getDiscoveryRepository(), intelligenceRepository: getIntelligenceRepository(), contactRepository: getFounderContactRepository(), finder,
    });
    return Response.json({ contacts, providerConfigured: Boolean(finder), provider: finder?.id || null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return discoveryApiError(error); }
}
