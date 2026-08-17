export const EMAIL_VERIFICATION_STATUSES = ["valid", "accept_all", "unknown", "invalid", "unverified"] as const;
export type EmailVerificationStatus = typeof EMAIL_VERIFICATION_STATUSES[number];

export type EmailCandidate = {
  email: string;
  pattern: string;
  rank: number;
  verificationStatus: EmailVerificationStatus;
  confidence: number;
  verifiedAt: string | null;
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
  provider: "hunter" | "snov" | "local-patterns" | "history";
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
};

export interface FounderEmailFinder {
  readonly id: "hunter" | "snov";
  find(input: { founderName: string; domain: string }): Promise<FounderContactLookup | null>;
  verify?(email: string): Promise<FounderContactLookup>;
}
