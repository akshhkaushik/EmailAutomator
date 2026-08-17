import { retry } from "../reliability.ts";
import type { EmailSource, EmailVerificationStatus, FounderContactLookup, FounderEmailFinder } from "./types.ts";

type HunterResponse = { data?: { email?: unknown; score?: unknown; sources?: unknown; verification?: { date?: unknown; status?: unknown } }; errors?: Array<{ details?: string }> };
type HunterVerifierResponse = { data?: { email?: unknown; score?: unknown; status?: unknown; sources?: unknown }; errors?: Array<{ details?: string }> };

function sources(value: unknown): EmailSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.uri !== "string" || !/^https?:\/\//i.test(record.uri)) return [];
    return [{ url: record.uri, firstSeenAt: typeof record.extracted_on === "string" ? record.extracted_on : null, lastSeenAt: typeof record.last_seen_on === "string" ? record.last_seen_on : null }];
  }).slice(0, 20);
}

function status(value: unknown): Exclude<EmailVerificationStatus, "unverified"> {
  if (value === "valid" || value === "accept_all" || value === "unknown" || value === "invalid") return value;
  return value === "webmail" || value === "disposable" ? "invalid" : "unknown";
}

export class HunterEmailFinder implements FounderEmailFinder {
  readonly id = "hunter" as const;
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;
  constructor(apiKey: string, fetcher: typeof fetch = fetch) {
    if (!apiKey.trim()) throw new Error("Hunter API key is required.");
    this.apiKey = apiKey;
    this.fetcher = fetcher;
  }

  async find(input: { founderName: string; domain: string }): Promise<FounderContactLookup | null> {
    const endpoint = new URL("https://api.hunter.io/v2/email-finder");
    endpoint.searchParams.set("domain", input.domain);
    endpoint.searchParams.set("full_name", input.founderName);
    endpoint.searchParams.set("max_duration", "10");
    endpoint.searchParams.set("api_key", this.apiKey);
    const response = await retry(() => this.fetcher(endpoint, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12_000) }), {
      attempts: 2, baseDelayMs: 150, shouldRetry: (error) => error instanceof TypeError,
    });
    const body = await response.json() as HunterResponse;
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(body.errors?.[0]?.details || `Hunter Email Finder returned HTTP ${response.status}.`);
    const email = typeof body.data?.email === "string" ? body.data.email.trim().toLowerCase() : "";
    if (!email) return null;
    const verifiedAt = typeof body.data?.verification?.date === "string"
      ? new Date(`${body.data.verification.date}T00:00:00.000Z`).toISOString()
      : new Date().toISOString();
    return { email, status: status(body.data?.verification?.status), score: Math.max(0, Math.min(100, Number(body.data?.score) || 0)), sources: sources(body.data?.sources), verifiedAt };
  }

  async verify(email: string): Promise<FounderContactLookup> {
    const endpoint = new URL("https://api.hunter.io/v2/email-verifier");
    endpoint.searchParams.set("email", email);
    endpoint.searchParams.set("api_key", this.apiKey);
    const response = await this.fetcher(endpoint, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    if (response.status === 202 || response.status === 222) return { email, status: "unknown", score: 0, sources: [], verifiedAt: new Date().toISOString() };
    const body = await response.json() as HunterVerifierResponse;
    if (response.status === 451) throw new Error("This contact opted out of processing; no email candidates will be used.");
    if (!response.ok) throw new Error(body.errors?.[0]?.details || `Hunter Email Verifier returned HTTP ${response.status}.`);
    return {
      email: typeof body.data?.email === "string" ? body.data.email.trim().toLowerCase() : email,
      status: status(body.data?.status), score: Math.max(0, Math.min(100, Number(body.data?.score) || 0)),
      sources: sources(body.data?.sources), verifiedAt: new Date().toISOString(),
    };
  }
}
