import type { DiscoveryRepository } from "../discovery/repository.ts";
import type { IntelligenceRepository } from "../intelligence/repository.ts";
import { opaqueId, structuredLog } from "../observability.ts";
import { resolveFounderEmail } from "./evidence-engine.ts";
import type { MailDomainInspector } from "./mail-domain.ts";
import type { FounderContactRepository } from "./repository.ts";
import type { FounderEmailFinder, FounderContact, PublicEmailDocument } from "./types.ts";

export async function discoverFounderContacts(input: {
  startupId: string;
  founderName?: string;
  discoveryRepository: DiscoveryRepository;
  intelligenceRepository: IntelligenceRepository;
  contactRepository: FounderContactRepository;
  finder?: FounderEmailFinder;
  finders?: FounderEmailFinder[];
  loadDocuments?: (urls: string[]) => Promise<PublicEmailDocument[]>;
  inspectDomain?: MailDomainInspector;
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

  const evidence = await input.intelligenceRepository.listEvidence(startup.id);
  const sourceUrls = [startup.website, ...startup.sourceUrls, ...evidence.map((item) => item.sourceUrl), ...founders.map((founder) => founder.profileUrl === "unknown" ? "" : founder.profileUrl)];
  const documents = input.loadDocuments ? await input.loadDocuments([...new Set(sourceUrls.filter(Boolean))]) : [];
  const finders = input.finders || (input.finder ? [input.finder] : []);

  const contacts: FounderContact[] = [];
  for (const founder of founders.slice(0, 5)) {
    const existing = (await input.contactRepository.list(startup.id)).find((item) => item.founderName.toLowerCase() === founder.name.toLowerCase());
    const resolution = await resolveFounderEmail({ founderName: founder.name, companyDomain: startup.domain, documents, finders, inspectDomain: input.inspectDomain });
    const { result, candidates } = resolution;
    const now = new Date().toISOString();
    const contact: FounderContact = {
      id: existing?.id || crypto.randomUUID(), startupId: startup.id, founderName: founder.name, founderRole: founder.role,
      founderProfileUrl: founder.profileUrl === "unknown" ? null : founder.profileUrl, domain: startup.domain,
      email: result?.email || null, pattern: resolution.pattern, candidates,
      origin: result ? (result.sources.length > 0 ? "public" : "inferred") : "unresolved",
      verificationStatus: result?.status || "unverified", confidence: result?.score || 0,
      provider: resolution.provider, sourceUrls: result?.sources || [],
      discoveredAt: existing?.discoveredAt || now, verifiedAt: result?.verifiedAt || null, updatedAt: now,
    };
    contacts.push(await input.contactRepository.upsert(contact));
    structuredLog("info", "founder_contact.discovered", { startupId: startup.id, contactId: opaqueId(contact.id), provider: contact.provider, status: contact.verificationStatus, origin: contact.origin });
  }
  return contacts;
}

export function canUseFounderContact(contact: FounderContact, now = Date.now()) {
  const verifiedAt = contact.verifiedAt ? Date.parse(contact.verifiedAt) : Number.NaN;
  const fresh = Number.isFinite(verifiedAt) && now - verifiedAt <= 90 * 24 * 60 * 60 * 1_000;
  return Boolean(contact.email) && fresh && (contact.verificationStatus === "valid" || (contact.verificationStatus === "accept_all" && contact.confidence >= 85));
}
