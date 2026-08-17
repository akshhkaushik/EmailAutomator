import { discoveryRedisFromEnvironment } from "../discovery/redis-repository.ts";
import type { OutcomeRepository } from "./repository.ts";
import type { OutreachOutcome } from "./types.ts";

const key = (id: string) => `signal:learning:outcome:${id}`;
const outreachKey = (id: string) => `signal:learning:outreach:${id}:outcome`;
const INDEX = "signal:learning:outcomes";

export class RedisOutcomeRepository implements OutcomeRepository {
  constructor(private readonly redis: NonNullable<ReturnType<typeof discoveryRedisFromEnvironment>>) {}
  async save(outcome: OutreachOutcome) {
    const mapping = outreachKey(outcome.outreachId);
    let id = await this.redis.get<string>(mapping);
    if (!id) {
      const claimed = await this.redis.set(mapping, outcome.id, { nx: true });
      id = claimed ? outcome.id : await this.redis.get<string>(mapping);
    }
    if (!id) throw new Error("Outcome identity could not be reserved.");
    const existing = await this.get(id);
    if (existing) return existing;
    const record = { ...outcome, id };
    await this.redis.set(key(id), record);
    await this.redis.zadd(INDEX, { score: Date.parse(record.sentAt), member: id });
    return record;
  }
  async get(id: string) { return this.redis.get<OutreachOutcome>(key(id)); }
  async getByOutreach(outreachId: string) { const id = await this.redis.get<string>(outreachKey(outreachId)); return id ? this.get(id) : null; }
  async list() { const ids = await this.redis.zrange<string[]>(INDEX, 0, 999, { rev: true }); const records = await Promise.all(ids.map((id) => this.get(id))); return records.filter((item): item is OutreachOutcome => Boolean(item)); }
  async update(id: string, patch: Partial<Pick<OutreachOutcome, "replyStatus" | "replyClassification" | "followUpCount" | "interview" | "technicalTask" | "referral" | "rejection" | "offer" | "notes">>) { const item = await this.get(id); if (!item) throw new Error("Outreach outcome was not found."); const updated = { ...item, ...patch, updatedAt: new Date().toISOString() }; await this.redis.set(key(id), updated); return updated; }
}
export function getOutcomeRepository() { const redis = discoveryRedisFromEnvironment(); if (!redis) throw new Error("Outcome storage is not configured. Connect Upstash Redis first."); return new RedisOutcomeRepository(redis); }
