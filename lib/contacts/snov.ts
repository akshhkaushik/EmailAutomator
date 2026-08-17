import { founderNameParts } from "./candidates.ts";
import type { EmailVerificationStatus, FounderContactLookup, FounderEmailFinder } from "./types.ts";

type TokenResponse = { access_token?: unknown; expires_in?: unknown; error_description?: unknown; message?: unknown };
type StartResponse = { data?: { task_hash?: unknown }; message?: unknown; errors?: unknown };
type FinderResult = {
  status?: unknown;
  data?: Array<{ people?: unknown; result?: Array<{ email?: unknown; smtp_status?: unknown; unknown_status_reason?: unknown }> }>;
  message?: unknown;
  errors?: unknown;
};

function apiMessage(body: { message?: unknown; error_description?: unknown; errors?: unknown }, fallback: string) {
  if (typeof body.message === "string" && body.message.trim()) return body.message.trim();
  if (typeof body.error_description === "string" && body.error_description.trim()) return body.error_description.trim();
  if (Array.isArray(body.errors)) {
    const first = body.errors[0];
    if (typeof first === "string" && first.trim()) return first.trim();
    if (first && typeof first === "object" && "message" in first && typeof first.message === "string") return first.message;
  }
  return fallback;
}

function verificationStatus(value: unknown): Exclude<EmailVerificationStatus, "unverified"> {
  if (value === "valid") return "valid";
  if (value === "not_valid" || value === "invalid") return "invalid";
  return "unknown";
}

export class SnovEmailFinder implements FounderEmailFinder {
  readonly id = "snov" as const;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly fetcher: typeof fetch;
  private accessToken = "";
  private tokenExpiresAt = 0;

  constructor(clientId: string, clientSecret: string, fetcher: typeof fetch = fetch) {
    if (!clientId.trim() || !clientSecret.trim()) throw new Error("Snov.io API credentials are required.");
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.fetcher = fetcher;
  }

  private async token() {
    if (this.accessToken && this.tokenExpiresAt > Date.now() + 60_000) return this.accessToken;
    const form = new URLSearchParams({ grant_type: "client_credentials", client_id: this.clientId, client_secret: this.clientSecret });
    const response = await this.fetcher("https://api.snov.io/v1/oauth/access_token", {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: form, signal: AbortSignal.timeout(8_000),
    });
    const body = await response.json() as TokenResponse;
    if (!response.ok || typeof body.access_token !== "string" || !body.access_token) {
      throw new Error(apiMessage(body, `Snov.io authentication returned HTTP ${response.status}.`));
    }
    this.accessToken = body.access_token;
    this.tokenExpiresAt = Date.now() + Math.max(300, Number(body.expires_in) || 3_600) * 1_000;
    return this.accessToken;
  }

  async find(input: { founderName: string; domain: string }): Promise<FounderContactLookup | null> {
    const name = founderNameParts(input.founderName);
    const token = await this.token();
    const startResponse = await this.fetcher("https://api.snov.io/v2/emails-by-domain-by-name/start", {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [{ first_name: name.first, last_name: name.last, domain: input.domain }] }),
      signal: AbortSignal.timeout(10_000),
    });
    const startBody = await startResponse.json() as StartResponse;
    const taskHash = typeof startBody.data?.task_hash === "string" ? startBody.data.task_hash : "";
    if (!startResponse.ok || !taskHash) throw new Error(apiMessage(startBody, `Snov.io Email Finder returned HTTP ${startResponse.status}.`));

    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 700));
      const endpoint = new URL("https://api.snov.io/v2/emails-by-domain-by-name/result");
      endpoint.searchParams.set("task_hash", taskHash);
      const resultResponse = await this.fetcher(endpoint, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000),
      });
      const resultBody = await resultResponse.json() as FinderResult;
      if (!resultResponse.ok) throw new Error(apiMessage(resultBody, `Snov.io Email Finder result returned HTTP ${resultResponse.status}.`));
      if (resultBody.status !== "completed") continue;
      const results = resultBody.data?.[0]?.result || [];
      const result = results.find((item) => item.smtp_status === "valid" && typeof item.email === "string")
        || results.find((item) => typeof item.email === "string");
      const email = typeof result?.email === "string" ? result.email.trim().toLowerCase() : "";
      if (!email || email.split("@")[1] !== input.domain.toLowerCase()) return null;
      const status = verificationStatus(result?.smtp_status);
      return { email, status, score: status === "valid" ? 95 : status === "unknown" ? 50 : 0, sources: [], verifiedAt: new Date().toISOString() };
    }
    throw new Error("Snov.io Email Finder did not finish before the request timeout.");
  }
}
