import assert from "node:assert/strict";
import test from "node:test";
import { jsonBody } from "../lib/discovery/api.ts";
import { GmailApiError, sendRawGmailMessage } from "../lib/gmail.ts";
import { retry, withOperationLock, OperationInProgressError } from "../lib/reliability.ts";
import { beginSendAttempt, completeSendAttempt, emailSendFingerprint, releaseSendAttempt } from "../lib/tracking.ts";

test("bounded JSON parsing rejects oversized API payloads", async () => {
  const request = new Request("https://app.test/api", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": "1000" },
    body: JSON.stringify({ value: "small" }),
  });
  await assert.rejects(() => jsonBody(request, 100), /too large/i);
});

test("retries bounded transient work and does not retry permanent errors", async () => {
  let attempts = 0;
  const result = await retry(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("temporary");
    return "ok";
  }, { attempts: 2, baseDelayMs: 0 });
  assert.equal(result, "ok");
  assert.equal(attempts, 2);

  attempts = 0;
  await assert.rejects(() => retry(async () => { attempts += 1; throw new TypeError("permanent"); }, { attempts: 3, baseDelayMs: 0, shouldRetry: (error) => !(error instanceof TypeError) }), /permanent/);
  assert.equal(attempts, 1);
});

test("operation locks reject concurrent duplicate jobs and release after completion", async () => {
  const records = new Map<string, string>();
  const redis = {
    async set(key: string, value: string, options: { nx: true; ex: number }) { void options; if (records.has(key)) return null; records.set(key, value); return "OK"; },
    async get<T>(key: string) { return (records.get(key) as T | undefined) || null; },
    async del(key: string) { records.delete(key); return 1; },
  };
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const first = withOperationLock(redis, "research:startup", 30, async () => { await waiting; return "done"; });
  await assert.rejects(() => withOperationLock(redis, "research:startup", 30, async () => "duplicate"), OperationInProgressError);
  release();
  assert.equal(await first, "done");
  assert.equal(await withOperationLock(redis, "research:startup", 30, async () => "next"), "next");
});

test("email send attempts are idempotent and reject key reuse with changed content", async () => {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  const sender = `sender-${crypto.randomUUID()}@example.com`;
  const key = `test:${crypto.randomUUID()}`;
  const fingerprint = emailSendFingerprint({ to: "person@example.com", subject: "Hello", body: "Body", attachment: "cGRm" });
  const started = await beginSendAttempt(sender, key, fingerprint);
  assert.equal(started.state, "started");
  assert.equal((await beginSendAttempt(sender, key, fingerprint)).state, "processing");
  assert.equal((await beginSendAttempt(sender, key, `${fingerprint}changed`)).state, "conflict");
  const result = { id: "gmail-1", trackingId: null, tracked: false, selfTest: false, sentAt: new Date().toISOString() };
  await completeSendAttempt(started.key, fingerprint, result);
  const replay = await beginSendAttempt(sender, key, fingerprint);
  assert.equal(replay.state, "completed");
  if (replay.state === "completed") assert.equal(replay.result.id, "gmail-1");
  await releaseSendAttempt(started.key);
  if (redisUrl) process.env.UPSTASH_REDIS_REST_URL = redisUrl;
  if (redisToken) process.env.UPSTASH_REDIS_REST_TOKEN = redisToken;
  if (kvUrl) process.env.KV_REST_API_URL = kvUrl;
  if (kvToken) process.env.KV_REST_API_TOKEN = kvToken;
});

test("Gmail client performs one authenticated send and validates its response", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return Response.json({ id: "gmail-message" });
  }) as typeof fetch;
  assert.deepEqual(await sendRawGmailMessage("access-token-value", "encoded-mime", fetcher), { id: "gmail-message" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init?.method, "POST");
  assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, "Bearer access-token-value");

  const rejected = (async () => Response.json({ error: { message: "denied" } }, { status: 403 })) as typeof fetch;
  await assert.rejects(() => sendRawGmailMessage("access-token-value", "encoded-mime", rejected), (error) => error instanceof GmailApiError && error.status === 403);
});
