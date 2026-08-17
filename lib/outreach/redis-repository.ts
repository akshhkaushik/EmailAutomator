import { discoveryRedisFromEnvironment } from "../discovery/redis-repository.ts";
import type { OutreachRepository } from "./repository.ts";
import type { OutreachDraftAudit, OutreachValidation } from "./types.ts";

const draftKey = (id: string) => `signal:outreach-audit:draft:${id}`;
const startupIndex = (id: string) => `signal:outreach-audit:startup:${id}:drafts`;

export class RedisOutreachRepository implements OutreachRepository {
  constructor(private readonly redis: NonNullable<ReturnType<typeof discoveryRedisFromEnvironment>>) {}
  async save(draft: OutreachDraftAudit) { await this.redis.set(draftKey(draft.id), draft); await this.redis.zadd(startupIndex(draft.startupId), { score: Date.parse(draft.generatedAt), member: draft.id }); return draft; }
  async get(id: string) { return this.redis.get<OutreachDraftAudit>(draftKey(id)); }
  async list(startupId: string) { const ids = await this.redis.zrange<string[]>(startupIndex(startupId), 0, 99, { rev: true }); const records = await Promise.all(ids.map((id) => this.get(id))); return records.filter((item): item is OutreachDraftAudit => Boolean(item)); }
  async history(startupId: string) { return (await this.list(startupId)).map(({ id, mode, generatedAt, sentAt, subject }) => ({ id, mode, generatedAt, sentAt, subject })); }
  async updateValidatedContent(id: string, subject: string, body: string, recipientEmail: string, validation: OutreachValidation) { const item = await this.get(id); if (!item) throw new Error("Outreach draft was not found."); const updated = { ...item, subject, body, recipientEmail, validation, updatedAt: new Date().toISOString() }; await this.redis.set(draftKey(id), updated); return updated; }
  async markSent(id: string, sentAt: string) { const item = await this.get(id); if (!item) throw new Error("Outreach draft was not found."); if (item.sentAt) return item; const updated = { ...item, sentAt, updatedAt: sentAt }; await this.redis.set(draftKey(id), updated); return updated; }
}

export function getOutreachRepository() { const redis = discoveryRedisFromEnvironment(); if (!redis) throw new Error("Outreach audit storage is not configured. Connect Upstash Redis first."); return new RedisOutreachRepository(redis); }
