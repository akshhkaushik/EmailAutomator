import type { Accelerator, Cohort, DiscoveredStartup, Startup, StartupProvenance } from "./types.ts";

export type NewAccelerator = Pick<Accelerator, "name" | "website" | "portfolioUrl" | "description" | "status">;
export type NewCohort = Pick<Cohort, "acceleratorId" | "name" | "year" | "portfolioUrl" | "source">;
export type StartupFilters = { acceleratorId?: string | null; cohortId?: string | null };
export type StartupUpsert = {
  discovered: DiscoveredStartup;
  acceleratorId: string;
  cohortId: string | null;
  cohortName: string | null;
  discoverySource: string;
};

export type StartupUpsertResult = { startup: Startup; created: boolean };

export interface DiscoveryRepository {
  createAccelerator(input: NewAccelerator): Promise<Accelerator>;
  listAccelerators(): Promise<Accelerator[]>;
  getAccelerator(id: string): Promise<Accelerator | null>;
  createCohort(input: NewCohort): Promise<Cohort>;
  listCohorts(acceleratorId?: string | null): Promise<Cohort[]>;
  getCohort(id: string): Promise<Cohort | null>;
  upsertStartup(input: StartupUpsert): Promise<StartupUpsertResult>;
  listStartups(filters?: StartupFilters): Promise<Startup[]>;
  getStartup(id: string): Promise<Startup | null>;
}

export function mergeStartup(existing: Startup, incoming: Startup, provenance: StartupProvenance) {
  const provenanceKey = (item: StartupProvenance) => `${item.discoverySource}|${item.sourceUrl}|${item.acceleratorId}|${item.cohortId || ""}`;
  const provenanceMap = new Map(existing.provenance.map((item) => [provenanceKey(item), item]));
  if (!provenanceMap.has(provenanceKey(provenance))) provenanceMap.set(provenanceKey(provenance), provenance);
  return {
    ...existing,
    name: existing.name || incoming.name,
    website: existing.website || incoming.website,
    domain: existing.domain || incoming.domain,
    description: existing.description || incoming.description,
    location: existing.location || incoming.location,
    sourceUrls: [...new Set([...existing.sourceUrls, ...incoming.sourceUrls])],
    provenance: [...provenanceMap.values()],
    updatedAt: incoming.updatedAt,
  } satisfies Startup;
}
