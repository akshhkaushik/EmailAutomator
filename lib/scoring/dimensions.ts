import type { Evidence, EvidenceConfidence, IntelligenceField, StartupIntelligence } from "../intelligence/types.ts";
import { conceptLabel, extractCapabilityConcepts } from "./concepts.ts";
import type { CapabilityProject, DimensionScore, OpportunityScoringConfig, ProjectMatch, ScoreDimension } from "./types.ts";

const LABELS: Record<ScoreDimension, string> = {
  fundingMomentum: "Funding momentum",
  teamLeverage: "Team-size leverage",
  technicalFit: "Product / technical fit",
  founderAccessibility: "Founder accessibility",
  hiringSignal: "Hiring signal",
  contributionPotential: "Contribution opportunity potential",
  companyMomentum: "Recent company momentum",
};

function clamp(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }
function roundedPoint(value: number) { return Math.round(value * 10) / 10; }
function confidenceValue(value: EvidenceConfidence | "unknown") {
  return value === "high" ? 100 : value === "medium" ? 65 : value === "low" ? 35 : 0;
}
function unique(values: string[]) { return [...new Set(values)]; }
function knownEvidence(ids: string[], evidenceById: Map<string, Evidence>) { return unique(ids).filter((id) => evidenceById.has(id)); }

function factor(
  dimension: ScoreDimension,
  score: number,
  confidence: number,
  reason: string,
  evidenceIds: string[],
  config: OpportunityScoringConfig,
  projectMatches: ProjectMatch[] = [],
): DimensionScore {
  const normalized = clamp(score);
  const maxPoints = config.weights[dimension];
  return {
    dimension,
    label: LABELS[dimension],
    score: normalized,
    confidence: clamp(confidence),
    earnedPoints: roundedPoint(normalized * maxPoints / 100),
    maxPoints,
    reason,
    evidenceIds,
    projectMatches,
  };
}

export function scoreFundingMomentum(intelligence: StartupIntelligence, evidenceById: Map<string, Evidence>, config: OpportunityScoringConfig) {
  const days = intelligence.funding.daysSinceLatestFunding;
  const round = intelligence.funding.latestRound;
  if (typeof days.value !== "number" || round.value === "unknown") {
    return factor("fundingMomentum", 0, 0, "No dated funding evidence is available; funding momentum is unknown.", [], config);
  }
  if (days.value < 0) {
    return factor("fundingMomentum", 0, 0, "The sourced funding date is in the future, so funding momentum cannot be evaluated.", knownEvidence(round.evidenceIds, evidenceById), config);
  }
  const dayCount = days.value;
  const band = config.fundingDayBands.find((candidate) => candidate.maxDays === null || dayCount <= candidate.maxDays);
  if (!band) throw new Error("Funding scoring configuration has no terminal band.");
  const precisionMultiplier = round.value.datePrecision === "day" ? 1 : round.value.datePrecision === "month" ? 0.85 : round.value.datePrecision === "year" ? 0.6 : 0.45;
  const confidence = confidenceValue(days.confidence) * precisionMultiplier;
  const details = [round.value.roundType, round.value.amount].filter((value) => value !== "unknown").join(" · ");
  return factor(
    "fundingMomentum",
    band.score,
    confidence,
    `${details || "Funding round"} detected ${dayCount} day${dayCount === 1 ? "" : "s"} ago (${band.label}); ${round.value.datePrecision} date precision.`,
    knownEvidence(unique([...days.evidenceIds, ...round.evidenceIds]), evidenceById),
    config,
  );
}

function teamScoreAt(size: number, config: OpportunityScoringConfig) {
  return config.teamBands.find((band) => size >= band.min && (band.max === null || size <= band.max))?.score ?? 0;
}

function averageTeamRangeScore(min: number, max: number, config: OpportunityScoringConfig) {
  if (min === max) return teamScoreAt(min, config);
  let total = 0;
  let covered = 0;
  for (const band of config.teamBands) {
    const start = Math.max(min, band.min);
    const end = Math.min(max, band.max ?? max);
    if (start > end) continue;
    const count = end - start + 1;
    total += count * band.score;
    covered += count;
  }
  return covered > 0 ? total / covered : 0;
}

export function scoreTeamLeverage(intelligence: StartupIntelligence, evidenceById: Map<string, Evidence>, config: OpportunityScoringConfig) {
  const estimate = intelligence.team.estimate;
  if (estimate === "unknown") return factor("teamLeverage", 0, 0, "No sourced team-size observation is available; team leverage is unknown.", [], config);
  const score = averageTeamRangeScore(estimate.min, estimate.max, config);
  const midpoint = (estimate.min + estimate.max) / 2;
  const relativeWidth = midpoint > 0 ? (estimate.max - estimate.min) / midpoint : 1;
  const uncertaintyMultiplier = Math.max(0.35, 1 - Math.min(0.65, relativeWidth));
  const sourceConfidence = intelligence.team.observations.length > 0
    ? intelligence.team.observations.reduce((sum, item) => sum + confidenceValue(item.confidence), 0) / intelligence.team.observations.length
    : confidenceValue(estimate.confidence);
  const confidence = Math.min(confidenceValue(estimate.confidence), sourceConfidence) * uncertaintyMultiplier;
  const range = estimate.min === estimate.max ? String(estimate.min) : `${estimate.min}–${estimate.max}`;
  const conflict = estimate.max > estimate.min ? ` The ${intelligence.team.observations.length} source observations conflict, so confidence is reduced.` : "";
  return factor("teamLeverage", score, confidence, `Estimated team size is ${range}; team size is treated as a soft signal.${conflict}`, knownEvidence(estimate.evidenceIds, evidenceById), config);
}

type FitAnalysis = { score: number; confidence: number; reason: string; evidenceIds: string[]; projectMatches: ProjectMatch[]; startupConcepts: string[] };

function fieldText<T>(field: IntelligenceField<T>, render: (value: T) => string) {
  return field.value === "unknown" ? [] : [{ text: render(field.value), evidenceIds: field.evidenceIds, confidence: field.confidence }];
}

export function analyzeTechnicalFit(intelligence: StartupIntelligence, evidenceById: Map<string, Evidence>, projects: CapabilityProject[]): FitAnalysis {
  const fields = [
    ...fieldText(intelligence.company.description, String),
    ...fieldText(intelligence.company.industry, String),
    ...fieldText(intelligence.product.description, String),
    ...fieldText(intelligence.product.category, String),
    ...fieldText(intelligence.product.developerResources, (resources) => resources.map((item) => item.label).join(" ")),
  ];
  const evidenceIds = knownEvidence(fields.flatMap((field) => field.evidenceIds), evidenceById);
  if (fields.length === 0) return { score: 0, confidence: 0, reason: "No product or technical evidence is available; fit is unknown.", evidenceIds, projectMatches: [], startupConcepts: [] };
  const startupConcepts = extractCapabilityConcepts(fields.map((field) => field.text));
  const maturityRank: Record<CapabilityProject["maturity"], number> = { live: 4, substantial: 3, prototype: 2, learning: 1 };
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const matches = projects.flatMap((project) => {
    const projectConcepts = new Set(extractCapabilityConcepts([
      project.description,
      ...project.technologies,
      ...project.problemDomains,
      ...project.capabilitiesDemonstrated,
    ]));
    const matchedConcepts = startupConcepts.filter((concept) => projectConcepts.has(concept));
    return matchedConcepts.length === 0 ? [] : [{
      projectId: project.id,
      projectName: project.name,
      matchedConcepts,
      repositoryUrl: project.repositoryUrl,
      demoUrl: project.demoUrl,
    }];
  }).sort((a, b) => b.matchedConcepts.length - a.matchedConcepts.length
    || maturityRank[projectById.get(b.projectId)?.maturity || "learning"] - maturityRank[projectById.get(a.projectId)?.maturity || "learning"]
    || a.projectName.localeCompare(b.projectName));
  const bestCount = matches[0]?.matchedConcepts.length || 0;
  const score = bestCount === 0 ? 0 : bestCount === 1 ? 35 : bestCount === 2 ? 65 : bestCount === 3 ? 85 : 100;
  const sourceConfidence = fields.reduce((sum, field) => sum + confidenceValue(field.confidence), 0) / fields.length;
  const conceptCoverage = startupConcepts.length === 0 ? 0.65 : Math.min(1, 0.55 + startupConcepts.length * 0.12);
  const topMatches = matches.slice(0, 3);
  const reason = bestCount === 0
    ? "Sourced product information has no overlap with the configured capability taxonomy."
    : `${topMatches[0].projectName} overlaps on ${topMatches[0].matchedConcepts.map(conceptLabel).join(", ")}.`;
  return { score, confidence: sourceConfidence * conceptCoverage, reason, evidenceIds, projectMatches: topMatches, startupConcepts };
}

export function scoreTechnicalFit(intelligence: StartupIntelligence, evidenceById: Map<string, Evidence>, projects: CapabilityProject[], config: OpportunityScoringConfig) {
  const analysis = analyzeTechnicalFit(intelligence, evidenceById, projects);
  return factor("technicalFit", analysis.score, analysis.confidence, analysis.reason, analysis.evidenceIds, config, analysis.projectMatches);
}

export function scoreFounderAccessibility(intelligence: StartupIntelligence, evidenceById: Map<string, Evidence>, config: OpportunityScoringConfig) {
  const founders = intelligence.founders;
  if (founders.value === "unknown") return factor("founderAccessibility", 0, 0, "No sourced founder information is available; accessibility is unknown.", [], config);
  const publicProfiles = founders.value.filter((founder) => founder.profileUrl !== "unknown").length;
  const technicalFounders = founders.value.filter((founder) => founder.role !== "unknown" && /\b(cto|technical|engineer|engineering|developer)\b/i.test(founder.role)).length;
  const profileRatio = founders.value.length > 0 ? publicProfiles / founders.value.length : 0;
  const score = 35 + profileRatio * 45 + (technicalFounders > 0 ? 20 : 0);
  const reason = `${founders.value.length} founder${founders.value.length === 1 ? "" : "s"} identified; ${publicProfiles} public profile${publicProfiles === 1 ? "" : "s"}${technicalFounders > 0 ? ` and ${technicalFounders} explicitly technical role${technicalFounders === 1 ? "" : "s"}` : ""}. Public activity is not inferred.`;
  return factor("founderAccessibility", score, confidenceValue(founders.confidence), reason, knownEvidence(founders.evidenceIds, evidenceById), config);
}

export function scoreHiringSignal(intelligence: StartupIntelligence, evidenceById: Map<string, Evidence>, config: OpportunityScoringConfig) {
  const roles = intelligence.hiring.technicalRoles;
  const announcements = intelligence.hiring.recentAnnouncements;
  const roleCount = roles.value === "unknown" ? 0 : roles.value.length;
  const announcementCount = announcements.value === "unknown" ? 0 : announcements.value.length;
  if (roleCount === 0 && announcementCount === 0) return factor("hiringSignal", 0, 0, "No public technical hiring evidence was found; hiring is unknown.", [], config);
  const score = roleCount > 0 ? Math.min(100, 75 + roleCount * 5) : 60;
  const confidence = Math.max(confidenceValue(roles.confidence), confidenceValue(announcements.confidence));
  const ids = knownEvidence([...(roles.value === "unknown" ? [] : roles.evidenceIds), ...(announcements.value === "unknown" ? [] : announcements.evidenceIds)], evidenceById);
  return factor("hiringSignal", score, confidence, `${roleCount} open technical role${roleCount === 1 ? "" : "s"} and ${announcementCount} recent hiring announcement${announcementCount === 1 ? "" : "s"} were evidenced.`, ids, config);
}

export function scoreContributionPotential(intelligence: StartupIntelligence, evidenceById: Map<string, Evidence>, projects: CapabilityProject[], config: OpportunityScoringConfig) {
  const fit = analyzeTechnicalFit(intelligence, evidenceById, projects);
  const developerInfo = intelligence.product.developerResources;
  const roles = intelligence.hiring.technicalRoles;
  const launches = intelligence.product.recentLaunches;
  const hasDeveloperInfo = developerInfo.value !== "unknown" && developerInfo.value.length > 0;
  const hasRoles = roles.value !== "unknown" && roles.value.length > 0;
  const hasLaunches = launches.value !== "unknown" && launches.value.length > 0;
  if (fit.score === 0 && !hasDeveloperInfo && !hasRoles && !hasLaunches) {
    return factor("contributionPotential", 0, fit.confidence, "Evidence does not yet suggest a concrete contribution surface. This is not a contribution proposal.", fit.evidenceIds, config);
  }
  const score = fit.score * 0.7 + (hasDeveloperInfo ? 15 : 0) + (hasRoles ? 10 : 0) + (hasLaunches ? 5 : 0);
  const signalFields = [hasDeveloperInfo ? developerInfo : null, hasRoles ? roles : null, hasLaunches ? launches : null].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const signalConfidence = signalFields.length > 0 ? signalFields.reduce((sum, item) => sum + confidenceValue(item.confidence), 0) / signalFields.length : fit.confidence;
  const confidence = fit.confidence === 0 ? signalConfidence * 0.6 : (fit.confidence * 0.7 + signalConfidence * 0.3);
  const signals = [hasDeveloperInfo ? "public developer information" : "", hasRoles ? "technical hiring" : "", hasLaunches ? "a recent product launch" : ""].filter(Boolean);
  const reason = `${fit.projectMatches[0] ? `Capability overlap with ${fit.projectMatches[0].projectName}` : "A public technical surface"}${signals.length ? ` plus ${signals.join(", ")}` : ""} suggests an area worth investigating; no contribution is proposed yet.`;
  const ids = knownEvidence(unique([...fit.evidenceIds, ...signalFields.flatMap((item) => item.evidenceIds)]), evidenceById);
  return factor("contributionPotential", score, confidence, reason, ids, config, fit.projectMatches);
}

export function scoreCompanyMomentum(intelligence: StartupIntelligence, evidenceById: Map<string, Evidence>, config: OpportunityScoringConfig) {
  const launches = intelligence.product.recentLaunches;
  const announcements = intelligence.hiring.recentAnnouncements;
  const roles = intelligence.hiring.technicalRoles;
  const hasLaunch = launches.value !== "unknown" && launches.value.length > 0;
  const hasAnnouncement = announcements.value !== "unknown" && announcements.value.length > 0;
  const hasRoles = roles.value !== "unknown" && roles.value.length > 0;
  if (!hasLaunch && !hasAnnouncement && !hasRoles) return factor("companyMomentum", 0, 0, "No explicit recent launch or hiring activity was evidenced; company momentum is unknown.", [], config);
  const score = hasLaunch ? 100 : hasAnnouncement ? 80 : 60;
  const fields = [hasLaunch ? launches : null, hasAnnouncement ? announcements : null, hasRoles ? roles : null].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const confidence = fields.reduce((sum, item) => sum + confidenceValue(item.confidence), 0) / fields.length;
  const labels = [hasLaunch ? "recent product launch" : "", hasAnnouncement ? "hiring announcement" : "", hasRoles ? "open technical roles" : ""].filter(Boolean);
  return factor("companyMomentum", score, confidence, `Public evidence shows ${labels.join(", ")}.`, knownEvidence(fields.flatMap((item) => item.evidenceIds), evidenceById), config);
}
