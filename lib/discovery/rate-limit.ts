import { createHash } from "node:crypto";
import { discoveryRedisFromEnvironment } from "./redis-repository.ts";

export class DiscoveryRateLimitError extends Error {}
const memoryBuckets = new Map<string, { count: number; expiresAt: number }>();

async function enforceRateLimit(namespace: string, email: string, limit: number, message: string) {
  const redis = discoveryRedisFromEnvironment();
  const ownerHash = createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 24);
  const bucket = Math.floor(Date.now() / 60_000);
  const key = `signal:${namespace}:rate:${ownerHash}:${bucket}`;
  if (!redis) {
    const existing = memoryBuckets.get(key);
    const current = existing && existing.expiresAt > Date.now() ? existing : { count: 0, expiresAt: Date.now() + 90_000 };
    current.count += 1;
    memoryBuckets.set(key, current);
    if (current.count > limit) throw new DiscoveryRateLimitError(message);
    return;
  }
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 90);
  if (count > limit) throw new DiscoveryRateLimitError(message);
}

export function enforceDiscoveryRateLimit(email: string) {
  return enforceRateLimit("discovery", email, 5, "Discovery is limited to five runs per minute. Try again shortly.");
}

export function enforceStartupResearchRateLimit(email: string) {
  return enforceRateLimit("intelligence", email, 5, "Startup research is limited to five runs per minute. Try again shortly.");
}

export function enforceFounderContactRateLimit(email: string) {
  return enforceRateLimit("founder-contact", email, 5, "Founder email discovery is limited to five runs per minute. Try again shortly.");
}

export function enforceDraftRateLimit(email: string) {
  return enforceRateLimit("draft", email, 10, "Draft generation is limited to ten runs per minute. Try again shortly.");
}

export function enforceSendRateLimit(email: string) {
  return enforceRateLimit("send", email, 5, "Email sending is limited to five attempts per minute. Try again shortly.");
}
