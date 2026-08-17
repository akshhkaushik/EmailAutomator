import type { DiscoveryRepository } from "../discovery/repository.ts";
import type { IntelligenceRepository } from "../intelligence/repository.ts";
import { opaqueId, structuredLog } from "../observability.ts";
import { generateFounderEmailCandidates, patternForEmail } from "./candidates.ts";
import type { FounderContactRepository } from "./repository.ts";
import type { FounderEmailFinder, FounderContact } from "./types.ts";

export async function discoverFounderContacts(input: {
  startupId: string;
  founderName?: string;
  discoveryRepository: DiscoveryRepository;
  intelligenceRepository: IntelligenceRepository;
  contactRepository: FounderContactRepository;
  finder?: FounderEmailFinder;
}) {
  const startup = await input.discoveryRepository.getStartup(input.startupId);
  if (!startup) throw new Error("Startup was not found.");
  if (!startup.domain) throw new Error("Startup needs a company domain before founder email discovery can run.");
  const intelligence = await input.intelligenceRepository.getIntelligence(input.startupId);
  if (!intelligence || intelligence.founders.value === "unknown" || intelligence.founders.value.length === 0) throw new Error("Research must identify at least one founder before email discovery can run.");
  const founders = input.founderName
    ? intelligence.founders.value.filter((founder) => founder.name.toLowerCase() === input.founderName?.toLowerCase())
    : intelligence.founders.value;
  if (founders.length === 0) throw new Error("The selected founder is not supported by startup evidence.");

  const contacts: FounderContact[] = [];
  for (const founder of founders.slice(0, 5)) {
    let candidates = generateFounderEmailCandidates(founder.name, startup.domain);
    const existing = (await input.contactRepository.list(startup.id)).find((item) => item.founderName.toLowerCase() === founder.name.toLowerCase());
    let result = null;
    if (input.finder?.verify) {
      const attempts = await Promise.all(candidates.slice(0, 5).map(async (candidate) => {
        try { return await input.finder?.verify?.(candidate.email) || null; }
        catch { return { email: candidate.email, status: "unknown" as const, score: 0, sources: [], verifiedAt: new Date().toISOString() }; }
      }));
      candidates = candidates.map((item, index) => {
        const verification = attempts[index];
        return verification ? { ...item, verificationStatus: verification.status, confidence: verification.score, verifiedAt: verification.verifiedAt } : item;
      });
      result = attempts.find((verification) => verification && (verification.status === "valid" || (verification.status === "accept_all" && verification.score >= 85))) || null;
    } else if (input.finder) {
      result = await input.finder.find({ founderName: founder.name, domain: startup.domain });
    }
    const now = new Date().toISOString();
    const contact: FounderContact = {
      id: existing?.id || crypto.randomUUID(), startupId: startup.id, founderName: founder.name, founderRole: founder.role,
      founderProfileUrl: founder.profileUrl === "unknown" ? null : founder.profileUrl, domain: startup.domain,
      email: result?.email || null, pattern: result?.email ? patternForEmail(result.email, candidates) : null, candidates,
      origin: result ? (result.sources.length > 0 ? "public" : "inferred") : "unresolved",
      verificationStatus: result?.status || "unverified", confidence: result?.score || 0,
      provider: result ? input.finder?.id || "local-patterns" : "local-patterns", sourceUrls: result?.sources || [],
      discoveredAt: existing?.discoveredAt || now, verifiedAt: result?.verifiedAt || null, updatedAt: now,
    };
    contacts.push(await input.contactRepository.upsert(contact));
    structuredLog("info", "founder_contact.discovered", { startupId: startup.id, contactId: opaqueId(contact.id), provider: contact.provider, status: contact.verificationStatus, origin: contact.origin });
  }
  return contacts;
}

export function canUseFounderContact(contact: FounderContact) {
  return Boolean(contact.email) && (contact.verificationStatus === "valid" || (contact.verificationStatus === "accept_all" && contact.confidence >= 85));
}
