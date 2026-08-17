import type { EvidenceDraft, ResearchSourceInput, StartupResearchSource } from "../types.ts";
import { htmlText, pageLinks, sentences } from "./html.ts";

const TECHNICAL_ROLE = /\b(?:software|frontend|front-end|backend|back-end|full[- ]stack|data|machine learning|artificial intelligence|ai|ml|platform|devops|security|cloud|mobile|product)\s+(?:engineer|developer|scientist|architect)|\b(?:engineer|developer|data scientist|devops)\b/i;

export class JobsSource implements StartupResearchSource {
  readonly id = "jobs-page";

  async collect(input: ResearchSourceInput) {
    if (!input.startup.website) return [];
    const home = await input.context.fetchDocument(input.startup.website, "Company website");
    const origin = new URL(home.sourceUrl).origin;
    const jobsLink = pageLinks(home.html, home.sourceUrl).find((link) => {
      const url = new URL(link.url);
      return url.origin === origin && /(?:career|jobs?|open-positions?|join-us)/i.test(`${url.pathname} ${link.label}`);
    });
    if (!jobsLink) return [];
    const document = await input.context.fetchDocument(jobsLink.url, "Company jobs page");
    const candidates = [...document.html.matchAll(/<(?:h[1-4]|li|a)\b[^>]*>([\s\S]*?)<\/(?:h[1-4]|li|a)>/gi)]
      .map((match) => htmlText(match[1])).filter((title) => title.length >= 5 && title.length <= 140 && TECHNICAL_ROLE.test(title));
    const roles = [...new Set(candidates.map((title) => title.replace(/\s+/g, " ").trim()))].slice(0, 50);
    const base = { sourceName: document.sourceName, sourceUrl: document.sourceUrl, observedAt: document.observedAt, metadata: { adapter: this.id } };
    const evidence: EvidenceDraft[] = roles.map((title) => ({ ...base, category: "hiring", claim: "hiring.technicalRole", value: { title }, confidence: "high" }));
    for (const sentence of sentences(document.text).filter((item) => /\b(?:hiring|join our team|we are growing)\b/i.test(item) && /\b(?:engineer|developer|technical|product|data|ai|ml)\b/i.test(item)).slice(0, 3)) {
      evidence.push({ ...base, category: "hiring", claim: "hiring.announcement", value: sentence, confidence: "medium", metadata: { ...base.metadata, supportingText: sentence } });
    }
    return evidence;
  }
}
