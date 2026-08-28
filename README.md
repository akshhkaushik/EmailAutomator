# Aksh Outreach

Aksh Outreach researches a company website, connects that research to your experience and projects, prepares a personalized job-outreach email, attaches your résumé, sends through Gmail only after a final review, and keeps a Gmail-backed list of startup outreach outcomes.

It also includes a bounded startup intelligence workflow from accelerator discovery through evidence, scoring, contribution hypotheses, proof-gated build specifications, audited outreach, outcomes, follow-up recommendations, and cautious learning analytics. Intelligence-derived company claims are validated against the evidence ledger before Gmail. Discovery, research, scoring, planning, and follow-up recommendations never send automatically.

## What it does

- Uses the recipient email, recipient name, and company website to research the correct company.
- Uses a built-in, researched catalog of Aksh's 28 original GitHub project repositories and separates live, substantial, prototype, and learning evidence.
- Saves the required core email content and optional personal overrides in the browser.
- Restores the current recipient, company, generated draft, edited subject, edited message, and tracking preference after a refresh. Browser security requires the résumé file to be reattached.
- Selects up to two relevant projects without inventing titles, claims, ownership, maturity, or URLs.
- Embeds live-project and repository links under their proper project titles.
- Produces an editable subject and message.
- Renders the full message with compact paragraph spacing and typography without shortening its wording.
- Appends Aksh's fixed BITS Pilani, GitHub, LinkedIn, portfolio, and email signature to every draft.
- Starts every email with Aksh's BITS Pilani introduction, includes fixed linked examples for CEO Voice Platform, Veritas, EvoComb, and GLOB, then adds only non-duplicate relevant work and a humble company-specific idea.
- Uses the consistent subject `I’d love to contribute to <Company>` and avoids decorative HTML and bulk-send behavior.
- Builds a recipient-level outreach list from the last 365 days of Gmail, classifying replies, tracked opens, unanswered messages, and Mail Delivery Subsystem failures. Multiple recipients in one thread remain separate so a bounce does not hide another recipient's reply.
- Offers per-email open tracking through a unique transparent image and shows first open, latest open, repeat loads, and exact observed timestamps in a private analytics view.
- Requests Gmail send and read-only scopes plus basic Google identity scopes, keeps short-lived access tokens in browser memory, and uses the verified Google identity to protect analytics data. Read-only access is used only to classify sent outreach, replies, and delivery notices; it cannot edit or delete mail.
- Requires an explicit approval before each send.

## Local setup

Requires Node.js 22 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Architecture

The Next.js App Router UI calls server-side route handlers. Domain modules under `lib/` keep discovery, intelligence, scoring, contribution, build, outreach, and learning logic outside React components. Upstash Redis repositories provide durable storage, locks, rate limits, idempotency, tracking, and analytics. In-memory repositories are limited to deterministic unit tests and local fallbacks.

The primary workflow is:

```text
Accelerator → Cohort → Startup → Research Sources → EvidenceLedger
→ Startup Intelligence → Opportunity Score → Contribution Opportunity
→ Founder Contact Discovery → BuildSpec/Proof → Evidence-validated Outreach → Human Review → Gmail
→ Outcome → Follow-up Recommendation → Learning Analytics
```

See the architecture documents in [`docs/`](./docs), especially [the security model](./docs/SECURITY.md) and [operations guide](./docs/OPERATIONS.md).

## Required services

### Google Gmail access

Create a Google Cloud project, enable the Gmail API, configure the OAuth consent screen, and create an OAuth 2.0 Client ID for a **Web application**.

The OAuth consent configuration must permit both `gmail.send` and `gmail.readonly`. Existing users will be asked to reconnect once so the outreach list can read sent threads and delivery notices.

Add these Authorized JavaScript origins:

- `http://localhost:3000`
- Your production Vercel origin, such as `https://your-project.vercel.app`

Set the public client identifier as:

```dotenv
GOOGLE_CLIENT_ID=000000000000-example.apps.googleusercontent.com
```

No Google client secret or Gmail password is used.

### AI research and drafting

For free AI drafting, create a Gemini API key in Google AI Studio and set only:

```dotenv
GEMINI_API_KEY=your_google_ai_studio_key
```

The app defaults to `gemini-3.5-flash-lite`, then `gemini-2.5-flash-lite`. No Vercel AI Gateway credit card or OpenAI balance is required. If both free models are temporarily unavailable, the app extracts evidence from the company website and creates the draft locally without an AI request.

Company research first requests the public site directly with browser-compatible headers. If a public page returns `403`, a bot challenge, JavaScript-only shell, or unusable HTML, it falls back to the free Jina Reader service and finally a domain-restricted public web search. An optional `JINA_API_KEY` increases Reader limits but is not required for basic use. Authentication walls and private pages are never bypassed.

AI Gateway and OpenAI are disabled unless `ENABLE_PAID_AI_FALLBACKS=true`, preventing accidental billing and quota noise. When intentionally enabled, `AI_MODEL` selects the Vercel provider/model identifier. Website research is compressed before generation and model output is capped at 1,200 tokens.

### Database and durable storage

Connect **Upstash for Redis** from the Vercel Marketplace. Vercel injects the REST URL and token automatically. Local development can use `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Discovery records use the same service under a separate key namespace and do not expire with email analytics.

Redis stores accelerators, cohorts, startups, evidence, research runs, intelligence snapshots, opportunities, BuildSpecs, outreach audits, outcomes, tracking records, rate-limit counters, operation locks, and send-idempotency records. Production requires Redis even though selected legacy paths have process-local development fallbacks.

### Founder work-email discovery

After research identifies a founder from public evidence, the native evidence engine visits a bounded set of same-domain contact, team, leadership, and about pages; extracts publicly published company-domain addresses; learns formats only from visible name/address pairings; checks DNS mail exchangers; and scores a small transparent candidate set. An exact public professional address plus a healthy mail domain can be selected without Hunter. Pattern evidence and MX records improve ordering but never prove that a mailbox exists. If `HUNTER_API_KEY` is configured, Hunter contributes an additional verification signal rather than acting as the sole authority. Unknown, invalid, unresolved, and unverified candidates remain disabled. Gmail still requires explicit review and a separate send action.

## Environment variables

| Variable | Required | Visibility | Purpose |
| --- | --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Yes, for sending | Returned to the browser by `/api/config` | Google OAuth web client identifier |
| `DISCOVERY_OWNER_EMAIL` | Required in production | Server only | Restricts research, discovery, intelligence, analytics, outreach, outcomes, and sending to one verified Google email |
| `AI_MODEL` | Optional | Server only | AI Gateway model; defaults to `openai/gpt-5.4` |
| `AI_GATEWAY_API_KEY` | Local alternative only | Secret, server only | Static Gateway authentication when OIDC is unavailable |
| `GEMINI_API_KEY` | Optional fallback | Secret, server only | Direct Gemini access, including eligible free-tier usage |
| `GEMINI_LOW_COST_MODEL` | Optional | Server only | First direct Gemini model; defaults to `gemini-3.5-flash-lite` |
| `GEMINI_MODELS` | Optional | Server only | Comma-separated direct Gemini fallback models; defaults to `gemini-2.5-flash-lite` |
| `GEMINI_MODEL` | Optional legacy fallback | Server only | Existing direct Gemini model appended after the low-cost choices |
| `OPENAI_API_KEY` | Optional fallback | Secret, server only | Direct OpenAI access outside Vercel |
| `OPENAI_MODEL` | Optional fallback | Server only | Direct OpenAI model; defaults to `gpt-5.4` |
| `ENABLE_PAID_AI_FALLBACKS` | Optional | Server only | Set to `true` only if AI Gateway/OpenAI billing fallbacks are intentionally enabled; defaults to disabled |
| `JINA_API_KEY` | Optional | Server only | Higher limits for blocked-site recovery through Jina Reader; anonymous basic usage works without it |
| `HUNTER_API_KEY` | Optional | Secret, server only | Adds Hunter as an external corroborating verifier; native public evidence and DNS checks work without it |
| `UPSTASH_REDIS_REST_URL` | Required in production | Secret, server only | Durable workflow, analytics, lock, and idempotency storage URL |
| `UPSTASH_REDIS_REST_TOKEN` | Required in production | Secret, server only | Durable workflow, analytics, lock, and idempotency storage token |

## Deploy to Vercel

```bash
npx vercel link
npx vercel env add GOOGLE_CLIENT_ID production
npx vercel --prod
```

After the first deployment, add the exact production origin to the Google OAuth Client ID, then redeploy if the domain changes.

The repository also contains `.openai/hosting.json` for private Sites hosting. Preserve that manifest and configure runtime secrets through the hosting environment rather than committing them. Run the complete verification suite before either deployment path.

## Testing

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Tests use fixture HTML, in-memory repositories, injected fetch implementations, and mocked Gmail responses. They do not require live startup sites and never send real email.

## Startup and opportunity workflow

Add accelerators such as YC, Accel, or Neo and optional cohorts, run bounded portfolio discovery, then research the startups that meet the visible score/tier constraints. Evidence remains source-attributed and unknown fields stay unknown. Deterministic scoring ranks the startup for Aksh, and the contribution engine only proposes small projects supported by both startup evidence and the formal Aksh project catalog. Founder email discovery runs only after founder and company-domain evidence exists. S-tier approved opportunities can become BuildSpecs; completed proof must be attached by the user.

## Outreach workflow

Choose an approved opportunity and outreach mode. Build-before-ask and open-source modes require a completed BuildSpec plus a GitHub repository, pull request, or demo URL. The generator receives structured context rather than a raw scrape. Every factual startup statement must pass EvidenceLedger validation before review and again before Gmail. The final send remains an explicit, single-recipient action.

## Operations and security

External web content is untrusted. Fetches use DNS-aware SSRF checks, timeouts, response limits, manual redirects, and bounded crawling. AI prompts separate system instructions, untrusted evidence, and generated output. Concurrent discovery/research jobs are locked, all sends are idempotent, and structured logs omit tokens, recipients, subjects, bodies, and résumé data. Detailed controls and runbooks are in [SECURITY.md](./docs/SECURITY.md) and [OPERATIONS.md](./docs/OPERATIONS.md).

## Safety and privacy

- Signal never stores a Gmail password.
- Mailbox review uses Gmail read-only access and does not mark messages read, move, label, edit, or delete them.
- Gmail access tokens remain short-lived and are stored only for the current browser session. A still-valid token survives a reload, is refreshed shortly before expiry while the app is open, and is reacquired silently on later visits when Google permits it. Disconnecting revokes the grant and clears the browser token and preference.
- The résumé is read for the selected send and is not persisted by the app.
- Company claims are restricted to readable content fetched from the supplied website.
- Sending is single-recipient and review-first.
- Analytics records are isolated by the verified connected Google email address and expire after one year.
- Messages sent to the same verified Google mailbox are stored as self-tests without a tracking pixel and are excluded from sent/open/open-rate metrics. Existing same-mailbox test records are also classified and excluded when analytics load.
- Open tracking is approximate: image proxies and security scanners may create loads, while image blocking may hide genuine reads. The UI describes events as observed loads rather than guaranteed human opens.
