# Startup Discovery

## Scope

Phase 1 adds a bounded pipeline:

```text
Accelerator → optional Cohort → public portfolio page → normalized startups → persisted provenance
```

It does not perform startup intelligence, funding/founder research, scoring, project matching, contribution generation, or outreach. Discovery has no dependency on the Gmail send route and cannot send email.

## Architecture

The feature is an additive module inside the existing Next.js application:

- `lib/discovery/types.ts`: Accelerator, Cohort, Startup, provenance, adapter, and result contracts.
- `lib/discovery/validation.ts`: API input/query validation.
- `lib/discovery/normalize.ts`: URL/domain/name normalization and discovery-level deduplication.
- `lib/discovery/http.ts`: public-destination validation, DNS checks, robots policy, redirects, timeouts, and bounded HTML reads.
- `lib/discovery/public-portfolio-source.ts`: fixture-testable public portfolio/cohort parser and the first discovery adapter.
- `lib/discovery/service.ts`: accelerator/cohort resolution and adapter-to-persistence orchestration.
- `lib/discovery/repository.ts`: persistence contract and conservative merge behavior.
- `lib/discovery/redis-repository.ts`: durable adapter using the application's existing Upstash Redis connection.
- `lib/discovery/memory-repository.ts`: contract-compatible deterministic test repository; it is not used as production persistence.
- `app/discovery-view.tsx`: accelerator/cohort management, discovery controls, filters, and source inspection.

The existing Compose, Gmail send, and Analytics code paths remain separate.

## Data model

### Accelerator

`id`, `name`, `website`, `portfolioUrl`, `description`, `status` (`active` or `paused`), `createdAt`, and `updatedAt`.

### Cohort

`id`, `acceleratorId`, `name`, optional `year`, `portfolioUrl`, `source`, `createdAt`, and `updatedAt`.

### Startup

`id`, `name`, optional `website`, normalized optional `domain`, optional `description`, primary `acceleratorId` and optional `cohortId`, optional `location`, `sourceUrls`, `provenance`, `discoveryStatus`, `createdAt`, and `updatedAt`.

The accelerator/cohort fields identify the first persisted observation for compatibility with the requested minimum shape. All observations, including later discoveries through another accelerator or cohort, are retained in `provenance` and used by filters.

### Startup provenance

Each observation records:

- adapter ID (`discoverySource`)
- exact portfolio/cohort `sourceUrl`
- `discoveredAt`
- `acceleratorId`
- optional `cohortId`
- optional cohort name snapshot

No funding, founder, team, or product facts are added by Phase 1. Description and location are saved only when explicitly present in parsed page data.

## Discovery flow

1. A verified Google user creates an accelerator with its public website and portfolio URL.
2. The user may create a cohort with its own portfolio URL. Cohorts must belong to an existing accelerator.
3. The user explicitly starts discovery for either the accelerator portfolio or one cohort.
4. `runDiscovery` verifies the accelerator is active and the cohort relationship is valid.
5. `PublicPortfolioPageSource` requests exactly the configured source page.
6. The HTTP boundary validates the URL and every redirect, resolves the hostname, rejects internal/reserved destinations, checks `robots.txt`, limits redirects/time/body size, and accepts HTML only.
7. The parser reads JSON-LD and recognizable portfolio/card/link markup as data. Scripts are never executed. Malformed JSON-LD and incomplete markup are ignored.
8. Parsed entries are normalized and deduplicated.
9. The repository upserts by identity and appends unique provenance.
10. The API returns created/updated counts and the stored startups. The dashboard refreshes its filterable directory.

Each run is capped at one source page and 500 parsed entries. There is no recursive crawl, linked-page research, or scheduled background discovery in this phase.

## Adapter system

Adapters implement the contract in `lib/discovery/types.ts`:

```ts
interface StartupDiscoverySource {
  readonly id: string;
  discover(input: DiscoveryInput): Promise<DiscoveredStartup[]>;
}
```

`DiscoveryInput` includes the persisted accelerator, optional cohort, and selected source URL. `DiscoveredStartup` contains only page-extracted name, website, description, location, source URL, and discovery time.

The first adapter, `PublicPortfolioPageSource`, accepts an injected page fetcher. Production uses the guarded network fetcher; tests use local fixtures/mocked HTML and make no live website requests. Future accelerator-specific adapters can implement the same interface without changing APIs, persistence, or the dashboard.

## Extraction behavior

The generic parser supports:

- JSON-LD organizations and item lists.
- `<article>` and marked startup/company/portfolio/card/member/batch blocks.
- marked list/div entries.
- named external website links.
- entries with a name but no website.
- HTML entity decoding and whitespace cleanup.

It excludes same-origin navigation links and common social/utility domains. A generic website label is not treated as a startup name; when a card has a website but no explicit name, the domain label is used as a transparent fallback identifier.

## Deduplication

`normalizeDomain` converts equivalent website inputs such as:

```text
https://www.example.com/path
http://example.com/
example.com
```

to `example.com`.

Identity rules:

1. A normalized domain is the strongest identity key and merges observations even when displayed names differ.
2. Without a website/domain, duplicate names are merged only when they occur on the same source URL.
3. Same-name, no-domain entries from different source pages remain separate. The system never globally merges by name alone.

Merges are conservative: existing non-empty descriptive fields are retained, source URLs are unioned, and each distinct accelerator/cohort/source observation is appended to provenance.

## Persistence

Production persistence uses the already-installed Upstash Redis client and existing configuration variables:

- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
- or the existing `KV_REST_API_URL` / `KV_REST_API_TOKEN` aliases

Records and indexes use a `signal:discovery:*` namespace. Startup identity lookup keys store a SHA-256 hash of the domain/source identity rather than embedding source URLs in Redis keys. Records do not use the one-year outreach tracking TTL.

Persistence is behind `DiscoveryRepository`, so a later relational adapter can replace Redis without changing discovery adapters or route contracts. Redis was retained in Phase 1 to avoid changing the repository's deployment/storage architecture while delivering the first subsystem.

## API boundaries

All endpoints require the existing verified Google Bearer identity. If `DISCOVERY_OWNER_EMAIL` is configured, that email is also enforced as a personal-account allowlist.

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/accelerators` | GET | List accelerators |
| `/api/accelerators` | POST | Create an accelerator |
| `/api/cohorts` | GET | List cohorts, optionally by accelerator |
| `/api/cohorts` | POST | Create/import a cohort |
| `/api/discovery` | POST | Run the public-page adapter for an accelerator/cohort |
| `/api/startups` | GET | List startups, optionally by accelerator/cohort |
| `/api/startups/[id]` | GET | Retrieve one startup with full provenance |

Responses are private/no-store. Validation rejects malformed bodies, IDs, years, unsupported URL schemes, credentials in URLs, and non-public host shapes.

## Security and responsible fetching

- Only user-configured HTTP(S) source pages are fetched.
- DNS results must all be public; literal and resolved loopback, private, link-local, metadata, documentation, multicast, and reserved ranges are rejected.
- Redirect destinations receive the same validation.
- `robots.txt` is checked for the discovery user agent before the page request; a disallow rule stops discovery.
- The adapter fetches one page, follows at most three redirects, waits at most ten seconds for the page, and reads at most 1 MB of HTML.
- Robots responses are capped at 128 KB and five seconds.
- Page content is parsed as inert text/JSON and is never executed.
- Discovery APIs require verified identity; optional owner allowlisting prevents other OAuth users from managing the personal dataset.
- Discovery execution is limited to five runs per verified account per minute.
- No secrets are returned to the browser or stored in discovery records.

The user remains responsible for confirming that a configured page's applicable website terms allow this limited use. Robots permission is a technical control, not a legal determination.

## Tests

Fixture-based Node tests cover:

- domain and website normalization
- domain-first and missing-domain deduplication
- JSON-LD/card/link adapter parsing
- malformed HTML/JSON-LD
- missing websites
- duplicate portfolio entries
- injected/mocked page fetching
- private/reserved IP rejection and DNS results
- robots rules
- API input and filter validation
- accelerator/cohort/startup persistence, retrieval, filters, merging, and provenance

Tests do not access live accelerator websites.

## Limitations

- Generic HTML heuristics cannot recognize every portfolio design, client-rendered page, or pagination scheme. Pages that do not expose recognizable server-rendered entries return zero startups rather than fabricated results.
- Discovery reads one page only. Pagination, feeds, and accelerator-specific APIs require future adapters.
- No Jina/browser rendering fallback is used in Phase 1; blocked or JavaScript-only pages fail safely.
- Robots parsing supports conventional user-agent, allow, and disallow prefix rules; it is not a full RFC wildcard/sitemap parser.
- Redis provides durable records and filters but is not the intended long-term relational intelligence store described in the architecture audit.
- Identity reservation is atomic, but a simultaneous update to the same startup record remains last-write-wins. Normal personal use is sequential.
- There are no update/delete/merge-review APIs yet because Phase 1 only requires creation, discovery, listing, and retrieval.
- Descriptions and locations are not independently verified; they are retained only as portfolio-page claims with provenance.

## Next phase

The exact next recommended phase is **Phase 2 — Startup Intelligence**: add immutable research runs and source-linked evidence, then extract typed, refreshable public signals. Do not add scoring or outreach integration until evidence provenance and freshness are in place.
