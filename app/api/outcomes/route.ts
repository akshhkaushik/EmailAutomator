import { discoveryApiError, jsonBody } from "@/lib/discovery/api";
import { requireDiscoveryAccess } from "@/lib/discovery/auth";
import { ValidationError } from "@/lib/discovery/validation";
import { calculateLearningAnalytics } from "@/lib/learning/analytics";
import { recommendFollowUp } from "@/lib/learning/follow-ups";
import { getOutcomeRepository } from "@/lib/learning/redis-repository";
import { validateOutcomePatch } from "@/lib/learning/validation";
import { structuredLog } from "@/lib/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) { try { await requireDiscoveryAccess(request); const outcomes = await getOutcomeRepository().list(); return Response.json({ outcomes, followUps: outcomes.flatMap((item) => recommendFollowUp(item) || []), analytics: calculateLearningAnalytics(outcomes) }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return discoveryApiError(error); } }
export async function PATCH(request: Request) { try { await requireDiscoveryAccess(request); const body = await jsonBody(request); if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as Record<string, unknown>).id !== "string") throw new ValidationError("Outcome ID is required."); const outcome = await getOutcomeRepository().update(String((body as Record<string, unknown>).id), validateOutcomePatch(body)); structuredLog("info", "outcome.updated", { outcomeId: outcome.id, outreachId: outcome.outreachId, replyStatus: outcome.replyStatus, followUpCount: outcome.followUpCount }); return Response.json({ outcome }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return discoveryApiError(error); } }
