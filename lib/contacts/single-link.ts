import { resolveFounderEmail } from "./evidence-engine.ts";
import type { MailDomainInspector } from "./mail-domain.ts";
import type { FounderContact, FounderEmailFinder, PublicEmailDocument } from "./types.ts";

export async function findOneFounderEmail(input: {
  founderName: string;
  founderRole?: string;
  founderProfileUrl?: string | null;
  companyDomain: string;
  finder?: FounderEmailFinder;
  finders?: FounderEmailFinder[];
  documents?: PublicEmailDocument[];
  inspectDomain?: MailDomainInspector;
}) {
  const resolution = await resolveFounderEmail({
    founderName: input.founderName, companyDomain: input.companyDomain, documents: input.documents,
    finders: input.finders || (input.finder ? [input.finder] : []), inspectDomain: input.inspectDomain,
  });
  const { result, candidates } = resolution;
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(), startupId: "single-link", founderName: input.founderName,
    founderRole: input.founderRole || "Founder", founderProfileUrl: input.founderProfileUrl || null,
    domain: input.companyDomain, email: result?.email || null,
    pattern: resolution.pattern, candidates,
    origin: result ? (result.sources.length > 0 ? "public" : "inferred") : "unresolved",
    verificationStatus: result?.status || "unverified", confidence: result?.score || 0,
    provider: resolution.provider, sourceUrls: result?.sources || [],
    discoveredAt: now, verifiedAt: result?.verifiedAt || null, updatedAt: now,
  } satisfies FounderContact;
}
