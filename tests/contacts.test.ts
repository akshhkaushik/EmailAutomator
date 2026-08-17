import test from "node:test";
import assert from "node:assert/strict";
import { generateFounderEmailCandidates, founderNameParts, patternForEmail } from "../lib/contacts/candidates.ts";
import { HunterEmailFinder } from "../lib/contacts/hunter.ts";
import { founderContactFromSentHistory } from "../lib/contacts/history.ts";
import { InMemoryFounderContactRepository } from "../lib/contacts/memory-repository.ts";
import { founderEmailProviderFromEnvironment } from "../lib/contacts/provider.ts";
import { canUseFounderContact, discoverFounderContacts } from "../lib/contacts/service.ts";
import { findOneFounderEmail } from "../lib/contacts/single-link.ts";
import { SnovEmailFinder } from "../lib/contacts/snov.ts";
import { InMemoryDiscoveryRepository } from "../lib/discovery/memory-repository.ts";
import { InMemoryIntelligenceRepository } from "../lib/intelligence/memory-repository.ts";
import { buildStartupIntelligence } from "../lib/intelligence/build-intelligence.ts";
import type { Evidence } from "../lib/intelligence/types.ts";
import type { TrackingRecord } from "../lib/tracking.ts";

test("generates deterministic deduplicated company-domain combinations", () => {
  assert.deepEqual(founderNameParts("Éva van Stone"), { first: "eva", last: "stone" });
  const candidates = generateFounderEmailCandidates("Ada Lovelace", "www.example.com");
  assert.equal(candidates[0].email, "ada@example.com");
  assert.equal(candidates[1].email, "ada.lovelace@example.com");
  assert.equal(candidates[2].email, "adalovelace@example.com");
  assert.equal(candidates[3].email, "alovelace@example.com");
  assert.ok(candidates.some((item) => item.email === "ada.lovelace@example.com"));
  assert.equal(new Set(candidates.map((item) => item.email)).size, candidates.length);
  assert.equal(patternForEmail("ada.lovelace@example.com", candidates), "first.last");
  assert.throws(() => generateFounderEmailCandidates("Ada", "example.com"), /full first and last name/);
});

test("single-link founder lookup stops at the first safely deliverable candidate", async () => {
  const attempts: string[] = [];
  const contact = await findOneFounderEmail({ founderName: "Ada Lovelace", companyDomain: "example.com", finder: {
    id: "hunter", async find() { return null; }, async verify(email) {
      attempts.push(email);
      return { email, status: email === "ada.lovelace@example.com" ? "valid" : "invalid", score: email === "ada.lovelace@example.com" ? 98 : 0, sources: [], verifiedAt: "2026-08-02T00:00:00.000Z" };
    },
  } });
  assert.deepEqual(attempts, ["ada@example.com", "ada.lovelace@example.com"]);
  assert.equal(contact.email, "ada.lovelace@example.com");
  assert.equal(contact.verificationStatus, "valid");
});

test("reuses an exact previously sent founder address without another provider lookup", () => {
  const sentAt = "2026-08-16T12:06:46.000Z";
  const record: TrackingRecord = {
    id: "5f3086b6-078d-4f44-b44e-9f0f7380b1cb", senderEmail: "aksh@example.com",
    recipientEmail: "catherine@kernel.sh", recipientName: "Catherine Jue", companyName: "Kernel",
    companyUrl: "https://www.kernel.sh/", subject: "Engineering at Kernel", gmailMessageId: "gmail-1",
    status: "sent", trackingEnabled: true, selfTest: false, sentAt, firstOpenedAt: null, lastOpenedAt: null,
    openCount: 0, opens: [], clickCount: 0, clicks: [], trackedLinks: [],
  };
  const contact = founderContactFromSentHistory({ records: [record], founderName: "Catherine Jue", companyDomain: "kernel.sh" });
  assert.equal(contact?.email, "catherine@kernel.sh");
  assert.equal(contact?.provider, "history");
  assert.equal(contact?.verificationStatus, "valid");
});

test("does not reuse history across a different founder or company domain", () => {
  const record = {
    id: "5f3086b6-078d-4f44-b44e-9f0f7380b1cb", senderEmail: "aksh@example.com",
    recipientEmail: "catherine@kernel.sh", recipientName: "Catherine Jue", companyName: "Kernel",
    companyUrl: "https://kernel.sh/", subject: "Engineering at Kernel", gmailMessageId: "gmail-1",
    status: "sent", trackingEnabled: true, selfTest: false, sentAt: "2026-08-16T12:06:46.000Z",
    firstOpenedAt: null, lastOpenedAt: null, openCount: 0, opens: [], clickCount: 0, clicks: [], trackedLinks: [],
  } satisfies TrackingRecord;
  assert.equal(founderContactFromSentHistory({ records: [record], founderName: "Another Founder", companyDomain: "kernel.sh" }), null);
  assert.equal(founderContactFromSentHistory({ records: [record], founderName: "Catherine Jue", companyDomain: "example.com" }), null);
});

test("maps Hunter verification and provenance without exposing the API key", async () => {
  const finder = new HunterEmailFinder("top-secret", async (input) => {
    const url = String(input);
    assert.match(url, /api_key=top-secret/);
    return new Response(JSON.stringify({ data: { email: "ada@example.com", score: 97, sources: [{ uri: "https://example.com/team", extracted_on: "2026-01-01", last_seen_on: "2026-07-01" }], verification: { date: "2026-08-01", status: "valid" } } }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const result = await finder.find({ founderName: "Ada Lovelace", domain: "example.com" });
  assert.equal(result?.status, "valid");
  assert.equal(result?.sources[0].url, "https://example.com/team");
});

test("uses Snov.io name-and-domain lookup and maps its SMTP status", async () => {
  const requests: Array<{ url: string; authorization: string; body: string }> = [];
  const responses = [
    new Response(JSON.stringify({ access_token: "short-lived-token", expires_in: 3600 }), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify({ data: { task_hash: "task-123" } }), { status: 200, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify({ status: "completed", data: [{ people: "Ada Lovelace", result: [{ email: "ada@example.com", smtp_status: "valid" }] }] }), { status: 200, headers: { "Content-Type": "application/json" } }),
  ];
  const finder = new SnovEmailFinder("client-id", "client-secret", async (input, init) => {
    requests.push({ url: String(input), authorization: new Headers(init?.headers).get("Authorization") || "", body: String(init?.body || "") });
    const response = responses.shift();
    assert.ok(response);
    return response;
  });
  const result = await finder.find({ founderName: "Ada Lovelace", domain: "example.com" });
  assert.equal(result?.email, "ada@example.com");
  assert.equal(result?.status, "valid");
  assert.equal(result?.score, 95);
  assert.match(requests[0].body, /client_id=client-id/);
  assert.match(requests[0].body, /client_secret=client-secret/);
  assert.doesNotMatch(requests[0].url, /client-secret/);
  assert.equal(requests[1].authorization, "Bearer short-lived-token");
  assert.equal(requests[2].authorization, "Bearer short-lived-token");
});

test("prefers Snov.io and keeps Hunter as a configuration fallback", () => {
  assert.equal(founderEmailProviderFromEnvironment({ SNOV_CLIENT_ID: "id", SNOV_CLIENT_SECRET: "secret", HUNTER_API_KEY: "hunter" })?.id, "snov");
  assert.equal(founderEmailProviderFromEnvironment({ SNOV_CLIENT_ID: "", SNOV_CLIENT_SECRET: "", HUNTER_API_KEY: "hunter" })?.id, "hunter");
  assert.equal(founderEmailProviderFromEnvironment({ SNOV_CLIENT_ID: "id", SNOV_CLIENT_SECRET: "", HUNTER_API_KEY: "" }), undefined);
});

test("contact discovery requires founder evidence and only safe verification is usable", async () => {
  const discoveryRepository = new InMemoryDiscoveryRepository();
  const intelligenceRepository = new InMemoryIntelligenceRepository();
  const contactRepository = new InMemoryFounderContactRepository();
  const accelerator = await discoveryRepository.createAccelerator({ name: "A", website: "https://a.test/", portfolioUrl: "https://a.test/portfolio", description: "", status: "active" });
  const { startup } = await discoveryRepository.upsertStartup({ discovered: { name: "Example", website: "https://example.com/", description: "", location: "", sourceUrl: accelerator.portfolioUrl, discoveredAt: "2026-08-01T00:00:00.000Z" }, acceleratorId: accelerator.id, cohortId: null, cohortName: null, discoverySource: "fixture" });
  await assert.rejects(() => discoverFounderContacts({ startupId: startup.id, discoveryRepository, intelligenceRepository, contactRepository }), /Research must identify/);
  const evidence: Evidence = { id: "founder-evidence", startupId: startup.id, category: "founder", claim: "founder.person", value: { name: "Ada Lovelace", role: "Founder", profileUrl: "https://example.com/team" }, sourceName: "Company", sourceUrl: "https://example.com/team", observedAt: "2026-08-01T00:00:00.000Z", confidence: "high", metadata: {} };
  await intelligenceRepository.upsertEvidence(startup.id, { ...evidence, metadata: evidence.metadata });
  await intelligenceRepository.saveIntelligence(buildStartupIntelligence(startup.id, [evidence]));
  const inferred = await discoverFounderContacts({ startupId: startup.id, discoveryRepository, intelligenceRepository, contactRepository });
  assert.equal(inferred[0].verificationStatus, "unverified");
  assert.equal(canUseFounderContact(inferred[0]), false);
  const attempts: string[] = [];
  const verified = await discoverFounderContacts({ startupId: startup.id, discoveryRepository, intelligenceRepository, contactRepository, finder: { id: "hunter", async find() { return null; }, async verify(email) { attempts.push(email); return { email, status: email === "ada.lovelace@example.com" ? "valid" : "invalid", score: email === "ada.lovelace@example.com" ? 98 : 0, sources: [], verifiedAt: "2026-08-02T00:00:00.000Z" }; } } });
  assert.equal(canUseFounderContact(verified[0]), true);
  assert.equal(verified[0].email, "ada.lovelace@example.com");
  assert.deepEqual(attempts, ["ada@example.com", "ada.lovelace@example.com", "adalovelace@example.com", "alovelace@example.com", "a.lovelace@example.com"]);
  assert.deepEqual(verified[0].candidates.slice(0, 2).map((candidate) => candidate.verificationStatus), ["invalid", "valid"]);
  assert.equal((await contactRepository.list(startup.id)).length, 1);
});
