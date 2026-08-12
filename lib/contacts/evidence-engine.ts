import { generateFounderEmailCandidates, patternForEmail } from "./candidates.ts";
import { inspectMailDomain, type MailDomainInspector } from "./mail-domain.ts";
import { observedEmailPatterns, publicSourcesForEmail } from "./public-evidence.ts";
import type { EmailCandidate, EmailEvidence, FounderContactLookup, FounderEmailFinder, PublicEmailDocument } from "./types.ts";

const safe = (lookup: FounderContactLookup) => lookup.status === "valid" || (lookup.status === "accept_all" && lookup.score >= 85);
const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export async function resolveFounderEmail(input: {
  founderName: string;
  companyDomain: string;
  documents?: PublicEmailDocument[];
  finders?: FounderEmailFinder[];
  inspectDomain?: MailDomainInspector;
}) {
  const checkedAt = new Date().toISOString();
  const documents = input.documents || [];
  const finders = input.finders || [];
  const domain = await (input.inspectDomain || inspectMailDomain)(input.companyDomain);
  const patternCounts = observedEmailPatterns(documents, input.companyDomain);
  let candidates = generateFounderEmailCandidates(input.founderName, input.companyDomain)
    .sort((left, right) => Number(publicSourcesForEmail(right.email, documents).length > 0) - Number(publicSourcesForEmail(left.email, documents).length > 0)
      || (patternCounts.get(right.pattern) || 0) - (patternCounts.get(left.pattern) || 0) || left.rank - right.rank)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

  const evaluations = await Promise.all(candidates.slice(0, 5).map(async (candidate) => {
    const evidence: EmailEvidence[] = [];
    const riskFlags: string[] = [];
    const publicSources = publicSourcesForEmail(candidate.email, documents);
    if (publicSources.length) evidence.push({ kind: "public_exact", source: "public-web", detail: "Exact company-domain address is published in public evidence.", scoreDelta: 100, observedAt: checkedAt, url: publicSources[0].url });
    const patternObservations = patternCounts.get(candidate.pattern) || 0;
    if (patternObservations) evidence.push({ kind: "public_pattern", source: "public-web", detail: `The ${candidate.pattern} format was observed ${patternObservations} time${patternObservations === 1 ? "" : "s"} near a public name/email pairing on this domain.`, scoreDelta: Math.min(40, 25 + patternObservations * 5), observedAt: checkedAt, url: null });
    if (domain.status === "present") evidence.push({ kind: "mx_present", source: "dns", detail: `Company domain publishes ${domain.exchanges.length} mail exchanger${domain.exchanges.length === 1 ? "" : "s"}.`, scoreDelta: 10, observedAt: domain.checkedAt, url: null });
    if (domain.status === "missing") {
      evidence.push({ kind: "mx_missing", source: "dns", detail: "Company domain does not publish a usable mail exchanger.", scoreDelta: -100, observedAt: domain.checkedAt, url: null });
      riskFlags.push("mail-domain-missing");
    } else if (domain.status === "unknown") riskFlags.push("mail-domain-unresolved");

    const providerResults = (await Promise.all(finders.filter((finder) => finder.verify).map(async (finder) => {
      try { return { finder, lookup: await finder.verify!(candidate.email) }; }
      catch { return { finder, lookup: null }; }
    }))).filter((result): result is { finder: FounderEmailFinder; lookup: FounderContactLookup } => Boolean(result.lookup));

    for (const { finder, lookup } of providerResults) {
      const kind = lookup.status === "valid" ? "provider_valid" : lookup.status === "accept_all" ? "provider_accept_all" : lookup.status === "invalid" ? "provider_invalid" : "provider_unknown";
      const delta = lookup.status === "valid" ? lookup.score : lookup.status === "accept_all" ? Math.min(75, lookup.score) : lookup.status === "invalid" ? -90 : 0;
      evidence.push({ kind, source: finder.id, detail: `${finder.id} reported ${lookup.status}${lookup.score ? ` with ${lookup.score}% confidence` : ""}.`, scoreDelta: delta, observedAt: lookup.verifiedAt, url: lookup.sources[0]?.url || null });
      if (lookup.status === "invalid") riskFlags.push(`${finder.id}-invalid`);
    }

    const exactPublic = publicSources.length > 0;
    const validProvider = providerResults.find(({ lookup }) => lookup.status === "valid");
    const acceptAllProvider = providerResults.find(({ lookup }) => lookup.status === "accept_all" && lookup.score >= 85);
    const invalidProviders = providerResults.filter(({ lookup }) => lookup.status === "invalid").length;
    let verificationStatus: EmailCandidate["verificationStatus"] = "unverified";
    let confidence = clamp(evidence.reduce((total, item) => total + item.scoreDelta, 0));
    if (domain.status === "missing") { verificationStatus = "invalid"; confidence = 0; }
    else if (exactPublic && domain.status === "present") { verificationStatus = "valid"; confidence = 100; }
    else if (validProvider && domain.status !== "unknown") { verificationStatus = "valid"; confidence = clamp(validProvider.lookup.score); }
    else if (acceptAllProvider && domain.status === "present") { verificationStatus = "accept_all"; confidence = clamp(acceptAllProvider.lookup.score); }
    else if (invalidProviders > 0 && invalidProviders === providerResults.length) { verificationStatus = "invalid"; confidence = 0; }
    else if (providerResults.length > 0 || domain.status === "unknown") verificationStatus = "unknown";
    return { ...candidate, verificationStatus, confidence, verifiedAt: checkedAt, evidence, riskFlags, publicSources, providerResults };
  }));

  candidates = candidates.map((candidate) => evaluations.find((item) => item.email === candidate.email) || candidate);
  const selected = evaluations.find((candidate) => safe({ email: candidate.email, status: candidate.verificationStatus === "unverified" ? "unknown" : candidate.verificationStatus, score: candidate.confidence, sources: candidate.publicSources, verifiedAt: candidate.verifiedAt || checkedAt }));
  const sourceUrls = selected?.publicSources.length
    ? selected.publicSources
    : selected?.providerResults.flatMap(({ lookup }) => lookup.sources) || [];
  const providers = [...new Set(selected?.evidence.map((item) => item.source).filter((source) => source !== "dns") || [])];
  return {
    candidates,
    result: selected ? {
      email: selected.email,
      status: selected.verificationStatus === "unverified" ? "unknown" : selected.verificationStatus,
      score: selected.confidence, sources: sourceUrls, verifiedAt: selected.verifiedAt || checkedAt,
    } satisfies FounderContactLookup : null,
    pattern: selected ? patternForEmail(selected.email, candidates) : null,
    provider: providers.length ? providers.join("+") : "native-evidence",
    domainStatus: domain.status,
  };
}
