import { deduplicateDiscoveredStartups } from "./normalize.ts";
import type { DiscoveryRepository } from "./repository.ts";
import type { DiscoveryResult, StartupDiscoverySource } from "./types.ts";
import { structuredLog } from "../observability.ts";

export async function runDiscovery(input: {
  repository: DiscoveryRepository;
  source: StartupDiscoverySource;
  acceleratorId: string;
  cohortId?: string | null;
}): Promise<DiscoveryResult> {
  const startedAt = Date.now();
  structuredLog("info", "discovery.started", { acceleratorId: input.acceleratorId, cohortId: input.cohortId || null, source: input.source.id });
  const accelerator = await input.repository.getAccelerator(input.acceleratorId);
  if (!accelerator) throw new Error("Accelerator was not found.");
  if (accelerator.status !== "active") throw new Error("Discovery is paused for this accelerator.");

  const cohort = input.cohortId ? await input.repository.getCohort(input.cohortId) : null;
  if (input.cohortId && !cohort) throw new Error("Cohort was not found.");
  if (cohort && cohort.acceleratorId !== accelerator.id) throw new Error("Cohort does not belong to this accelerator.");

  const sourceUrl = cohort?.portfolioUrl || accelerator.portfolioUrl;
  const discoveredAt = new Date().toISOString();
  const extracted = deduplicateDiscoveredStartups(await input.source.discover({ accelerator, cohort, sourceUrl })).slice(0, 500);
  const startups = [];
  let created = 0;
  for (const discovered of extracted) {
    const result = await input.repository.upsertStartup({
      discovered,
      acceleratorId: accelerator.id,
      cohortId: cohort?.id || null,
      cohortName: cohort?.name || null,
      discoverySource: input.source.id,
    });
    if (result.created) created += 1;
    startups.push(result.startup);
  }
  const result = {
    accelerator,
    cohort,
    sourceUrl,
    discoveredAt,
    extracted: extracted.length,
    created,
    updated: extracted.length - created,
    startups,
  };
  structuredLog("info", "discovery.completed", { acceleratorId: accelerator.id, cohortId: cohort?.id || null, extracted: result.extracted, created: result.created, updated: result.updated, durationMs: Date.now() - startedAt });
  return result;
}
