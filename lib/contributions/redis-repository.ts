import { discoveryRedisFromEnvironment } from "../discovery/redis-repository.ts";
import { assertContributionTransition } from "./transitions.ts";
import type { ContributionRepository } from "./repository.ts";
import type { BuildSpecification, ContributionOpportunity, ContributionStatus } from "./types.ts";

function opportunityKey(id: string) { return `signal:contribution:opportunity:${id}`; }
function startupIndex(startupId: string) { return `signal:contribution:startup:${startupId}:opportunities`; }

export class RedisContributionRepository implements ContributionRepository {
  private readonly redis: NonNullable<ReturnType<typeof discoveryRedisFromEnvironment>>;

  constructor(redis: NonNullable<ReturnType<typeof discoveryRedisFromEnvironment>>) { this.redis = redis; }

  async upsertSuggestions(startupId: string, suggestions: ContributionOpportunity[]) {
    for (const suggestion of suggestions) {
      if (suggestion.startupId !== startupId) throw new Error("Contribution opportunity belongs to another startup.");
      const existing = await this.redis.get<ContributionOpportunity>(opportunityKey(suggestion.id));
      const record: ContributionOpportunity = existing ? {
        ...suggestion,
        status: existing.status,
        buildSpec: existing.buildSpec,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
      } : suggestion;
      await this.redis.set(opportunityKey(record.id), record);
      await this.redis.zadd(startupIndex(startupId), { score: record.contributionScore, member: record.id });
    }
    return this.list(startupId);
  }

  async list(startupId: string) {
    const ids = await this.redis.zrange<string[]>(startupIndex(startupId), 0, 99, { rev: true });
    const records = await Promise.all(ids.map((id) => this.redis.get<ContributionOpportunity>(opportunityKey(id))));
    return records.filter((item): item is ContributionOpportunity => Boolean(item)).filter((item) => item.startupId === startupId)
      .sort((a, b) => b.contributionScore - a.contributionScore || a.title.localeCompare(b.title));
  }

  async get(startupId: string, id: string) {
    const item = await this.redis.get<ContributionOpportunity>(opportunityKey(id));
    return item?.startupId === startupId ? item : null;
  }

  async updateStatus(startupId: string, id: string, status: ContributionStatus) {
    const existing = await this.get(startupId, id);
    if (!existing) throw new Error("Contribution opportunity was not found.");
    assertContributionTransition(existing.status, status);
    const updated = { ...existing, status, updatedAt: new Date().toISOString() };
    await this.redis.set(opportunityKey(id), updated);
    return updated;
  }

  async saveBuildSpec(startupId: string, id: string, buildSpec: BuildSpecification) {
    const existing = await this.get(startupId, id);
    if (!existing) throw new Error("Contribution opportunity was not found.");
    const updated = { ...existing, buildSpec, updatedAt: new Date().toISOString() };
    await this.redis.set(opportunityKey(id), updated);
    return updated;
  }
}

export function getContributionRepository() {
  const redis = discoveryRedisFromEnvironment();
  if (!redis) throw new Error("Contribution opportunity storage is not configured. Connect Upstash Redis first.");
  return new RedisContributionRepository(redis);
}
