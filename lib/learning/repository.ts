import type { OutreachOutcome } from "./types.ts";

export interface OutcomeRepository {
  save(outcome: OutreachOutcome): Promise<OutreachOutcome>;
  get(id: string): Promise<OutreachOutcome | null>;
  getByOutreach(outreachId: string): Promise<OutreachOutcome | null>;
  list(): Promise<OutreachOutcome[]>;
  update(id: string, patch: Partial<Pick<OutreachOutcome, "replyStatus" | "replyClassification" | "followUpCount" | "interview" | "technicalTask" | "referral" | "rejection" | "offer" | "notes">>): Promise<OutreachOutcome>;
}
