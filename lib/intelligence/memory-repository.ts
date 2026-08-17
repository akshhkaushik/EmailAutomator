import { confidenceRank, evidenceFingerprint } from "./evidence-ledger.ts";
import type { IntelligenceRepository } from "./repository.ts";
import type { Evidence, EvidenceDraft, ResearchRun, StartupIntelligence } from "./types.ts";

export class InMemoryIntelligenceRepository implements IntelligenceRepository {
  private evidence = new Map<string, Evidence>();
  private evidenceIdentity = new Map<string, string>();
  private runs = new Map<string, ResearchRun>();
  private intelligence = new Map<string, StartupIntelligence>();

  async createResearchRun(startupId: string, sourceIds: string[]) {
    const run: ResearchRun = { id: crypto.randomUUID(), startupId, status: "running", sourceIds, evidenceIds: [], errors: [], startedAt: new Date().toISOString(), completedAt: null };
    this.runs.set(run.id, run);
    return run;
  }

  async completeResearchRun(id: string, input: Pick<ResearchRun, "status" | "evidenceIds" | "errors">) {
    const existing = this.runs.get(id);
    if (!existing) throw new Error("Research run was not found.");
    const run = { ...existing, ...input, completedAt: new Date().toISOString() };
    this.runs.set(id, run);
    return run;
  }

  async upsertEvidence(startupId: string, draft: EvidenceDraft) {
    const fingerprint = evidenceFingerprint(startupId, draft);
    const existingId = this.evidenceIdentity.get(fingerprint);
    const existing = existingId ? this.evidence.get(existingId) : null;
    if (existing) {
      const updated: Evidence = {
        ...existing,
        confidence: confidenceRank(draft.confidence) > confidenceRank(existing.confidence) ? draft.confidence : existing.confidence,
        metadata: { ...existing.metadata, lastObservedAt: draft.observedAt },
      };
      this.evidence.set(updated.id, updated);
      return { evidence: updated, created: false };
    }
    const record: Evidence = { id: crypto.randomUUID(), startupId, ...draft, metadata: { ...draft.metadata, lastObservedAt: draft.observedAt } };
    this.evidenceIdentity.set(fingerprint, record.id);
    this.evidence.set(record.id, record);
    return { evidence: record, created: true };
  }

  async listEvidence(startupId: string) {
    return [...this.evidence.values()].filter((item) => item.startupId === startupId).sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  }

  async saveIntelligence(intelligence: StartupIntelligence) { this.intelligence.set(intelligence.startupId, intelligence); return intelligence; }
  async getIntelligence(startupId: string) { return this.intelligence.get(startupId) || null; }
  async listResearchRuns(startupId: string, limit = 20) {
    return [...this.runs.values()].filter((run) => run.startupId === startupId).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
  }
}
