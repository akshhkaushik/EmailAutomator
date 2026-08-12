const clean = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 160);
const NON_COMPANY_HOSTS = /(^|\.)(linkedin|twitter|x|facebook|instagram|youtube|github|crunchbase|wellfound|angel)\.com$|(^|\.)medium\.com$/i;

export type PublicFounder = { name: string; role: string; profileUrl: string | null; source: string };

export const readableHtml = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

export function companyNameFromContent(content: string, url: URL) {
  const value = content.match(/^#\s+([^\r\n]+)/m)?.[1]
    || content.match(/<meta[^>]+(?:property|name)=["']og:site_name["'][^>]+content=["']([^"']+)/i)?.[1]
    || content.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    || url.hostname.replace(/^www\./, "").split(".")[0];
  return clean(value.replace(/<[^>]+>/g, " ").split(/[|—–]/)[0]);
}

export function foundersFromContent(content: string) {
  const results = new Map<string, PublicFounder>();
  const add = (name: string, role: string, profileUrl: string | null, source: string) => {
    const normalized = clean(name).replace(/^(?:meet|about)\s+/i, "");
    if (!/^[\p{L}][\p{L}.'’ -]{2,79}$/u.test(normalized) || normalized.trim().split(/\s+/).length < 2) return;
    results.set(normalized.toLowerCase(), { name: normalized, role: clean(role) || "Founder", profileUrl, source });
  };

  for (const section of content.matchAll(/^#{1,6}\s+Founders?\s*$([\s\S]*?)(?=^#{1,6}\s|(?![\s\S]))/gim)) {
    for (const rawLine of section[1].split(/\r?\n/)) {
      const line = rawLine.replace(/^[-*]\s+/, "").replace(/\[([^\]]+)]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").trim();
      if (line) add(line, "Founder", null, "accelerator profile");
    }
  }

  for (const match of content.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
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
  for (const match of readableHtml(content).matchAll(/([A-Z][\p{L}.'’ -]{1,55}\s[A-Z][\p{L}.'’-]{1,45})\s*(?:,|—|–|\||is\s+(?:the\s+)?)\s*((?:co-?founder|founder|chief executive officer|CEO)(?:\s+(?:and|&)\s+[^.;]{2,35})?)/gu)) {
    add(match[1], match[2], null, "visible company page");
  }
  return [...results.values()].slice(0, 5);
}

export function linkedCompanyUrlFromContent(content: string, source: URL) {
  const markdownWebsite = content.match(/^\*\*Website:\*\*\s*\[[^\]]*]\((https?:\/\/[^)]+)\)/im)?.[1];
  if (markdownWebsite) {
    try {
      const candidate = new URL(markdownWebsite);
      if (candidate.hostname !== source.hostname && !NON_COMPANY_HOSTS.test(candidate.hostname)) return candidate;
    } catch { /* Fall through to HTML links. */ }
  }
  const candidates: Array<{ url: URL; score: number }> = [];
  for (const match of content.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(match[1], source);
      if (!["http:", "https:"].includes(url.protocol) || url.hostname === source.hostname || NON_COMPANY_HOSTS.test(url.hostname)) continue;
      const label = readableHtml(match[2]).toLowerCase();
      const score = /(?:company|startup|website|visit|homepage|product)/.test(label) ? 10 : 1;
      candidates.push({ url, score });
    } catch { /* Ignore malformed public links. */ }
  }
  return candidates.filter((candidate) => candidate.score >= 10).sort((left, right) => right.score - left.score)[0]?.url || null;
}
