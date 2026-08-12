import { normalizeFundingDate } from "../funding-date.ts";
import type { EvidenceDraft, ResearchSourceInput, StartupResearchSource } from "../types.ts";
import { addressText, jsonLdRecords, metaContent, pageLinks, schemaTypes, sentences } from "./html.ts";

function strings(value: unknown) {
  return (Array.isArray(value) ? value : [value]).filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
}

function foundingYear(value: unknown) {
  if (typeof value !== "string") return null;
  const year = Number(value.match(/\b(18|19|20)\d{2}\b/)?.[0]);
  return Number.isInteger(year) && year <= new Date().getUTCFullYear() ? year : null;
}

function employeeCount(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const count = record.value;
  return typeof count === "number" && Number.isInteger(count) && count > 0 ? count : null;
}

function people(value: unknown) {
  return (Array.isArray(value) ? value : [value]).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

function publicProfileUrl(value: unknown, sourceUrl: string) {
  if (typeof value !== "string" || !value.trim()) return "unknown";
  try {
    const url = new URL(value, sourceUrl);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : "unknown";
  } catch { return "unknown"; }
}

function fundingEvidence(text: string, sourceName: string, sourceUrl: string, observedAt: string): EvidenceDraft[] {
  return sentences(text).flatMap((sentence) => {
    if (!/\b(?:raised|secured|closed|announced)\b.*\b(?:funding|round|series|seed)|\bfunding round\b/i.test(sentence)) return [];
    const amount = sentence.match(/(?:[$€£₹]\s?\d[\d,.]*(?:\s?(?:million|billion|m|bn))?|\d[\d,.]*\s?(?:million|billion)\s?(?:USD|EUR|GBP|INR)?)/i)?.[0] || "unknown";
    const roundType = sentence.match(/\b(?:pre-seed|seed|series\s+[a-z]|angel|venture|debt|grant)\b/i)?.[0] || "unknown";
    if (amount === "unknown" && roundType === "unknown") return [];
    const rawDate = sentence.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i)?.[0]
      || sentence.match(/\b(?:19|20)\d{2}-\d{2}(?:-\d{2})?\b/)?.[0] || "";
    const date = rawDate ? normalizeFundingDate(rawDate) : null;
    const ledBy = sentence.match(/\bled by\s+([^.;]+?)(?:,?\s+with|\s+and participation|[.;]|$)/i)?.[1]?.trim();
    return [{
      category: "funding" as const,
      claim: "funding.round",
      value: { roundType, amount, date: date?.date || "unknown", datePrecision: date?.precision || "unknown", investors: ledBy ? [ledBy] : [] },
      sourceName, sourceUrl, observedAt, confidence: "medium" as const,
      metadata: { adapter: "company-website", supportingText: sentence },
    }];
  }).slice(0, 5);
}

function recentLaunch(sentence: string, observedAt: string) {
  if (/\b(?:recently|today|this (?:week|month|year)|newly)\b/i.test(sentence)) return true;
  const year = Number(sentence.match(/\b(?:19|20)\d{2}\b/)?.[0]);
  const observedYear = new Date(observedAt).getUTCFullYear();
  return Number.isInteger(year) && year >= observedYear - 1 && year <= observedYear;
}

export class CompanyWebsiteSource implements StartupResearchSource {
  readonly id = "company-website";

  async collect(input: ResearchSourceInput) {
    if (!input.startup.website) return [];
    const document = await input.context.fetchDocument(input.startup.website, "Company website");
    const base = { sourceName: document.sourceName, sourceUrl: document.sourceUrl, observedAt: document.observedAt, metadata: { adapter: this.id } };
    const evidence: EvidenceDraft[] = [];
    const description = metaContent(document.html, ["description", "og:description", "twitter:description"]);
    if (description) evidence.push({ ...base, category: "company", claim: "company.description", value: description, confidence: "medium" });

    for (const record of jsonLdRecords(document.html)) {
      const types = schemaTypes(record);
      if (types.some((type) => ["organization", "corporation", "localbusiness"].includes(type))) {
        if (typeof record.description === "string" && record.description.trim()) evidence.push({ ...base, category: "company", claim: "company.description", value: record.description.trim(), confidence: "high", metadata: { ...base.metadata, structuredData: true } });
        const industry = strings(record.industry)[0];
        if (industry) evidence.push({ ...base, category: "company", claim: "company.industry", value: industry, confidence: "high", metadata: { ...base.metadata, structuredData: true } });
        const location = addressText(record.address || record.location);
        if (location) evidence.push({ ...base, category: "company", claim: "company.location", value: location, confidence: "high", metadata: { ...base.metadata, structuredData: true } });
        const year = foundingYear(record.foundingDate);
        if (year) evidence.push({ ...base, category: "company", claim: "company.foundedYear", value: year, confidence: "high", metadata: { ...base.metadata, structuredData: true } });
        const count = employeeCount(record.numberOfEmployees);
        if (count) evidence.push({ ...base, category: "team", claim: "team.size", value: { count, label: "company website" }, confidence: "high", metadata: { ...base.metadata, structuredData: true } });
        for (const founder of people(record.founder || record.founders)) {
          if (typeof founder.name !== "string" || !founder.name.trim()) continue;
          const role = typeof founder.jobTitle === "string" && founder.jobTitle.trim() ? founder.jobTitle.trim() : "unknown";
          const profileUrl = publicProfileUrl(founder.url, document.sourceUrl);
          evidence.push({ ...base, category: "founder", claim: "founder.person", value: { name: founder.name.trim(), role, profileUrl }, confidence: "high", metadata: { ...base.metadata, structuredData: true } });
        }
      }
      if (types.some((type) => ["product", "softwareapplication", "webapplication"].includes(type))) {
        if (typeof record.description === "string" && record.description.trim()) evidence.push({ ...base, category: "product", claim: "product.description", value: record.description.trim(), confidence: "high", metadata: { ...base.metadata, structuredData: true } });
        const category = strings(record.applicationCategory || record.category)[0];
        if (category) evidence.push({ ...base, category: "product", claim: "product.category", value: category, confidence: "high", metadata: { ...base.metadata, structuredData: true } });
      }
    }

    const baseOrigin = new URL(document.sourceUrl).origin;
    for (const link of pageLinks(document.html, document.sourceUrl)) {
      if (new URL(link.url).origin !== baseOrigin || !/(?:\/docs?(?:\/|$)|\/developers?(?:\/|$)|\/api(?:\/|$))/i.test(new URL(link.url).pathname)) continue;
      evidence.push({ ...base, category: "technical", claim: "product.developerInfo", value: { label: link.label || "Developer documentation", url: link.url }, confidence: "high" });
    }
    for (const sentence of sentences(document.text).filter((item) => /\b(?:launched|introduced|released|unveiled)\b/i.test(item) && recentLaunch(item, document.observedAt)).slice(0, 3)) {
      evidence.push({ ...base, category: "product", claim: "product.launch", value: sentence, confidence: "medium", metadata: { ...base.metadata, supportingText: sentence } });
    }
    evidence.push(...fundingEvidence(document.text, document.sourceName, document.sourceUrl, document.observedAt));
    return evidence;
  }
}
