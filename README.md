# Signal

Signal researches a company website, connects that research to your experience and projects, prepares a personalized job-outreach email, attaches your résumé, and sends through Gmail only after a final review.

## What it does

- Requires only a recipient work email to identify and research the company; a website override is available for personal email addresses or unusual domains.
- Uses a built-in, researched catalog of Aksh's 28 original GitHub project repositories and separates live, substantial, prototype, and learning evidence.
- Saves the required core email content and optional personal overrides in the browser.
- Selects up to two relevant projects without inventing titles, claims, ownership, maturity, or URLs.
- Embeds live-project and repository links under their proper project titles.
- Produces an editable subject and message.
- Appends Aksh's fixed BITS Pilani, GitHub, LinkedIn, portfolio, and email signature to every draft.
- Starts every email with Aksh's BITS Pilani introduction, includes fixed linked examples for CEO Voice Platform, Veritas, EvoComb, and GLOB, then adds only non-duplicate relevant work and a humble company-specific idea.
- Uses the consistent subject `I’d love to contribute to <Company>` and avoids decorative HTML, tracking, and bulk-send behavior.
- Requests only the Gmail `gmail.send` scope, keeps short-lived access tokens in browser memory, and remembers the connection preference so Google can reconnect automatically on the same browser.
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

On Vercel, enable **AI Gateway** for the project. Vercel automatically supplies `VERCEL_OIDC_TOKEN` to production deployments, so no OpenAI API key is required.

For local development, either:

1. Link the app to Vercel and run `vercel env pull .env.local` to receive a short-lived OIDC token, or
2. Set `AI_GATEWAY_API_KEY`, or
3. Set `GEMINI_API_KEY` to use Gemini's free tier fallback, or
4. Set `OPENAI_API_KEY` as a direct-provider fallback.

The model can be changed with `AI_MODEL`, using a Vercel provider/model identifier.
When multiple providers are configured, Signal tries AI Gateway, Gemini, and then OpenAI.

## Environment variables

| Variable | Required | Visibility | Purpose |
| --- | --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Yes, for sending | Returned to the browser by `/api/config` | Google OAuth web client identifier |
| `AI_MODEL` | Optional | Server only | AI Gateway model; defaults to `openai/gpt-5.4` |
| `AI_GATEWAY_API_KEY` | Local alternative only | Secret, server only | Static Gateway authentication when OIDC is unavailable |
| `GEMINI_API_KEY` | Optional fallback | Secret, server only | Direct Gemini access, including eligible free-tier usage |
| `GEMINI_MODEL` | Optional fallback | Server only | Direct Gemini model; defaults to `gemini-3.5-flash` |
| `OPENAI_API_KEY` | Optional fallback | Secret, server only | Direct OpenAI access outside Vercel |
| `OPENAI_MODEL` | Optional fallback | Server only | Direct OpenAI model; defaults to `gpt-5.4` |

## Deploy to Vercel

```bash
npx vercel link
npx vercel env add GOOGLE_CLIENT_ID production
npx vercel --prod
```

After the first deployment, add the exact production origin to the Google OAuth Client ID, then redeploy if the domain changes.

## Safety and privacy

- Signal never stores a Gmail password.
- Gmail access tokens remain short-lived, are refreshed silently while the app is open, and are reacquired automatically on later visits when the existing Google grant is still valid. Disconnecting revokes the grant and clears the browser preference.
- The résumé is read for the selected send and is not persisted by the app.
- Company claims are restricted to readable content fetched from the supplied website.
- Sending is single-recipient and review-first.
