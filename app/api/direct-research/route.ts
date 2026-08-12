import { requirePersonalAccess, DiscoveryAccessError } from "@/lib/discovery/auth";
import { jsonBody } from "@/lib/discovery/api";
import { fetchPublicPortfolioPage } from "@/lib/discovery/http";
import { normalizeDomain } from "@/lib/discovery/normalize";
import { enforceStartupResearchRateLimit } from "@/lib/discovery/rate-limit";
import { HunterEmailFinder } from "@/lib/contacts/hunter";
import { findOneFounderEmail } from "@/lib/contacts/single-link";
import { errorName, structuredLog } from "@/lib/observability";

export const runtime = "nodejs";
export const maxDuration = 30;

const htmlText = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const clean = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 160);
const NON_COMPANY_HOSTS = /(^|\.)(linkedin|twitter|x|facebook|instagram|youtube|github|crunchbase|wellfound|angel)\.com$|(^|\.)medium\.com$/i;

function companyName(html: string, url: URL) {
  const value = html.match(/<meta[^>]+(?:property|name)=["']og:site_name["'][^>]+content=["']([^"']+)/i)?.[1]
    || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    || url.hostname.replace(/^www\./, "").split(".")[0];
  return clean(value.replace(/<[^>]+>/g, " ").split(/[|—–-]/)[0]);
}

function foundersFromHtml(html: string) {
  const results = new Map<string, { name: string; role: string; profileUrl: string | null; source: string }>();
  const add = (name: string, role: string, profileUrl: string | null, source: string) => {
    const normalized = clean(name).replace(/^(?:meet|about)\s+/i, "");
    if (!/^[\p{L}][\p{L}.'’ -]{2,79}$/u.test(normalized) || normalized.trim().split(/\s+/).length < 2) return;
    results.set(normalized.toLowerCase(), { name: normalized, role: clean(role) || "Founder", profileUrl, source });
  };
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const roots = [JSON.parse(match[1])].flatMap((item) => item?.["@graph"] || item);
      const visit = (item: unknown) => {
        if (!item || typeof item !== "object") return;
        const record = item as Record<string, unknown>;
        const types = [record["@type"]].flat().map(String);
        if (types.includes("Person") && typeof record.name === "string") {
          const role = typeof record.jobTitle === "string" ? record.jobTitle : "Founder";
          if (/founder|co-founder|chief executive|ceo/i.test(role)) add(record.name, role, typeof record.url === "string" ? record.url : null, "structured company data");
        }
        for (const key of ["founder", "founders", "employee", "member"]) [record[key]].flat().forEach(visit);
      };
      roots.forEach(visit);
    } catch { /* Ignore malformed public structured data. */ }
  }
  for (const match of htmlText(html).matchAll(/([A-Z][\p{L}.'’ -]{1,55}\s[A-Z][\p{L}.'’-]{1,45})\s*(?:,|—|–|\||is\s+(?:the\s+)?)\s*((?:co-?founder|founder|chief executive officer|CEO)(?:\s+(?:and|&)\s+[^.;]{2,35})?)/gu)) {
    add(match[1], match[2], null, "visible company page");
  }
  return [...results.values()].slice(0, 5);
}

function linkedCompanyUrl(html: string, source: URL) {
  const candidates: Array<{ url: URL; score: number }> = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(match[1], source);
      if (!["http:", "https:"].includes(url.protocol) || url.hostname === source.hostname || NON_COMPANY_HOSTS.test(url.hostname)) continue;
      const label = htmlText(match[2]).toLowerCase();
      const score = /(?:company|startup|website|visit|homepage|product)/.test(label) ? 10 : 1;
      candidates.push({ url, score });
    } catch { /* Ignore malformed public links. */ }
  }
  return candidates.filter((candidate) => candidate.score >= 10).sort((left, right) => right.score - left.score)[0]?.url || null;
}

export async function POST(request: Request) {
  try {
    const identity = await requirePersonalAccess(request, "startup research");
    await enforceStartupResearchRateLimit(identity.email);
    const body = await jsonBody(request) as { companyUrl?: unknown };
    if (typeof body.companyUrl !== "string") throw new Error("Enter a valid startup link.");
    const url = new URL(body.companyUrl);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("The startup link must use http or https.");
    const suppliedPage = await fetchPublicPortfolioPage(url.toString());
    const suppliedHtml = suppliedPage.html;
    const suppliedUrl = new URL(suppliedPage.sourceUrl);
    const externalCompanyUrl = linkedCompanyUrl(suppliedHtml, suppliedUrl);
    let resolvedUrl = suppliedUrl;
    let companyHtml = suppliedHtml;
    if (externalCompanyUrl) {
      try {
        const companyPage = await fetchPublicPortfolioPage(externalCompanyUrl.toString());
        resolvedUrl = new URL(companyPage.sourceUrl);
        companyHtml = companyPage.html;
      } catch { /* The supplied startup profile remains useful when its external site fails. */ }
    }
    const founders = [...new Map([...foundersFromHtml(suppliedHtml), ...foundersFromHtml(companyHtml)].map((founder) => [founder.name.toLowerCase(), founder])).values()];
    const selectedFounder = founders[0] || null;
    const domain = normalizeDomain(resolvedUrl.toString());
    const contact = selectedFounder && domain ? await findOneFounderEmail({
      founderName: selectedFounder.name, founderRole: selectedFounder.role, founderProfileUrl: selectedFounder.profileUrl,
      companyDomain: domain, finder: process.env.HUNTER_API_KEY ? new HunterEmailFinder(process.env.HUNTER_API_KEY) : undefined,
    }) : null;
    return Response.json({
      companyUrl: resolvedUrl.origin, companyName: companyName(companyHtml, resolvedUrl), domain,
      founders, selectedFounder, contact, providerConfigured: Boolean(process.env.HUNTER_API_KEY),
      sourceUrl: suppliedUrl.toString(), researchedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    structuredLog("error", "direct_research.failed", { errorType: errorName(error) });
    return Response.json({ error: error instanceof Error ? error.message : "Startup research failed." }, { status: error instanceof DiscoveryAccessError ? error.status : 400 });
  }
}
