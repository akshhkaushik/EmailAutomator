import { normalizeDomain } from "../discovery/normalize.ts";
import type { TrackingRecord } from "../tracking.ts";
import type { FounderContact } from "./types.ts";

function normalizePersonName(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function emailDomain(value: string) {
  const parts = value.trim().toLowerCase().split("@");
  return parts.length === 2 ? normalizeDomain(parts[1]) : "";
}

export function founderContactFromSentHistory(input: {
  records: TrackingRecord[];
  founderName: string;
  founderRole?: string;
  founderProfileUrl?: string | null;
  companyDomain: string;
}) {
  const founderName = normalizePersonName(input.founderName);
  const companyDomain = normalizeDomain(input.companyDomain);
  if (!founderName || !companyDomain) return null;

  const record = input.records.find((item) => {
    if (item.status !== "sent" || !item.sentAt) return false;
    if (normalizePersonName(item.recipientName) !== founderName) return false;
    return normalizeDomain(item.companyUrl) === companyDomain && emailDomain(item.recipientEmail) === companyDomain;
  });
  if (!record?.sentAt) return null;

  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(), startupId: "single-link", founderName: input.founderName,
    founderRole: input.founderRole || "Founder", founderProfileUrl: input.founderProfileUrl || null,
    domain: companyDomain, email: record.recipientEmail.toLowerCase(), pattern: "stored-verified-address",
    candidates: [{
      email: record.recipientEmail.toLowerCase(), pattern: "stored-verified-address", rank: 1,
      verificationStatus: "valid", confidence: 95, verifiedAt: record.sentAt,
    }],
    origin: "inferred", verificationStatus: "valid", confidence: 95, provider: "history",
    sourceUrls: [{ url: record.companyUrl, firstSeenAt: record.sentAt, lastSeenAt: record.sentAt }],
    discoveredAt: record.sentAt, verifiedAt: record.sentAt, updatedAt: now,
  } satisfies FounderContact;
}
