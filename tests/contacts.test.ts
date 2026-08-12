import test from "node:test";
import assert from "node:assert/strict";
import { generateFounderEmailCandidates, founderNameParts, patternForEmail } from "../lib/contacts/candidates.ts";
import { HunterEmailFinder } from "../lib/contacts/hunter.ts";
import { resolveFounderEmail } from "../lib/contacts/evidence-engine.ts";
import { InMemoryFounderContactRepository } from "../lib/contacts/memory-repository.ts";
import { canUseFounderContact, discoverFounderContacts } from "../lib/contacts/service.ts";
import { findOneFounderEmail } from "../lib/contacts/single-link.ts";
import { InMemoryDiscoveryRepository } from "../lib/discovery/memory-repository.ts";
import { InMemoryIntelligenceRepository } from "../lib/intelligence/memory-repository.ts";
import { buildStartupIntelligence } from "../lib/intelligence/build-intelligence.ts";
import type { Evidence } from "../lib/intelligence/types.ts";

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

const mailReady = async () => ({ status: "present" as const, exchanges: ["mx.example.com"], checkedAt: "2026-08-02T00:00:00.000Z" });

test("single-link founder lookup aggregates checks and selects the earliest safely deliverable candidate", async () => {
  const attempts: string[] = [];
  const contact = await findOneFounderEmail({ founderName: "Ada Lovelace", companyDomain: "example.com", inspectDomain: mailReady, finder: {
    id: "hunter", async find() { return null; }, async verify(email) {
      attempts.push(email);
      return { email, status: email === "ada.lovelace@example.com" ? "valid" : "invalid", score: email === "ada.lovelace@example.com" ? 98 : 0, sources: [], verifiedAt: "2026-08-02T00:00:00.000Z" };
    },
  } });
  assert.deepEqual(attempts, ["ada@example.com", "ada.lovelace@example.com", "adalovelace@example.com", "alovelace@example.com", "a.lovelace@example.com"]);
  assert.equal(contact.email, "ada.lovelace@example.com");
  assert.equal(contact.verificationStatus, "valid");
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
  const verified = await discoverFounderContacts({ startupId: startup.id, discoveryRepository, intelligenceRepository, contactRepository, inspectDomain: mailReady, finder: { id: "hunter", async find() { return null; }, async verify(email) { attempts.push(email); return { email, status: email === "ada.lovelace@example.com" ? "valid" : "invalid", score: email === "ada.lovelace@example.com" ? 98 : 0, sources: [], verifiedAt: "2026-08-02T00:00:00.000Z" }; } } });
  assert.equal(canUseFounderContact(verified[0]), true);
  assert.equal(verified[0].email, "ada.lovelace@example.com");
  assert.deepEqual(attempts, ["ada@example.com", "ada.lovelace@example.com", "adalovelace@example.com", "alovelace@example.com", "a.lovelace@example.com"]);
  assert.deepEqual(verified[0].candidates.slice(0, 2).map((candidate) => candidate.verificationStatus), ["invalid", "valid"]);
  assert.equal((await contactRepository.list(startup.id)).length, 1);
});

test("native evidence verifies an exact publicly published company address without Hunter", async () => {
  const result = await resolveFounderEmail({
    founderName: "Ada Lovelace", companyDomain: "example.com", inspectDomain: mailReady,
    documents: [{ sourceUrl: "https://example.com/team", content: "Ada Lovelace — Founder — ada.lovelace@example.com", observedAt: "2026-08-02T00:00:00.000Z" }],
  });
  assert.equal(result.result?.email, "ada.lovelace@example.com");
  assert.equal(result.result?.status, "valid");
  assert.equal(result.provider, "public-web");
  assert.ok(result.candidates[0].evidence.some((item) => item.kind === "public_exact") || result.candidates[1].evidence.some((item) => item.kind === "public_exact"));
});

test("patterns and MX records rank candidates but never unlock sending without mailbox evidence", async () => {
  const result = await resolveFounderEmail({
    founderName: "Ada Lovelace", companyDomain: "example.com", inspectDomain: mailReady,
    documents: [{ sourceUrl: "https://example.com/team", content: "Grace Hopper — CTO — grace.hopper@example.com", observedAt: "2026-08-02T00:00:00.000Z" }],
  });
  assert.equal(result.result, null);
  assert.equal(result.candidates[0].pattern, "first.last");
  assert.equal(result.candidates[0].verificationStatus, "unverified");
  assert.ok(result.candidates[0].confidence > 0);
});

test("missing MX blocks even an exact public address", async () => {
  const result = await resolveFounderEmail({
    founderName: "Ada Lovelace", companyDomain: "example.com",
    inspectDomain: async () => ({ status: "missing", exchanges: [], checkedAt: "2026-08-02T00:00:00.000Z" }),
    documents: [{ sourceUrl: "https://example.com/team", content: "ada.lovelace@example.com", observedAt: "2026-08-02T00:00:00.000Z" }],
  });
  assert.equal(result.result, null);
  assert.equal(result.candidates.find((item) => item.email === "ada.lovelace@example.com")?.verificationStatus, "invalid");
});

test("third-party pages cannot verify a mailbox even when they print an exact candidate", async () => {
  const result = await resolveFounderEmail({
    founderName: "Ada Lovelace", companyDomain: "example.com", inspectDomain: mailReady,
    documents: [{ sourceUrl: "https://directory.test/ada", content: "ada.lovelace@example.com", observedAt: "2026-08-02T00:00:00.000Z" }],
  });
  assert.equal(result.result, null);
  assert.equal(result.candidates.find((item) => item.email === "ada.lovelace@example.com")?.verificationStatus, "unverified");
});
