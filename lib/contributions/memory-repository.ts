import { assertContributionTransition } from "./transitions.ts";
import type { ContributionRepository } from "./repository.ts";
import type { BuildSpecification, ContributionOpportunity, ContributionStatus } from "./types.ts";

export class InMemoryContributionRepository implements ContributionRepository {
  private records = new Map<string, ContributionOpportunity>();

  async upsertSuggestions(startupId: string, suggestions: ContributionOpportunity[]) {
    for (const suggestion of suggestions) {
      if (suggestion.startupId !== startupId) throw new Error("Contribution opportunity belongs to another startup.");
      const existing = this.records.get(suggestion.id);
      this.records.set(suggestion.id, existing ? {
        ...suggestion,
        status: existing.status,
        buildSpec: existing.buildSpec,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
      } : suggestion);
    }
    return this.list(startupId);
  }

  async list(startupId: string) {
    return [...this.records.values()].filter((item) => item.startupId === startupId)
      .sort((a, b) => b.contributionScore - a.contributionScore || a.title.localeCompare(b.title));
  }

  async get(startupId: string, id: string) {
    const item = this.records.get(id);
    return item?.startupId === startupId ? item : null;
  }

  async updateStatus(startupId: string, id: string, status: ContributionStatus) {
    const existing = await this.get(startupId, id);
    if (!existing) throw new Error("Contribution opportunity was not found.");
    assertContributionTransition(existing.status, status);
    const updated = { ...existing, status, updatedAt: new Date().toISOString() };
    this.records.set(id, updated);
    return updated;
  }

  async saveBuildSpec(startupId: string, id: string, buildSpec: BuildSpecification) {
    const existing = await this.get(startupId, id);
    if (!existing) throw new Error("Contribution opportunity was not found.");
    const updated = { ...existing, buildSpec, updatedAt: new Date().toISOString() };
    this.records.set(id, updated);
    return updated;
  }
}
