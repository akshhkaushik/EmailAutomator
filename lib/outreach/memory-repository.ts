import type { OutreachRepository } from "./repository.ts";
import type { OutreachDraftAudit, OutreachValidation } from "./types.ts";

export class InMemoryOutreachRepository implements OutreachRepository {
  private records = new Map<string, OutreachDraftAudit>();
  async save(draft: OutreachDraftAudit) { this.records.set(draft.id, draft); return draft; }
  async get(id: string) { return this.records.get(id) || null; }
  async list(startupId: string) { return [...this.records.values()].filter((item) => item.startupId === startupId).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)); }
  async history(startupId: string) { return (await this.list(startupId)).map(({ id, mode, generatedAt, sentAt, subject }) => ({ id, mode, generatedAt, sentAt, subject })); }
  async updateValidatedContent(id: string, subject: string, body: string, recipientEmail: string, validation: OutreachValidation) {
    const item = await this.get(id); if (!item) throw new Error("Outreach draft was not found.");
    const updated = { ...item, subject, body, recipientEmail, validation, updatedAt: new Date().toISOString() }; this.records.set(id, updated); return updated;
  }
  async markSent(id: string, sentAt: string) { const item = await this.get(id); if (!item) throw new Error("Outreach draft was not found."); if (item.sentAt) return item; const updated = { ...item, sentAt, updatedAt: sentAt }; this.records.set(id, updated); return updated; }
}
