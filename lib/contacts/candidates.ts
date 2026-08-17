import type { EmailCandidate } from "./types.ts";

function emailToken(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function founderNameParts(fullName: string) {
  const parts = fullName.trim().split(/\s+/).map(emailToken).filter(Boolean);
  if (parts.length < 2) throw new Error("A founder's full first and last name are required to infer a work email.");
  return { first: parts[0], last: parts[parts.length - 1] };
}

export function generateFounderEmailCandidates(fullName: string, domain: string): EmailCandidate[] {
  const { first, last } = founderNameParts(fullName);
  const host = domain.trim().toLowerCase().replace(/^www\./, "");
  if (!/^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) throw new Error("A valid company domain is required to infer founder email candidates.");
  const patterns: Array<[string, string]> = [
    ["first", first],
    ["first.last", `${first}.${last}`],
    ["firstlast", `${first}${last}`],
    ["first_initial_last", `${first[0]}${last}`],
    ["first_initial.last", `${first[0]}.${last}`],
    ["first.last_initial", `${first}.${last[0]}`],
    ["last.first", `${last}.${first}`],
    ["lastfirst", `${last}${first}`],
    ["last", last],
  ];
  return [...new Map(patterns.map(([pattern, local]) => [`${local}@${host}`, pattern])).entries()]
    .map(([email, pattern], index) => ({ email, pattern, rank: index + 1, verificationStatus: "unverified" as const, confidence: 0, verifiedAt: null }));
}

export function patternForEmail(email: string, candidates: EmailCandidate[]) {
  return candidates.find((candidate) => candidate.email.toLowerCase() === email.toLowerCase())?.pattern || "provider-inferred";
}
