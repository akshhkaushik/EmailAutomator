import { normalizeDomain, startupIdentity } from "./normalize.ts";
import { mergeStartup, type DiscoveryRepository, type NewAccelerator, type NewCohort, type StartupFilters, type StartupUpsert, type StartupUpsertResult } from "./repository.ts";
import type { Accelerator, Cohort, Startup, StartupProvenance } from "./types.ts";

export class InMemoryDiscoveryRepository implements DiscoveryRepository {
  private accelerators = new Map<string, Accelerator>();
  private cohorts = new Map<string, Cohort>();
  private startups = new Map<string, Startup>();
  private startupIdentities = new Map<string, string>();

  async createAccelerator(input: NewAccelerator) {
    const now = new Date().toISOString();
    const accelerator: Accelerator = { id: crypto.randomUUID(), ...input, createdAt: now, updatedAt: now };
    this.accelerators.set(accelerator.id, accelerator);
    return accelerator;
  }

  async listAccelerators() {
    return [...this.accelerators.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getAccelerator(id: string) { return this.accelerators.get(id) || null; }

  async createCohort(input: NewCohort) {
    if (!this.accelerators.has(input.acceleratorId)) throw new Error("Accelerator was not found.");
    const now = new Date().toISOString();
    const cohort: Cohort = { id: crypto.randomUUID(), ...input, createdAt: now, updatedAt: now };
    this.cohorts.set(cohort.id, cohort);
    return cohort;
  }

  async listCohorts(acceleratorId?: string | null) {
    return [...this.cohorts.values()]
      .filter((cohort) => !acceleratorId || cohort.acceleratorId === acceleratorId)
      .sort((a, b) => (b.year || 0) - (a.year || 0) || b.createdAt.localeCompare(a.createdAt));
  }

  async getCohort(id: string) { return this.cohorts.get(id) || null; }

  async upsertStartup(input: StartupUpsert): Promise<StartupUpsertResult> {
    const identity = startupIdentity(input.discovered);
    if (!identity) throw new Error("Discovered startup needs a name or website.");
    const now = new Date().toISOString();
    const provenance: StartupProvenance = {
      discoverySource: input.discoverySource,
      sourceUrl: input.discovered.sourceUrl,
      discoveredAt: input.discovered.discoveredAt,
      acceleratorId: input.acceleratorId,
      cohortId: input.cohortId,
      cohortName: input.cohortName,
    };
    const startup: Startup = {
      id: this.startupIdentities.get(identity) || crypto.randomUUID(),
      name: input.discovered.name,
      website: input.discovered.website,
      domain: normalizeDomain(input.discovered.website),
      description: input.discovered.description,
      acceleratorId: input.acceleratorId,
      cohortId: input.cohortId,
      location: input.discovered.location,
      sourceUrls: [input.discovered.sourceUrl],
      provenance: [provenance],
      discoveryStatus: "discovered",
      createdAt: now,
      updatedAt: now,
    };
    const existing = this.startups.get(startup.id);
    const stored = existing ? mergeStartup(existing, startup, provenance) : startup;
    this.startupIdentities.set(identity, stored.id);
    this.startups.set(stored.id, stored);
    return { startup: stored, created: !existing };
  }

  async listStartups(filters: StartupFilters = {}) {
    return [...this.startups.values()]
      .filter((startup) => {
        const provenance = startup.provenance || [];
        if (filters.acceleratorId && !provenance.some((item) => item.acceleratorId === filters.acceleratorId)) return false;
        if (filters.cohortId && !provenance.some((item) => item.cohortId === filters.cohortId)) return false;
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getStartup(id: string) { return this.startups.get(id) || null; }
}
