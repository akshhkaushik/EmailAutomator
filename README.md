# Aksh Outreach

Aksh Outreach researches a company website, connects that research to your experience and projects, prepares a personalized job-outreach email, attaches your résumé, sends through Gmail only after a final review, and records observed email-open activity.

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
- Offers per-email open tracking through a unique transparent image and shows first open, latest open, repeat loads, and exact observed timestamps in a private analytics view.
- Requests Gmail sending plus basic Google identity scopes, keeps short-lived access tokens in browser memory, and uses the verified Google identity to protect analytics data.
- Requires an explicit approval before each send.

## Local setup

Requires Node.js 22 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Required services

### Google Gmail sending

Create a Google Cloud project, enable the Gmail API, configure the OAuth consent screen, and create an OAuth 2.0 Client ID for a **Web application**.

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

AI Gateway and OpenAI are disabled unless `ENABLE_PAID_AI_FALLBACKS=true`, preventing accidental billing and quota noise. When intentionally enabled, `AI_MODEL` selects the Vercel provider/model identifier. Website research is compressed before generation and model output is capped at 1,200 tokens.

### Email analytics storage

Connect **Upstash for Redis** from the Vercel Marketplace. Vercel injects the REST URL and token automatically. Local development can use `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

## Environment variables

| Variable | Required | Visibility | Purpose |
| --- | --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Yes, for sending | Returned to the browser by `/api/config` | Google OAuth web client identifier |
| `AI_MODEL` | Optional | Server only | AI Gateway model; defaults to `openai/gpt-5.4` |
| `AI_GATEWAY_API_KEY` | Local alternative only | Secret, server only | Static Gateway authentication when OIDC is unavailable |
| `GEMINI_API_KEY` | Optional fallback | Secret, server only | Direct Gemini access, including eligible free-tier usage |
| `GEMINI_LOW_COST_MODEL` | Optional | Server only | First direct Gemini model; defaults to `gemini-3.5-flash-lite` |
| `GEMINI_MODELS` | Optional | Server only | Comma-separated direct Gemini fallback models; defaults to `gemini-2.5-flash-lite` |
| `GEMINI_MODEL` | Optional legacy fallback | Server only | Existing direct Gemini model appended after the low-cost choices |
| `OPENAI_API_KEY` | Optional fallback | Secret, server only | Direct OpenAI access outside Vercel |
| `OPENAI_MODEL` | Optional fallback | Server only | Direct OpenAI model; defaults to `gpt-5.4` |
| `ENABLE_PAID_AI_FALLBACKS` | Optional | Server only | Set to `true` only if AI Gateway/OpenAI billing fallbacks are intentionally enabled; defaults to disabled |
| `UPSTASH_REDIS_REST_URL` | Yes, for tracking | Secret, server only | Durable analytics storage URL |
| `UPSTASH_REDIS_REST_TOKEN` | Yes, for tracking | Secret, server only | Durable analytics storage token |

## Deploy to Vercel

```bash
npx vercel link
npx vercel env add GOOGLE_CLIENT_ID production
npx vercel --prod
```

After the first deployment, add the exact production origin to the Google OAuth Client ID, then redeploy if the domain changes.

## Safety and privacy

- Signal never stores a Gmail password.
- Gmail access tokens remain short-lived. A still-valid token is retained on this browser across reloads, refreshed shortly before expiry while the app is open, and reacquired silently on later visits when Google permits it. Disconnecting revokes the grant and clears the browser token and preference.
- The résumé is read for the selected send and is not persisted by the app.
- Company claims are restricted to readable content fetched from the supplied website.
- Sending is single-recipient and review-first.
- Analytics records are isolated by the verified connected Google email address and expire after one year.
- Messages sent to the same verified Google mailbox are stored as self-tests without a tracking pixel and are excluded from sent/open/open-rate metrics. Existing same-mailbox test records are also classified and excluded when analytics load.
- Open tracking is approximate: image proxies and security scanners may create loads, while image blocking may hide genuine reads. The UI describes events as observed loads rather than guaranteed human opens.
