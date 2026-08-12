import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import { normalizeDomain, startupIdentity } from "./normalize.ts";
import { mergeStartup, type DiscoveryRepository, type NewAccelerator, type NewCohort, type StartupFilters, type StartupUpsert, type StartupUpsertResult } from "./repository.ts";
import type { Accelerator, Cohort, Startup, StartupProvenance } from "./types.ts";

const ACCELERATORS_INDEX = "signal:discovery:accelerators";
const COHORTS_INDEX = "signal:discovery:cohorts";
const STARTUPS_INDEX = "signal:discovery:startups";

function acceleratorKey(id: string) { return `signal:discovery:accelerator:${id}`; }
function cohortKey(id: string) { return `signal:discovery:cohort:${id}`; }
function cohortAcceleratorIndex(id: string) { return `signal:discovery:accelerator:${id}:cohorts`; }
function startupKey(id: string) { return `signal:discovery:startup:${id}`; }
function startupAcceleratorIndex(id: string) { return `signal:discovery:accelerator:${id}:startups`; }
function startupCohortIndex(id: string) { return `signal:discovery:cohort:${id}:startups`; }
function identityKey(identity: string) {
  return `signal:discovery:identity:${createHash("sha256").update(identity).digest("hex")}`;
}

export function discoveryRedisFromEnvironment() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

export function discoveryStorageReady() { return Boolean(discoveryRedisFromEnvironment()); }

export class RedisDiscoveryRepository implements DiscoveryRepository {
  private readonly redis: Redis;

  constructor(redis: Redis) { this.redis = redis; }

  async createAccelerator(input: NewAccelerator) {
    const now = new Date().toISOString();
    const accelerator: Accelerator = { id: crypto.randomUUID(), ...input, createdAt: now, updatedAt: now };
    await this.redis.set(acceleratorKey(accelerator.id), accelerator);
    await this.redis.zadd(ACCELERATORS_INDEX, { score: Date.parse(now), member: accelerator.id });
    return accelerator;
  }

  async listAccelerators() {
    const ids = await this.redis.zrange<string[]>(ACCELERATORS_INDEX, 0, 499, { rev: true });
    const records = await Promise.all(ids.map((id) => this.getAccelerator(id)));
    return records.filter((item): item is Accelerator => Boolean(item));
  }

  async getAccelerator(id: string) { return this.redis.get<Accelerator>(acceleratorKey(id)); }

  async createCohort(input: NewCohort) {
    if (!await this.getAccelerator(input.acceleratorId)) throw new Error("Accelerator was not found.");
    const now = new Date().toISOString();
    const cohort: Cohort = { id: crypto.randomUUID(), ...input, createdAt: now, updatedAt: now };
    await this.redis.set(cohortKey(cohort.id), cohort);
    await this.redis.zadd(COHORTS_INDEX, { score: Date.parse(now), member: cohort.id });
    await this.redis.zadd(cohortAcceleratorIndex(cohort.acceleratorId), { score: Date.parse(now), member: cohort.id });
    return cohort;
  }

  async listCohorts(acceleratorId?: string | null) {
    const index = acceleratorId ? cohortAcceleratorIndex(acceleratorId) : COHORTS_INDEX;
    const ids = await this.redis.zrange<string[]>(index, 0, 499, { rev: true });
    const records = await Promise.all(ids.map((id) => this.getCohort(id)));
    return records.filter((item): item is Cohort => Boolean(item));
  }

  async getCohort(id: string) { return this.redis.get<Cohort>(cohortKey(id)); }

  async upsertStartup(input: StartupUpsert): Promise<StartupUpsertResult> {
    const identity = startupIdentity(input.discovered);
    if (!identity) throw new Error("Discovered startup needs a name or website.");
    const mappingKey = identityKey(identity);
    let id = await this.redis.get<string>(mappingKey);
    if (!id) {
      const candidate = crypto.randomUUID();
      const claimed = await this.redis.set(mappingKey, candidate, { nx: true });
      id = claimed ? candidate : await this.redis.get<string>(mappingKey);
    }
    if (!id) throw new Error("Startup identity could not be reserved.");

    const now = new Date().toISOString();
    const provenance: StartupProvenance = {
      discoverySource: input.discoverySource,
      sourceUrl: input.discovered.sourceUrl,
      discoveredAt: input.discovered.discoveredAt,
      acceleratorId: input.acceleratorId,
      cohortId: input.cohortId,
      cohortName: input.cohortName,
    };
    const candidate: Startup = {
      id,
      name: input.discovered.name,
      website: input.discovered.website,
      domain: normalizeDomain(input.discovered.website),
      description: input.discovered.description,
      acceleratorId: input.acceleratorId,
      cohortId: input.cohortId,
      location: input.discovered.location,
      sourceUrls: [input.discovered.sourceUrl],
      provenance: [provenance],
      discoveryStatus: "discovered",
      createdAt: now,
      updatedAt: now,
    };
    const existing = await this.getStartup(id);
    const startup = existing ? mergeStartup(existing, candidate, provenance) : candidate;
    await this.redis.set(startupKey(id), startup);
    await this.redis.zadd(STARTUPS_INDEX, { score: Date.parse(startup.createdAt), member: id });
    await this.redis.zadd(startupAcceleratorIndex(input.acceleratorId), { score: Date.parse(startup.createdAt), member: id });
    if (input.cohortId) {
      await this.redis.zadd(startupCohortIndex(input.cohortId), { score: Date.parse(startup.createdAt), member: id });
    }
    return { startup, created: !existing };
  }

  async listStartups(filters: StartupFilters = {}) {
    const index = filters.cohortId
      ? startupCohortIndex(filters.cohortId)
      : filters.acceleratorId ? startupAcceleratorIndex(filters.acceleratorId) : STARTUPS_INDEX;
    const ids = await this.redis.zrange<string[]>(index, 0, 999, { rev: true });
    const records = await Promise.all(ids.map((id) => this.getStartup(id)));
    return records.filter((item): item is Startup => Boolean(item)).filter((startup) => {
      if (filters.acceleratorId && !startup.provenance.some((item) => item.acceleratorId === filters.acceleratorId)) return false;
      if (filters.cohortId && !startup.provenance.some((item) => item.cohortId === filters.cohortId)) return false;
      return true;
    });
  }

  async getStartup(id: string) { return this.redis.get<Startup>(startupKey(id)); }
}

export function getDiscoveryRepository() {
  const redis = discoveryRedisFromEnvironment();
  if (!redis) throw new Error("Startup discovery storage is not configured. Connect Upstash Redis first.");
  return new RedisDiscoveryRepository(redis);
}
