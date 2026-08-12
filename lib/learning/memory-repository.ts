import type { OutcomeRepository } from "./repository.ts";
import type { OutreachOutcome } from "./types.ts";

export class InMemoryOutcomeRepository implements OutcomeRepository {
  private records = new Map<string, OutreachOutcome>();
  async save(outcome: OutreachOutcome) { const existing = await this.getByOutreach(outcome.outreachId); if (existing) return existing; this.records.set(outcome.id, outcome); return outcome; }
  async get(id: string) { return this.records.get(id) || null; }
  async getByOutreach(outreachId: string) { return [...this.records.values()].find((item) => item.outreachId === outreachId) || null; }
  async list() { return [...this.records.values()].sort((a, b) => b.sentAt.localeCompare(a.sentAt)); }
  async update(id: string, patch: Partial<Pick<OutreachOutcome, "replyStatus" | "replyClassification" | "followUpCount" | "interview" | "technicalTask" | "referral" | "rejection" | "offer" | "notes">>) { const item = await this.get(id); if (!item) throw new Error("Outreach outcome was not found."); const updated = { ...item, ...patch, updatedAt: new Date().toISOString() }; this.records.set(id, updated); return updated; }
}
