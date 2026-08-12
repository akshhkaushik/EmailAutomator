export const EMAIL_VERIFICATION_STATUSES = ["valid", "accept_all", "unknown", "invalid", "unverified"] as const;
export type EmailVerificationStatus = typeof EMAIL_VERIFICATION_STATUSES[number];

export const EMAIL_EVIDENCE_KINDS = [
  "public_exact", "public_pattern", "mx_present", "mx_missing",
  "provider_valid", "provider_accept_all", "provider_invalid", "provider_unknown",
] as const;
export type EmailEvidenceKind = typeof EMAIL_EVIDENCE_KINDS[number];

export type EmailEvidence = {
  kind: EmailEvidenceKind;
  source: string;
  detail: string;
  scoreDelta: number;
  observedAt: string;
  url: string | null;
};

export type EmailCandidate = {
  email: string;
  pattern: string;
  rank: number;
  verificationStatus: EmailVerificationStatus;
  confidence: number;
  verifiedAt: string | null;
  evidence: EmailEvidence[];
  riskFlags: string[];
};

export type EmailSource = {
  url: string;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};

export type FounderContact = {
  id: string;
  startupId: string;
  founderName: string;
  founderRole: string;
  founderProfileUrl: string | null;
  domain: string;
  email: string | null;
  pattern: string | null;
  candidates: EmailCandidate[];
  origin: "public" | "inferred" | "unresolved";
  verificationStatus: EmailVerificationStatus;
  confidence: number;
  provider: string;
  sourceUrls: EmailSource[];
  discoveredAt: string;
  verifiedAt: string | null;
  updatedAt: string;
};

export type FounderContactLookup = {
  email: string | null;
  status: Exclude<EmailVerificationStatus, "unverified">;
  score: number;
  sources: EmailSource[];
  verifiedAt: string;
  provider?: string;
};

export interface FounderEmailFinder {
  readonly id: string;
  find(input: { founderName: string; domain: string }): Promise<FounderContactLookup | null>;
  verify?(email: string): Promise<FounderContactLookup>;
}

export type PublicEmailDocument = {
  sourceUrl: string;
  content: string;
  observedAt: string;
};

export type MailDomainInspection = {
  status: "present" | "missing" | "unknown";
  exchanges: string[];
  checkedAt: string;
};
