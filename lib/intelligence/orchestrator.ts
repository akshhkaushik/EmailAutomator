import { fetchPublicPortfolioPage } from "../discovery/http.ts";
import type { DiscoveryRepository } from "../discovery/repository.ts";
import { buildStartupIntelligence } from "./build-intelligence.ts";
import { EvidenceLedger } from "./evidence-ledger.ts";
import type { IntelligenceRepository } from "./repository.ts";
import { AcceleratorSource } from "./sources/accelerator-source.ts";
import { CompanyWebsiteSource } from "./sources/company-website-source.ts";
import { htmlText } from "./sources/html.ts";
import { JobsSource } from "./sources/jobs-source.ts";
import type { ResearchContext, ResearchDocument, StartupResearchSource } from "./types.ts";
import { errorName, structuredLog } from "../observability.ts";

export const DEFAULT_RESEARCH_SOURCES: StartupResearchSource[] = [
  new AcceleratorSource(),
  new CompanyWebsiteSource(),
  new JobsSource(),
];

export function createResearchContext(pageFetcher = fetchPublicPortfolioPage): ResearchContext {
  const cache = new Map<string, Promise<ResearchDocument>>();
  return {
    fetchDocument(url, sourceName) {
      const key = new URL(url).toString();
      let request = cache.get(key);
      if (!request) {
        request = pageFetcher(key).then((page) => ({
          sourceName,
          sourceUrl: page.sourceUrl,
          html: page.html,
          text: htmlText(page.html),
          observedAt: new Date().toISOString(),
        }));
        cache.set(key, request);
      }
      return request;
    },
  };
}

export async function researchStartup(input: {
  startupId: string;
  discoveryRepository: DiscoveryRepository;
  intelligenceRepository: IntelligenceRepository;
  sources?: StartupResearchSource[];
  context?: ResearchContext;
}) {
  const startedAt = Date.now();
  structuredLog("info", "research.started", { startupId: input.startupId });
  const startup = await input.discoveryRepository.getStartup(input.startupId);
  if (!startup) throw new Error("Startup was not found.");
  const accelerator = await input.discoveryRepository.getAccelerator(startup.acceleratorId);
  const cohort = startup.cohortId ? await input.discoveryRepository.getCohort(startup.cohortId) : null;
  const sources = input.sources || DEFAULT_RESEARCH_SOURCES;
  const run = await input.intelligenceRepository.createResearchRun(startup.id, sources.map((source) => source.id));
  const context = input.context || createResearchContext();
  const errors: Array<{ sourceId: string; message: string }> = [];
  try {
    const drafts = [];

    for (const source of sources) {
      try {
        drafts.push(...await source.collect({ startup, accelerator, cohort, context }));
      } catch (error) {
        errors.push({ sourceId: source.id, message: error instanceof Error ? error.message : "Research source failed." });
        structuredLog("warn", "research.source_failed", { startupId: startup.id, source: source.id, errorType: errorName(error) });
      }
    }

    const ledger = new EvidenceLedger(input.intelligenceRepository, startup.id);
    const recorded = await ledger.recordMany(drafts);
    const evidence = await ledger.all();
    const researchedAt = new Date().toISOString();
    const intelligence = buildStartupIntelligence(startup.id, evidence, researchedAt);
    await input.intelligenceRepository.saveIntelligence(intelligence);
    const status = errors.length === 0 ? "completed" : errors.length < sources.length ? "partial" : "failed";
    const completedRun = await input.intelligenceRepository.completeResearchRun(run.id, { status, evidenceIds: recorded.records.map((item) => item.id), errors });
    structuredLog("info", "research.completed", { startupId: startup.id, runId: run.id, status, evidenceCreated: recorded.created, evidenceReused: recorded.reused, sourceErrors: errors.length, durationMs: Date.now() - startedAt });
    return { startup, run: completedRun, intelligence, evidence, evidenceCreated: recorded.created, evidenceReused: recorded.reused };
  } catch (error) {
    const failure = { sourceId: "orchestrator", message: error instanceof Error ? error.message : "Research orchestration failed." };
    try { await input.intelligenceRepository.completeResearchRun(run.id, { status: "failed", evidenceIds: [], errors: [...errors, failure] }); } catch { /* Preserve the original failure when storage itself is unavailable. */ }
    structuredLog("error", "research.failed", { startupId: startup.id, runId: run.id, errorType: errorName(error), durationMs: Date.now() - startedAt });
    throw error;
  }
}
