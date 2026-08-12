import { isIP } from "node:net";
import { deduplicateDiscoveredStartups, normalizeDomain, normalizeName, normalizeWebsite } from "./normalize.ts";
import { fetchPublicPortfolioPage, isPublicIpAddress } from "./http.ts";
import type { DiscoveredStartup, DiscoveryInput, StartupDiscoverySource } from "./types.ts";

const SOCIAL_OR_UTILITY_HOSTS = [
  "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com", "youtube.com",
  "tiktok.com", "medium.com", "mailto:", "javascript:",
];
const GENERIC_LABELS = new Set([
  "apply", "about", "blog", "careers", "contact", "home", "learn more", "more", "portfolio",
  "read more", "visit", "visit site", "visit website", "website", "view", "view company",
]);

function decodeHtml(value: string) {
  const decodeCodePoint = (code: string, radix: number) => {
    const number = Number.parseInt(code, radix);
    return Number.isInteger(number) && number >= 0 && number <= 0x10ffff ? String.fromCodePoint(number) : " ";
  };
  return value
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code: string) => decodeCodePoint(code, 10))
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) => decodeCodePoint(code, 16));
}

function visibleText(html: string) {
  return normalizeName(decodeHtml(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")));
}

function attribute(tag: string, name: string) {
  return decodeHtml(tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"))?.[2] || "").trim();
}

function usableWebsite(href: string, sourceUrl: URL) {
  try {
    const url = new URL(href, sourceUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return "";
    const domain = normalizeDomain(url.toString());
    if (!domain || domain === normalizeDomain(sourceUrl.toString())) return "";
    if (isIP(url.hostname.replace(/^\[|\]$/g, "")) && !isPublicIpAddress(url.hostname)) return "";
    if (SOCIAL_OR_UTILITY_HOSTS.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`))) return "";
    return normalizeWebsite(url.toString());
  } catch {
    return "";
  }
}

function nameFromDomain(website: string) {
  const label = normalizeDomain(website).split(".")[0] || "";
  return label.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function firstWebsite(html: string, sourceUrl: URL) {
  for (const match of html.matchAll(/<a\b([^>]*)>/gi)) {
    const website = usableWebsite(attribute(match[1], "href"), sourceUrl);
    if (website) return website;
  }
  return "";
}

function startupFromBlock(block: string, sourceUrl: URL, discoveredAt: string) {
  const openingTag = block.match(/^<[^>]+>/)?.[0] || "";
  const heading = block.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1] || "";
  const named = attribute(openingTag, "data-name") || attribute(openingTag, "data-company") || heading;
  let name = visibleText(named);
  const website = firstWebsite(block, sourceUrl);
  if (!name) {
    const anchor = block.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1] || "";
    const anchorText = visibleText(anchor);
    if (anchorText && !GENERIC_LABELS.has(anchorText.toLowerCase())) name = anchorText;
  }
  if (!name && website) name = nameFromDomain(website);
  if (!name || GENERIC_LABELS.has(name.toLowerCase())) return null;
  const description = visibleText(block.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] || "");
  const location = attribute(openingTag, "data-location");
  return { name, website, description, location, sourceUrl: sourceUrl.toString(), discoveredAt } satisfies DiscoveredStartup;
}

function ldTypes(value: unknown) {
  const types = Array.isArray(value) ? value : [value];
  return types.filter((item): item is string => typeof item === "string").map((item) => item.toLowerCase());
}

function ldLocation(value: unknown) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const address = value as Record<string, unknown>;
  return [address.addressLocality, address.addressRegion, address.addressCountry]
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .join(", ");
}

function collectJsonLd(value: unknown, sourceUrl: URL, discoveredAt: string, output: DiscoveredStartup[], insideList = false) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonLd(item, sourceUrl, discoveredAt, output, insideList));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const types = ldTypes(record["@type"]);
  const isCandidate = insideList || types.some((type) => ["organization", "corporation", "localbusiness", "softwareapplication"].includes(type));
  const name = typeof record.name === "string" ? normalizeName(record.name) : "";
  const rawUrl = typeof record.url === "string" ? record.url : "";
  const website = usableWebsite(rawUrl, sourceUrl);
  if (isCandidate && name) {
    output.push({
      name,
      website,
      description: typeof record.description === "string" ? visibleText(record.description) : "",
      location: ldLocation(record.address || record.location),
      sourceUrl: sourceUrl.toString(),
      discoveredAt,
    });
  }
  for (const [key, child] of Object.entries(record)) {
    if (["itemListElement", "item", "@graph"].includes(key)) {
      collectJsonLd(child, sourceUrl, discoveredAt, output, insideList || key === "itemListElement");
    }
  }
}

export function parsePublicPortfolioHtml(html: string, input: { sourceUrl: string; discoveredAt?: string }) {
  const sourceUrl = new URL(input.sourceUrl);
  const discoveredAt = input.discoveredAt || new Date().toISOString();
  const startups: DiscoveredStartup[] = [];
  const sanitized = html.replace(/<script\b(?![^>]*type=["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi, " ");

  for (const match of sanitized.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { collectJsonLd(JSON.parse(decodeHtml(match[1])), sourceUrl, discoveredAt, startups); } catch { /* Ignore malformed JSON-LD. */ }
  }

  for (const match of sanitized.matchAll(/<(article|li)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const [, tag, attributes, content] = match;
    const marker = `${attribute(attributes, "class")} ${attribute(attributes, "data-startup")} ${attribute(attributes, "data-company")}`;
    if (tag.toLowerCase() === "li" && !/(startup|company|portfolio|card|member|batch)/i.test(marker)) continue;
    const startup = startupFromBlock(`<${tag} ${attributes}>${content}</${tag}>`, sourceUrl, discoveredAt);
    if (startup) startups.push(startup);
  }

  for (const match of sanitized.matchAll(/<div\b([^>]*(?:class|data-startup|data-company)=["'][^"']*(?:startup|company|portfolio|card|member|batch)[^"']*["'][^>]*)>([\s\S]*?)<\/div>/gi)) {
    const startup = startupFromBlock(`<div ${match[1]}>${match[2]}</div>`, sourceUrl, discoveredAt);
    if (startup) startups.push(startup);
  }

  for (const match of sanitized.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const website = usableWebsite(attribute(match[1], "href"), sourceUrl);
    const name = visibleText(match[2]);
    if (!website || !name || GENERIC_LABELS.has(name.toLowerCase())) continue;
    startups.push({ name, website, description: "", location: "", sourceUrl: sourceUrl.toString(), discoveredAt });
  }

  return deduplicateDiscoveredStartups(startups);
}

export class PublicPortfolioPageSource implements StartupDiscoverySource {
  readonly id = "public-portfolio-page";
  private readonly pageFetcher: typeof fetchPublicPortfolioPage;

  constructor(pageFetcher = fetchPublicPortfolioPage) { this.pageFetcher = pageFetcher; }

  async discover(input: DiscoveryInput) {
    const page = await this.pageFetcher(input.sourceUrl);
    return parsePublicPortfolioHtml(page.html, { sourceUrl: page.sourceUrl });
  }
}
