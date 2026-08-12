import { confidenceRank } from "./evidence-ledger.ts";
import { daysSince, normalizeFundingDate } from "./funding-date.ts";
import type { DeveloperResource, Evidence, EvidenceConfidence, Founder, FundingRound, IntelligenceField, JsonValue, StartupIntelligence, TeamObservation, TechnicalRole } from "./types.ts";

function recordValue(value: JsonValue) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, JsonValue> : null;
}

function best(evidence: Evidence[]) {
  return [...evidence].sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence) || b.observedAt.localeCompare(a.observedAt))[0];
}

function unknown<T>(): IntelligenceField<T> { return { value: "unknown", evidenceIds: [], confidence: "unknown" }; }

function scalar<T extends string | number>(evidence: Evidence[], claim: string, type: "string" | "number"): IntelligenceField<T> {
  const selected = best(evidence.filter((item) => item.claim === claim && typeof item.value === type));
  return selected ? { value: selected.value as T, evidenceIds: [selected.id], confidence: selected.confidence } : unknown<T>();
}

function arrayField<T>(values: Array<{ value: T; evidence: Evidence }>): IntelligenceField<T[]> {
  if (values.length === 0) return unknown<T[]>();
  return {
    value: values.map((item) => item.value),
    evidenceIds: [...new Set(values.map((item) => item.evidence.id))],
    confidence: values.reduce<EvidenceConfidence>((current, item) => confidenceRank(item.evidence.confidence) < confidenceRank(current) ? item.evidence.confidence : current, "high"),
  };
}

function fundingRoundFromEvidence(item: Evidence): FundingRound | null {
  const value = recordValue(item.value);
  if (!value) return null;
  const rawDate = typeof value.date === "string" ? value.date : "";
  const normalized = rawDate ? normalizeFundingDate(rawDate) : null;
  const declaredPrecision = value.datePrecision === "day" || value.datePrecision === "month" || value.datePrecision === "year" ? value.datePrecision : null;
  const investors = Array.isArray(value.investors) ? value.investors.filter((entry): entry is string => typeof entry === "string") : [];
  return {
    roundType: typeof value.roundType === "string" && value.roundType ? value.roundType : "unknown",
    amount: typeof value.amount === "string" && value.amount ? value.amount : "unknown",
    date: normalized?.date || "unknown",
    datePrecision: declaredPrecision || normalized?.precision || "unknown",
    investors: investors.length > 0 ? investors : "unknown",
  };
}

function buildFunding(evidence: Evidence[], now: Date) {
  const candidates = evidence.filter((item) => item.claim === "funding.round").flatMap((item) => {
    const round = fundingRoundFromEvidence(item);
    return round ? [{ evidence: item, round }] : [];
  });
  if (candidates.length === 0) return { latestRound: unknown<FundingRound>(), daysSinceLatestFunding: unknown<number>() };
  candidates.sort((a, b) => {
    const aDate = a.round.date === "unknown" ? "" : a.round.date;
    const bDate = b.round.date === "unknown" ? "" : b.round.date;
    return bDate.localeCompare(aDate) || confidenceRank(b.evidence.confidence) - confidenceRank(a.evidence.confidence);
  });
  const latest = candidates[0];
  const latestRound: IntelligenceField<FundingRound> = { value: latest.round, evidenceIds: [latest.evidence.id], confidence: latest.evidence.confidence };
  const elapsed = latest.round.date === "unknown" ? null : daysSince(latest.round.date, now);
  return {
    latestRound,
    daysSinceLatestFunding: elapsed === null ? unknown<number>() : { value: elapsed, evidenceIds: [latest.evidence.id], confidence: latest.evidence.confidence },
  };
}

function buildTeam(evidence: Evidence[]) {
  const latestBySource = new Map<string, TeamObservation>();
  for (const item of evidence.filter((candidate) => candidate.claim === "team.size")) {
    const value = recordValue(item.value);
    const count = value?.count;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 1) continue;
    const observation: TeamObservation = {
      count,
      label: typeof value?.label === "string" ? value.label : "team size observation",
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      observedAt: item.observedAt,
      confidence: item.confidence,
      evidenceId: item.id,
    };
    const key = `${item.sourceName}|${item.sourceUrl}`;
    const current = latestBySource.get(key);
    if (!current || current.observedAt < observation.observedAt) latestBySource.set(key, observation);
  }
  const observations = [...latestBySource.values()].sort((a, b) => a.count - b.count);
  if (observations.length === 0) return { observations, estimate: "unknown" as const };
  const min = observations[0].count;
  const max = observations[observations.length - 1].count;
  const confidence: EvidenceConfidence = observations.length >= 2 && max - min <= 2 ? "medium" : "low";
  return { observations, estimate: { min, max, label: "estimate" as const, evidenceIds: observations.map((item) => item.evidenceId), confidence } };
}

function buildFounders(evidence: Evidence[]) {
  const values = evidence.filter((item) => item.claim === "founder.person").flatMap((item) => {
    const value = recordValue(item.value);
    if (!value || typeof value.name !== "string" || !value.name.trim()) return [];
    const founder: Founder = {
      name: value.name,
      role: typeof value.role === "string" && value.role ? value.role : "unknown",
      profileUrl: typeof value.profileUrl === "string" && value.profileUrl ? value.profileUrl : "unknown",
    };
    return [{ value: founder, evidence: item }];
  });
  const seen = new Set<string>();
  return arrayField(values.filter(({ value }) => {
    const key = `${value.name.toLowerCase()}|${value.profileUrl}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }));
}

function stringList(evidence: Evidence[], claim: string) {
  const seen = new Set<string>();
  return arrayField(evidence.filter((item) => item.claim === claim && typeof item.value === "string").flatMap((item) => {
    const value = String(item.value).trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return [];
    seen.add(key); return [{ value, evidence: item }];
  }));
}

function developerResources(evidence: Evidence[]) {
  return arrayField<DeveloperResource>(evidence.filter((item) => item.claim === "product.developerInfo").flatMap((item) => {
    const value = recordValue(item.value);
    return value && typeof value.label === "string" && typeof value.url === "string"
      ? [{ value: { label: value.label, url: value.url }, evidence: item }] : [];
  }));
}

function technicalRoles(evidence: Evidence[]) {
  const seen = new Set<string>();
  return arrayField<TechnicalRole>(evidence.filter((item) => item.claim === "hiring.technicalRole").flatMap((item) => {
    const value = recordValue(item.value);
    if (!value || typeof value.title !== "string") return [];
    const key = value.title.toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key); return [{ value: { title: value.title }, evidence: item }];
  }));
}

export function buildStartupIntelligence(startupId: string, evidence: Evidence[], researchedAt = new Date().toISOString(), now = new Date()): StartupIntelligence {
  const roles = technicalRoles(evidence);
  const announcements = stringList(evidence, "hiring.announcement");
  const activityEvidenceIds = [...new Set([
    ...(roles.value === "unknown" ? [] : roles.evidenceIds),
    ...(announcements.value === "unknown" ? [] : announcements.evidenceIds),
  ])];
  return {
    startupId,
    company: {
      description: scalar(evidence, "company.description", "string"),
      industry: scalar(evidence, "company.industry", "string"),
      location: scalar(evidence, "company.location", "string"),
      foundedYear: scalar(evidence, "company.foundedYear", "number"),
    },
    funding: buildFunding(evidence, now),
    team: buildTeam(evidence),
    founders: buildFounders(evidence),
    product: {
      description: scalar(evidence, "product.description", "string"),
      category: scalar(evidence, "product.category", "string"),
      recentLaunches: stringList(evidence, "product.launch"),
      developerResources: developerResources(evidence),
    },
    hiring: {
      technicalRoles: roles,
      recentAnnouncements: announcements,
      engineeringActivity: activityEvidenceIds.length > 0 ? { value: "observed", evidenceIds: activityEvidenceIds, confidence: "medium" } : unknown<"observed">(),
    },
    evidenceIds: evidence.map((item) => item.id),
    lastResearchedAt: researchedAt,
    builtAt: new Date().toISOString(),
  };
}
