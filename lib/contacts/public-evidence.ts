import { generateFounderEmailCandidates } from "./candidates.ts";
import type { EmailSource, PublicEmailDocument } from "./types.ts";

const EMAIL_PATTERN = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi;

function canonicalDomain(value: string) {
  return value.trim().toLowerCase().replace(/^www\./, "");
}

export function extractCompanyEmails(content: string, domain: string) {
  const host = canonicalDomain(domain);
  return [...new Set([...content.matchAll(EMAIL_PATTERN)]
    .map((match) => match[0].toLowerCase().replace(/[),.;:]+$/, ""))
    .filter((email) => email.endsWith(`@${host}`)))];
}

export function publicSourcesForEmail(email: string, documents: PublicEmailDocument[]): EmailSource[] {
  const target = email.toLowerCase();
  const domain = target.split("@")[1];
  return documents.flatMap((document) => {
    try {
      const sourceHost = canonicalDomain(new URL(document.sourceUrl).hostname);
      const officialSource = sourceHost === domain || sourceHost.endsWith(`.${domain}`);
      return officialSource && extractCompanyEmails(document.content, domain).includes(target)
        ? [{ url: document.sourceUrl, firstSeenAt: document.observedAt, lastSeenAt: document.observedAt }]
        : [];
    } catch { return []; }
  });
}

export function observedEmailPatterns(documents: PublicEmailDocument[], domain: string) {
  const counts = new Map<string, number>();
  for (const document of documents) {
    const content = document.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    for (const match of content.matchAll(EMAIL_PATTERN)) {
      const email = match[0].toLowerCase();
      if (!email.endsWith(`@${canonicalDomain(domain)}`)) continue;
      const start = Math.max(0, (match.index || 0) - 180);
      const end = Math.min(content.length, (match.index || 0) + email.length + 180);
      const nearby = content.slice(start, end);
      for (const nameMatch of nearby.matchAll(/\b([A-Z][\p{L}.'’-]{1,40})\s+([A-Z][\p{L}.'’-]{1,40})\b/gu)) {
        try {
          const pattern = generateFounderEmailCandidates(`${nameMatch[1]} ${nameMatch[2]}`, domain)
            .find((candidate) => candidate.email === email)?.pattern;
          if (pattern) counts.set(pattern, (counts.get(pattern) || 0) + 1);
        } catch { /* Ignore text that only resembles a person's name. */ }
      }
    }
  }
  return counts;
}

export function publicContactPageUrls(content: string, sourceUrl: string, domain: string) {
  const source = new URL(sourceUrl);
  const host = canonicalDomain(domain);
  const scored = new Map<string, number>();
  for (const match of content.matchAll(/(?:href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>|\[[^\]]+]\((https?:\/\/[^)]+)\))/gi)) {
    try {
      const url = new URL(match[1] || match[3], source);
      if (!['http:', 'https:'].includes(url.protocol) || canonicalDomain(url.hostname) !== host) continue;
      url.hash = "";
      const label = `${match[2] || ""} ${url.pathname}`.replace(/<[^>]+>/g, " ");
      const score = /contact|team|founder|leadership|about|company|people/i.test(label) ? 10 : 0;
      if (score) scored.set(url.toString(), Math.max(score, scored.get(url.toString()) || 0));
    } catch { /* Ignore malformed public links. */ }
  }
  return [...scored.entries()].sort((a, b) => b[1] - a[1]).map(([url]) => url).slice(0, 4);
}
