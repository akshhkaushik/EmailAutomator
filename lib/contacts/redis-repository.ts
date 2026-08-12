import { discoveryRedisFromEnvironment } from "../discovery/redis-repository.ts";
import type { FounderContactRepository } from "./repository.ts";
import type { FounderContact } from "./types.ts";

const contactKey = (startupId: string, founderName: string) => `signal:contacts:${startupId}:${founderName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
const contactIndex = (startupId: string) => `signal:contacts:${startupId}:index`;

export class RedisFounderContactRepository implements FounderContactRepository {
  private readonly redis: NonNullable<ReturnType<typeof discoveryRedisFromEnvironment>>;
  constructor(redis: NonNullable<ReturnType<typeof discoveryRedisFromEnvironment>>) { this.redis = redis; }
  async upsert(contact: FounderContact) { const key = contactKey(contact.startupId, contact.founderName); await this.redis.set(key, contact); await this.redis.zadd(contactIndex(contact.startupId), { score: Date.parse(contact.updatedAt), member: key }); return contact; }
  async list(startupId: string) { const keys = await this.redis.zrange<string[]>(contactIndex(startupId), 0, 49, { rev: true }); const records = await Promise.all(keys.map((key) => this.redis.get<FounderContact>(key))); return records.filter((item): item is FounderContact => Boolean(item)); }
  async get(startupId: string, contactId: string) { return (await this.list(startupId)).find((item) => item.id === contactId) || null; }
}

export function getFounderContactRepository() { const redis = discoveryRedisFromEnvironment(); if (!redis) throw new Error("Founder contact storage is not configured. Connect Upstash Redis first."); return new RedisFounderContactRepository(redis); }
