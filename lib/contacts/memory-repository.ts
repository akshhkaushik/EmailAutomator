import type { FounderContactRepository } from "./repository.ts";
import type { FounderContact } from "./types.ts";

export class InMemoryFounderContactRepository implements FounderContactRepository {
  private readonly contacts = new Map<string, FounderContact>();
  async upsert(contact: FounderContact) { this.contacts.set(`${contact.startupId}:${contact.founderName.toLowerCase()}`, contact); return contact; }
  async list(startupId: string) { return [...this.contacts.values()].filter((item) => item.startupId === startupId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  async get(startupId: string, contactId: string) { return (await this.list(startupId)).find((item) => item.id === contactId) || null; }
}
