import { requirePersonalAccess, DiscoveryAccessError } from "@/lib/discovery/auth";
import { jsonBody } from "@/lib/discovery/api";
import { fetchPublicResearchPage } from "@/lib/discovery/http";
import { normalizeDomain } from "@/lib/discovery/normalize";
import { enforceStartupResearchRateLimit } from "@/lib/discovery/rate-limit";
import { HunterEmailFinder } from "@/lib/contacts/hunter";
import { findOneFounderEmail } from "@/lib/contacts/single-link";
import { errorName, structuredLog } from "@/lib/observability";
import { companyNameFromContent, foundersFromContent, linkedCompanyUrlFromContent } from "@/lib/research/content";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const identity = await requirePersonalAccess(request, "startup research");
    await enforceStartupResearchRateLimit(identity.email);
    const body = await jsonBody(request) as { companyUrl?: unknown };
    if (typeof body.companyUrl !== "string") throw new Error("Enter a valid startup link.");
    const url = new URL(body.companyUrl);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("The startup link must use http or https.");
    const suppliedPage = await fetchPublicResearchPage(url.toString());
    const suppliedContent = suppliedPage.content;
    const suppliedUrl = new URL(suppliedPage.sourceUrl);
    const externalCompanyUrl = linkedCompanyUrlFromContent(suppliedContent, suppliedUrl);
    let resolvedUrl = suppliedUrl;
    let companyContent = suppliedContent;
    if (externalCompanyUrl) {
      resolvedUrl = externalCompanyUrl;
      try {
        const companyPage = await fetchPublicResearchPage(externalCompanyUrl.toString());
        resolvedUrl = new URL(companyPage.sourceUrl);
        companyContent = companyPage.content;
      } catch { /* The supplied startup profile remains useful when its external site fails. */ }
    }
    const founders = [...new Map([...foundersFromContent(suppliedContent), ...foundersFromContent(companyContent)].map((founder) => [founder.name.toLowerCase(), founder])).values()];
    const selectedFounder = founders[0] || null;
    const domain = normalizeDomain(resolvedUrl.toString());
    const contact = selectedFounder && domain ? await findOneFounderEmail({
      founderName: selectedFounder.name, founderRole: selectedFounder.role, founderProfileUrl: selectedFounder.profileUrl,
      companyDomain: domain, finder: process.env.HUNTER_API_KEY ? new HunterEmailFinder(process.env.HUNTER_API_KEY) : undefined,
    }) : null;
    return Response.json({
      companyUrl: resolvedUrl.origin, companyName: companyNameFromContent(companyContent, resolvedUrl), domain,
      founders, selectedFounder, contact, providerConfigured: Boolean(process.env.HUNTER_API_KEY),
      sourceUrl: suppliedUrl.toString(), researchedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (!(error instanceof DiscoveryAccessError)) {
      structuredLog("error", "direct_research.failed", { errorType: errorName(error) });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Startup research failed." }, { status: error instanceof DiscoveryAccessError ? error.status : 400 });
  }
}
