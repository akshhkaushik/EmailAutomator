# Security Model

## Trust boundaries

The application has three explicit data classes:

1. **System instructions** are application-owned prompts and validation rules.
2. **Untrusted evidence** is any accelerator page, startup website, jobs page, founder content, README, search result, metadata, or user-supplied proof URL.
3. **Generated output** is an LLM draft that must pass structural and evidence validation before it can be reviewed or sent.

External text is always delimited as `UNTRUSTED_EVIDENCE`. Model instructions explicitly forbid following commands or role changes inside it. LLM output is constrained to JSON, bounded in size, and rejected or replaced with the local deterministic fallback when its structure or grounding is invalid. Intelligence extraction accepts a fact only when its supporting quotation exists in a retrieved document. Outreach validation additionally detects undeclared factual sentences and validates cited evidence IDs against the EvidenceLedger.

## Authentication and authorization

- Browser access uses the hosting platform's private-site identity where configured.
- API operations use a short-lived Google OAuth access token and verify its audience and verified email with Google.
- `DISCOVERY_OWNER_EMAIL` is the server-side allowlist for this personal workspace. In production it should always be set. It covers company research, discovery, intelligence, analytics, audited outreach, outcomes, and Gmail sending.
- Authorization is enforced in route handlers; UI state is never an authorization decision.
- OAuth tokens are not persisted server-side or in durable browser storage, and are never included in structured logs. The browser keeps the current short-lived token in `sessionStorage` only.
- The Google scope is limited to `openid`, `email`, and `gmail.send`.

## Public URL and SSRF controls

Public research accepts only HTTP(S). Before each request and redirect, hostnames are resolved and all returned addresses must be public. Loopback, private, link-local, carrier-grade NAT, multicast, and documentation ranges are rejected for IPv4 and IPv6. Redirects are manual and bounded. Portfolio discovery respects `robots.txt`.

Responses have timeouts, redirect limits, content-type checks, and byte limits. Discovery fetches one requested portfolio page plus `robots.txt`; startup research follows only a bounded set of same-origin product/jobs links. No scripts from retrieved pages are executed.

DNS validation reduces SSRF risk but is not a network egress firewall. Production infrastructure should also deny link-local metadata endpoints and private address ranges at the network layer where available.

## Email safety

- Gmail is invoked only by the explicit final review action.
- Sending is single-recipient; no bulk or autonomous sender exists.
- Header fields reject CR/LF characters and message/attachment sizes are bounded.
- Audited startup drafts are revalidated immediately before Gmail.
- A sent audited draft cannot be sent again.
- Every send has an idempotency identity. Identical legacy messages use a deterministic content fingerprint; audited messages use their draft ID. Completed responses are retained for seven days. An ambiguous timeout remains locked temporarily and tells the user to inspect Gmail Sent rather than retry blindly.
- Gmail requests are never automatically retried.
- Build-before-ask claims require a completed BuildSpec and user-provided GitHub, PR, or demo proof.

## Secrets and logs

Secrets belong only in `.env.local` or the hosting provider's encrypted environment configuration. `.env*` is ignored except `.env.example`. Never put OAuth access tokens, API keys, Redis tokens, résumé bytes, private email bodies, recipients, or subjects in logs.

Structured logs contain event names, timestamps, opaque actor hashes, safe record IDs, status, counts, durations, model identifiers, and error classes. The logger drops fields whose names indicate tokens, secrets, authorization, cookies, email content, subjects, bodies, or résumés.

## Browser security

Responses set a restrictive Content Security Policy plus clickjacking, MIME-sniffing, referrer, opener, and browser-permission headers. Google Identity is the only permitted third-party browser script/frame. Disconnecting Gmail revokes the grant and clears the cached browser token.

## Residual risks

- Open pixels are approximate and may be triggered by proxies or scanners.
- Lexical outreach validation is intentionally conservative; human review remains required.
- Public evidence can be false even when faithfully sourced. Provenance supports inspection but does not make a source authoritative.
- Redis is a single-owner store. Multi-user deployment would require tenant IDs in every key and query, not only an allowlist.
- A process crash after Gmail accepts a message but before result persistence creates an uncertain state. The temporary lock prevents an immediate duplicate; the operator must check Gmail Sent.

## Incident response

If a secret may be exposed, revoke or rotate it at the provider, remove it from runtime configuration, inspect structured logs for affected operation IDs, and redeploy. If Gmail behavior is suspicious, revoke the OAuth grant in Google Account security. See [OPERATIONS.md](./OPERATIONS.md) for runbooks.
