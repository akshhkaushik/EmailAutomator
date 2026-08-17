export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
};

export async function retry<T>(operation: (attempt: number) => Promise<T>, options: RetryOptions = {}) {
  const attempts = Math.max(1, Math.min(options.attempts ?? 2, 4));
  const baseDelayMs = Math.max(0, Math.min(options.baseDelayMs ?? 150, 2_000));
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await operation(attempt); }
    catch (error) {
      lastError = error;
      if (attempt >= attempts || options.shouldRetry && !options.shouldRetry(error, attempt)) throw error;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
    }
  }
  throw lastError;
}

export class OperationInProgressError extends Error {}

type LockRedis = {
  set(key: string, value: string, options: { nx: true; ex: number }): Promise<unknown>;
  get<T>(key: string): Promise<T | null>;
  del(key: string): Promise<unknown>;
};

export async function withOperationLock<T>(redis: LockRedis, key: string, ttlSeconds: number, operation: () => Promise<T>) {
  const token = crypto.randomUUID();
  const acquired = await redis.set(`signal:lock:${key}`, token, { nx: true, ex: ttlSeconds });
  if (!acquired) throw new OperationInProgressError("This operation is already running. Wait for it to finish before trying again.");
  try { return await operation(); }
  finally {
    const current = await redis.get<string>(`signal:lock:${key}`);
    if (current === token) await redis.del(`signal:lock:${key}`);
  }
}
