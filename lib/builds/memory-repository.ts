import { assertBuildTransition } from "./transitions.ts";
import type { BuildRepository } from "./repository.ts";
import type { BuildProof, BuildSpec, BuildStatus } from "./types.ts";

export class InMemoryBuildRepository implements BuildRepository {
  private records = new Map<string, BuildSpec>();
  async upsert(spec: BuildSpec) {
    const existing = this.records.get(spec.id);
    const record = existing ? { ...spec, status: existing.status, proof: existing.proof, createdAt: existing.createdAt, updatedAt: existing.updatedAt } : spec;
    this.records.set(record.id, record); return record;
  }
  async get(startupId: string, id: string) { const item = this.records.get(id); return item?.startupId === startupId ? item : null; }
  async getByOpportunity(startupId: string, opportunityId: string) { return [...this.records.values()].find((item) => item.startupId === startupId && item.opportunityId === opportunityId) || null; }
  async list(startupId: string) { return [...this.records.values()].filter((item) => item.startupId === startupId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async attachProof(startupId: string, id: string, proof: BuildProof) {
    const item = await this.get(startupId, id); if (!item) throw new Error("Build specification was not found.");
    const updated = { ...item, proof, updatedAt: new Date().toISOString() }; this.records.set(id, updated); return updated;
  }
  async updateStatus(startupId: string, id: string, status: BuildStatus) {
    const item = await this.get(startupId, id); if (!item) throw new Error("Build specification was not found.");
    assertBuildTransition(item.status, status, item.proof);
    const updated = { ...item, status, updatedAt: new Date().toISOString() }; this.records.set(id, updated); return updated;
  }
}
