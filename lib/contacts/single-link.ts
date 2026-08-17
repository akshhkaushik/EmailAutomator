import { generateFounderEmailCandidates, patternForEmail } from "./candidates.ts";
import type { FounderContact, FounderEmailFinder } from "./types.ts";

export async function findOneFounderEmail(input: {
  founderName: string;
  founderRole?: string;
  founderProfileUrl?: string | null;
  companyDomain: string;
  finder?: FounderEmailFinder;
}) {
  let candidates = generateFounderEmailCandidates(input.founderName, input.companyDomain);
  let result = null;
  if (input.finder?.verify) {
    for (const candidate of candidates.slice(0, 5)) {
      try {
        const verification = await input.finder.verify(candidate.email);
        candidates = candidates.map((item) => item.email === candidate.email ? {
          ...item, verificationStatus: verification.status, confidence: verification.score, verifiedAt: verification.verifiedAt,
        } : item);
        if (verification.status === "valid" || (verification.status === "accept_all" && verification.score >= 85)) {
          result = verification;
          break;
        }
      } catch {
        candidates = candidates.map((item) => item.email === candidate.email ? {
          ...item, verificationStatus: "unknown" as const, verifiedAt: new Date().toISOString(),
        } : item);
      }
    }
  } else if (input.finder) {
    result = await input.finder.find({ founderName: input.founderName, domain: input.companyDomain });
  }
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(), startupId: "single-link", founderName: input.founderName,
    founderRole: input.founderRole || "Founder", founderProfileUrl: input.founderProfileUrl || null,
    domain: input.companyDomain, email: result?.email || null,
    pattern: result?.email ? patternForEmail(result.email, candidates) : null, candidates,
    origin: result ? (result.sources.length > 0 ? "public" : "inferred") : "unresolved",
    verificationStatus: result?.status || "unverified", confidence: result?.score || 0,
    provider: result ? input.finder?.id || "local-patterns" : "local-patterns", sourceUrls: result?.sources || [],
    discoveredAt: now, verifiedAt: result?.verifiedAt || null, updatedAt: now,
  } satisfies FounderContact;
}
