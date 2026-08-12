import { confidenceRank, evidenceFingerprint } from "./evidence-ledger.ts";
import { discoveryRedisFromEnvironment } from "../discovery/redis-repository.ts";
import type { IntelligenceRepository } from "./repository.ts";
import type { Evidence, EvidenceDraft, ResearchRun, StartupIntelligence } from "./types.ts";

function evidenceKey(id: string) { return `signal:intelligence:evidence:${id}`; }
function evidenceIdentityKey(fingerprint: string) { return `signal:intelligence:evidence-identity:${fingerprint}`; }
function evidenceIndex(startupId: string) { return `signal:intelligence:startup:${startupId}:evidence`; }
function runKey(id: string) { return `signal:intelligence:run:${id}`; }
function runIndex(startupId: string) { return `signal:intelligence:startup:${startupId}:runs`; }
function intelligenceKey(startupId: string) { return `signal:intelligence:startup:${startupId}:current`; }

export class RedisIntelligenceRepository implements IntelligenceRepository {
  private readonly redis: NonNullable<ReturnType<typeof discoveryRedisFromEnvironment>>;

  constructor(redis: NonNullable<ReturnType<typeof discoveryRedisFromEnvironment>>) { this.redis = redis; }

  async createResearchRun(startupId: string, sourceIds: string[]) {
    const run: ResearchRun = { id: crypto.randomUUID(), startupId, status: "running", sourceIds, evidenceIds: [], errors: [], startedAt: new Date().toISOString(), completedAt: null };
    await this.redis.set(runKey(run.id), run);
    await this.redis.zadd(runIndex(startupId), { score: Date.parse(run.startedAt), member: run.id });
    return run;
  }

  async completeResearchRun(id: string, input: Pick<ResearchRun, "status" | "evidenceIds" | "errors">) {
    const existing = await this.redis.get<ResearchRun>(runKey(id));
    if (!existing) throw new Error("Research run was not found.");
    const run: ResearchRun = { ...existing, ...input, completedAt: new Date().toISOString() };
    await this.redis.set(runKey(id), run);
    return run;
  }

  async upsertEvidence(startupId: string, draft: EvidenceDraft) {
    const fingerprint = evidenceFingerprint(startupId, draft);
    const mappingKey = evidenceIdentityKey(fingerprint);
    let id = await this.redis.get<string>(mappingKey);
    if (!id) {
      const candidate = crypto.randomUUID();
      const claimed = await this.redis.set(mappingKey, candidate, { nx: true });
      id = claimed ? candidate : await this.redis.get<string>(mappingKey);
    }
    if (!id) throw new Error("Evidence identity could not be reserved.");
    const existing = await this.redis.get<Evidence>(evidenceKey(id));
    if (existing) {
      const updated: Evidence = {
        ...existing,
        confidence: confidenceRank(draft.confidence) > confidenceRank(existing.confidence) ? draft.confidence : existing.confidence,
        metadata: { ...existing.metadata, lastObservedAt: draft.observedAt },
      };
      await this.redis.set(evidenceKey(id), updated);
      return { evidence: updated, created: false };
    }
    const evidence: Evidence = { id, startupId, ...draft, metadata: { ...draft.metadata, lastObservedAt: draft.observedAt } };
    await this.redis.set(evidenceKey(id), evidence);
    await this.redis.zadd(evidenceIndex(startupId), { score: Date.parse(evidence.observedAt), member: id });
    return { evidence, created: true };
  }

  async listEvidence(startupId: string) {
    const ids = await this.redis.zrange<string[]>(evidenceIndex(startupId), 0, 1_999, { rev: true });
    const records = await Promise.all(ids.map((id) => this.redis.get<Evidence>(evidenceKey(id))));
    return records.filter((item): item is Evidence => Boolean(item));
  }

  async saveIntelligence(intelligence: StartupIntelligence) { await this.redis.set(intelligenceKey(intelligence.startupId), intelligence); return intelligence; }
  async getIntelligence(startupId: string) { return this.redis.get<StartupIntelligence>(intelligenceKey(startupId)); }
  async listResearchRuns(startupId: string, limit = 20) {
    const ids = await this.redis.zrange<string[]>(runIndex(startupId), 0, Math.max(0, limit - 1), { rev: true });
    const records = await Promise.all(ids.map((id) => this.redis.get<ResearchRun>(runKey(id))));
    return records.filter((item): item is ResearchRun => Boolean(item));
  }
}

export function getIntelligenceRepository() {
  const redis = discoveryRedisFromEnvironment();
  if (!redis) throw new Error("Startup intelligence storage is not configured. Connect Upstash Redis first.");
  return new RedisIntelligenceRepository(redis);
}
