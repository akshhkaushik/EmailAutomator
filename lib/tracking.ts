import { Redis } from "@upstash/redis";

export type OpenEvent = {
  observedAt: string;
  userAgent: string;
};

export type TrackingRecord = {
  id: string;
  senderEmail: string;
  recipientEmail: string;
  recipientName: string;
  companyName: string;
  companyUrl: string;
  subject: string;
  gmailMessageId: string;
  status: "sending" | "sent";
  trackingEnabled: boolean;
  selfTest: boolean;
  sentAt: string | null;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  opens: OpenEvent[];
};

const RECORD_PREFIX = "signal:outreach:";
const SENDER_PREFIX = "signal:sender:";
const MAX_EVENTS_PER_EMAIL = 25;

function redisFromEnvironment() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function recordKey(id: string) {
  return `${RECORD_PREFIX}${id}`;
}

function senderIndex(senderEmail: string) {
  return `${SENDER_PREFIX}${senderEmail.toLowerCase()}:emails`;
}

export function trackingStorageReady() {
  return Boolean(
    (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
    (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN),
  );
}

export function sameGoogleMailbox(first: string, second: string) {
  const normalize = (value: string) => {
    const [rawLocal = "", rawDomain = ""] = value.trim().toLowerCase().split("@");
    const domain = rawDomain === "googlemail.com" ? "gmail.com" : rawDomain;
    const withoutAlias = rawLocal.split("+")[0];
    const local = domain === "gmail.com" ? withoutAlias.replace(/\./g, "") : withoutAlias;
    return `${local}@${domain}`;
  };
  return Boolean(first && second && normalize(first) === normalize(second));
}

export async function createPendingTrackingRecord(input: Omit<TrackingRecord, "gmailMessageId" | "status" | "sentAt" | "firstOpenedAt" | "lastOpenedAt" | "openCount" | "opens">) {
  const redis = redisFromEnvironment();
  if (!redis) return false;
  const record: TrackingRecord = {
    ...input,
    gmailMessageId: "",
    status: "sending",
    sentAt: null,
    firstOpenedAt: null,
    lastOpenedAt: null,
    openCount: 0,
    opens: [],
  };
  await redis.set(recordKey(record.id), record, { ex: 60 * 60 * 24 * 365 });
  return true;
}

export async function markTrackingRecordSent(id: string, gmailMessageId: string) {
  const redis = redisFromEnvironment();
  if (!redis) return null;
  const record = await redis.get<TrackingRecord>(recordKey(id));
  if (!record) return null;
  const sentAt = new Date().toISOString();
  const updated: TrackingRecord = { ...record, status: "sent", sentAt, gmailMessageId };
  await redis.set(recordKey(id), updated, { ex: 60 * 60 * 24 * 365 });
  await redis.zadd(senderIndex(updated.senderEmail), { score: Date.parse(sentAt), member: id });
  return updated;
}

export async function removeTrackingRecord(id: string) {
  const redis = redisFromEnvironment();
  if (!redis) return;
  const record = await redis.get<TrackingRecord>(recordKey(id));
  if (record?.senderEmail) await redis.zrem(senderIndex(record.senderEmail), id);
  await redis.del(recordKey(id));
}

export async function observeOpen(id: string, userAgent: string) {
  const redis = redisFromEnvironment();
  if (!redis || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const record = await redis.get<TrackingRecord>(recordKey(id));
  if (!record || record.status !== "sent" || !record.trackingEnabled) return null;
  const observedAt = new Date().toISOString();
  const event: OpenEvent = {
    observedAt,
    userAgent: userAgent.slice(0, 240) || "Unknown email client",
  };
  const updated: TrackingRecord = {
    ...record,
    firstOpenedAt: record.firstOpenedAt || observedAt,
    lastOpenedAt: observedAt,
    openCount: record.openCount + 1,
    opens: [event, ...(record.opens || [])].slice(0, MAX_EVENTS_PER_EMAIL),
  };
  await redis.set(recordKey(id), updated, { ex: 60 * 60 * 24 * 365 });
  return updated;
}

export async function listTrackingRecords(senderEmail: string, limit = 100) {
  const redis = redisFromEnvironment();
  if (!redis) return [];
  const ids = await redis.zrange<string[]>(senderIndex(senderEmail), 0, Math.max(0, limit - 1), { rev: true });
  const records = await Promise.all(ids.map((id) => redis.get<TrackingRecord>(recordKey(id))));
  return records.filter((record): record is TrackingRecord => Boolean(record && record.status === "sent"));
}

export async function verifyGoogleAccessToken(authorization: string | null) {
  if (!authorization?.startsWith("Bearer ")) throw new Error("Connect Gmail to view or create analytics.");
  const token = authorization.slice(7);
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`, {
    cache: "no-store",
  });
  const data = await response.json() as {
    aud?: string;
    email?: string;
    email_verified?: string | boolean;
    error_description?: string;
  };
  if (!response.ok || !data.email || (data.email_verified !== "true" && data.email_verified !== true)) {
    throw new Error(data.error_description || "Reconnect Gmail to verify your analytics access.");
  }
  if (process.env.GOOGLE_CLIENT_ID && data.aud !== process.env.GOOGLE_CLIENT_ID) {
    throw new Error("This Gmail token belongs to a different application.");
  }
  return { token, email: data.email.toLowerCase() };
}
