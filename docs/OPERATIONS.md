# Operations Guide

## Runtime dependencies

- Node.js 22+
- Google OAuth web client with Gmail API enabled
- Upstash Redis for durable workflow state, rate limits, locks, idempotency, analytics, and tracking
- Optional Gemini; optional paid AI Gateway/OpenAI fallbacks
- Optional Jina Reader key for higher recovery limits

The system fails closed for persistent startup workflows when Redis is unavailable. Legacy email sending can continue without open tracking; its rate limiting and idempotency use a process-local fallback, which is suitable only for local development. Production must configure Redis.

## Health signals

Use the production build as the release gate. Runtime health is observable through structured JSON events:

| Event | Meaning |
| --- | --- |
| `discovery.started/completed` | Portfolio adapter execution and deduplication counts |
| `research.started/source_failed/completed` | Research job state, partial failures, and evidence counts |
| `scoring.completed` | Number of startups scored |
| `opportunity_generation.started/completed` | Deterministic contribution generation |
| `draft.started/completed/fallback/failed` | Legacy research/draft provider behavior |
| `outreach_generation.started/completed` | Structured outreach generation and validation |
| `email.approval_received/send_started/sent/send_failed` | Human approval and Gmail lifecycle |
| `outcome.updated` | Reply/follow-up outcome changes |

Alert-worthy conditions include repeated `email.send_failed`, research jobs remaining `running` beyond their lock TTL, sustained source failures, Redis connection failures, unusual 429 volume, and a sharp rise in invalid or ungrounded LLM output.

## Job and retry behavior

- Discovery and research are synchronous jobs protected by Redis locks. A duplicate concurrent request returns HTTP 409.
- Research runs store `startedAt`, `completedAt`, status, source IDs, evidence IDs, and per-source errors.
- Public GET fetches retry once only for HTTP 429/5xx, within the original timeout budget.
- Individual research sources fail independently; successful evidence is retained and the run becomes `partial`.
- LLM providers degrade to another configured provider or deterministic local output.
- Gmail is not retried automatically because delivery may have occurred even when the response is lost.

## Idempotency and retention

- Startup identity uses normalized domain first. Missing-domain entries are only merged within the same source.
- Evidence identity hashes startup, category, claim, source URL, and canonical value.
- Contribution opportunity IDs are deterministic over startup, opportunity type, and evidence.
- Outcome creation is unique by outreach ID.
- Follow-up recommendations derive from outcome state and follow-up count; they do not create sends.
- Tracking and completed send-idempotency records expire after one year and seven days respectively. Core discovery/intelligence records currently do not expire.

## Deployment checklist

1. Set `GOOGLE_CLIENT_ID` and `DISCOVERY_OWNER_EMAIL`.
2. Configure Upstash Redis REST URL and token.
3. Add optional AI/Jina keys only when intentionally enabled.
4. Confirm the exact production origin is an authorized Google JavaScript origin.
5. Run lint, type checking, all tests, and the production build.
6. Deploy privately.
7. Perform one self-test to the connected Gmail account; tracking is automatically disabled and excluded.
8. Create a fixture accelerator, run discovery/research, generate an opportunity, validate a draft, and stop before Gmail unless a real test recipient has explicitly approved it.

## Common failures

### HTTP 401 or 403

Reconnect Gmail. Verify the OAuth client audience and that the connected address equals `DISCOVERY_OWNER_EMAIL`. A hosted platform login does not replace Google authorization for Gmail-backed API actions.

### HTTP 409

Another discovery/research operation is running, an audited draft was already sent, or an idempotent send is still processing. Wait for the active job. For Gmail uncertainty, inspect the Sent folder before any retry.

### HTTP 422 during research

Inspect the source URL, `robots.txt`, redirects, content type, and whether DNS resolves only to public addresses. Do not bypass a site's access controls.

### Redis unavailable

Restore the Redis integration and credentials. Do not repeatedly submit writes while storage is degraded. Existing Google or AI secrets are unrelated to Redis recovery.

### AI unavailable or invalid

The legacy composer falls back locally. Intelligence outreach can use the deterministic generator. Repeated invalid output should trigger model/config review, never relaxed evidence validation.

### Gmail delivery uncertain

Check Gmail Sent. Do not alter the idempotency key or draft to force an immediate retry. The system retains a temporary lock specifically to prevent a duplicate message.

## Backup and recovery

Upstash is the system of record. Enable the provider's backup/export capability appropriate to the plan. Recovery testing should verify accelerator, startup, EvidenceLedger, research runs, opportunity/build state, outreach audit, tracking, and outcome keys. Never export Redis credentials into the repository.

## Release rollback

Roll back the application deployment without deleting Redis keys. Data formats are additive and repository abstractions preserve existing records. If a release changes a stored schema later, document a forward and reverse migration before deployment.
