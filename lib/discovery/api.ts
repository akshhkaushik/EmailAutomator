import { DiscoveryAccessError } from "./auth.ts";
import { DiscoveryRateLimitError } from "./rate-limit.ts";
import { ValidationError } from "./validation.ts";
import { ContributionTransitionError } from "../contributions/transitions.ts";
import { OperationInProgressError } from "../reliability.ts";
import { errorName, structuredLog } from "../observability.ts";

export function discoveryApiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Startup discovery request failed.";
  const status = error instanceof DiscoveryAccessError ? error.status
    : error instanceof DiscoveryRateLimitError ? 429
    : error instanceof OperationInProgressError ? 409
    : error instanceof ValidationError ? 400
      : error instanceof ContributionTransitionError ? 409
      : /cannot move|Attach verifiable proof|Approve the contribution|S-tier startup|Completed build proof|required for this outreach mode/i.test(message) ? 409
      : /not found/i.test(message) ? 404
        : /not configured/i.test(message) ? 503
          : /robots|public internet|timed out|redirect|HTTP|HTML page|readable HTML|larger than/i.test(message) ? 422
            : 500;
  if (status >= 500 && status !== 503) structuredLog("error", "api.failed", { status, errorType: errorName(error) });
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store", ...(status === 429 ? { "Retry-After": "60" } : {}) } });
}

export async function jsonBody(request: Request, maxBytes = 64_000) {
  const declared = Number(request.headers.get("content-length") || "0");
  if (declared > maxBytes) throw new ValidationError("Request body is too large.");
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maxBytes) throw new ValidationError("Request body is too large.");
  try { return JSON.parse(body) as unknown; }
  catch { throw new ValidationError("Request body must be valid JSON."); }
}
