import { createHash } from "node:crypto";

type LogLevel = "info" | "warn" | "error";
type LogValue = string | number | boolean | null | undefined;

const SENSITIVE_KEY = /token|secret|authorization|cookie|password|body|content|subject|resume|email/i;

export function opaqueId(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function requestId(request?: Request) {
  const supplied = request?.headers.get("x-request-id")?.trim();
  return supplied && /^[a-zA-Z0-9._-]{8,100}$/.test(supplied) ? supplied : crypto.randomUUID();
}

export function structuredLog(level: LogLevel, event: string, fields: Record<string, LogValue> = {}) {
  const safeFields = Object.fromEntries(Object.entries(fields).filter(([key, value]) => !SENSITIVE_KEY.test(key) && value !== undefined));
  const record = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...safeFields });
  if (level === "error") console.error(record);
  else if (level === "warn") console.warn(record);
  else console.info(record);
}

export function errorName(error: unknown) {
  return error instanceof Error ? error.name || "Error" : "UnknownError";
}
