import { discoveryRedisFromEnvironment } from "../discovery/redis-repository.ts";
import { assertBuildTransition } from "./transitions.ts";
import type { BuildRepository } from "./repository.ts";
import type { BuildProof, BuildSpec, BuildStatus } from "./types.ts";

const key = (id: string) => `signal:build:spec:${id}`;
const startupIndex = (id: string) => `signal:build:startup:${id}:specs`;
const opportunityKey = (startupId: string, opportunityId: string) => `signal:build:startup:${startupId}:opportunity:${opportunityId}`;

export class RedisBuildRepository implements BuildRepository {
  constructor(private readonly redis: NonNullable<ReturnType<typeof discoveryRedisFromEnvironment>>) {}
  async upsert(spec: BuildSpec) {
    const existing = await this.redis.get<BuildSpec>(key(spec.id));
    const record = existing ? { ...spec, status: existing.status, proof: existing.proof, createdAt: existing.createdAt, updatedAt: existing.updatedAt } : spec;
    await this.redis.set(key(record.id), record);
    await this.redis.zadd(startupIndex(record.startupId), { score: Date.parse(record.createdAt), member: record.id });
    await this.redis.set(opportunityKey(record.startupId, record.opportunityId), record.id);
    return record;
  }
  async get(startupId: string, id: string) { const item = await this.redis.get<BuildSpec>(key(id)); return item?.startupId === startupId ? item : null; }
  async getByOpportunity(startupId: string, opportunityId: string) { const id = await this.redis.get<string>(opportunityKey(startupId, opportunityId)); return id ? this.get(startupId, id) : null; }
  async list(startupId: string) {
    const ids = await this.redis.zrange<string[]>(startupIndex(startupId), 0, 99, { rev: true });
    const records = await Promise.all(ids.map((id) => this.get(startupId, id)));
    return records.filter((item): item is BuildSpec => Boolean(item));
  }
  async attachProof(startupId: string, id: string, proof: BuildProof) {
    const item = await this.get(startupId, id); if (!item) throw new Error("Build specification was not found.");
    const updated = { ...item, proof, updatedAt: new Date().toISOString() }; await this.redis.set(key(id), updated); return updated;
  }
  async updateStatus(startupId: string, id: string, status: BuildStatus) {
    const item = await this.get(startupId, id); if (!item) throw new Error("Build specification was not found.");
    assertBuildTransition(item.status, status, item.proof);
    const updated = { ...item, status, updatedAt: new Date().toISOString() }; await this.redis.set(key(id), updated); return updated;
  }
}

export function getBuildRepository() {
  const redis = discoveryRedisFromEnvironment();
  if (!redis) throw new Error("Build workflow storage is not configured. Connect Upstash Redis first.");
  return new RedisBuildRepository(redis);
}
