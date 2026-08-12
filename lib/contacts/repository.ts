import type { FounderContact } from "./types.ts";

export interface FounderContactRepository {
  upsert(contact: FounderContact): Promise<FounderContact>;
  list(startupId: string): Promise<FounderContact[]>;
  get(startupId: string, contactId: string): Promise<FounderContact | null>;
}
