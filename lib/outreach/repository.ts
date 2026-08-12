import type { OutreachDraftAudit, OutreachHistoryItem, OutreachValidation } from "./types.ts";

export interface OutreachRepository {
  save(draft: OutreachDraftAudit): Promise<OutreachDraftAudit>;
  get(id: string): Promise<OutreachDraftAudit | null>;
  list(startupId: string): Promise<OutreachDraftAudit[]>;
  history(startupId: string): Promise<OutreachHistoryItem[]>;
  updateValidatedContent(id: string, subject: string, body: string, recipientEmail: string, validation: OutreachValidation): Promise<OutreachDraftAudit>;
  markSent(id: string, sentAt: string): Promise<OutreachDraftAudit>;
}
