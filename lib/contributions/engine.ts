import { createHash } from "node:crypto";
import type { Evidence, EvidenceConfidence, IntelligenceField, JsonValue } from "../intelligence/types.ts";
import { AKSH_CAPABILITY_PROFILE } from "../scoring/capability-profile.ts";
import { conceptLabel, extractCapabilityConcepts } from "../scoring/concepts.ts";
import type { CapabilityProject, ProjectMatch } from "../scoring/types.ts";
import { DEFAULT_CONTRIBUTION_ENGINE_CONFIG, validateContributionConfig } from "./config.ts";
import type { ContributionEngineInput, ContributionEvidence, ContributionOpportunity, ContributionScoreBreakdown } from "./types.ts";

type Candidate = {
  key: string;
  type: string;
  title: string;
  problem: string;
  proposedSolution: string;
  expectedImpact: string;
  evidenceIds: string[];
  requiredConcepts: string[];
  estimatedEffortHours: number;
  startupRelevance: number;
  expectedImpactScore: number;
};

const MATURITY_RANK: Record<CapabilityProject["maturity"], number> = { live: 4, substantial: 3, prototype: 2, learning: 1 };

function unique<T>(values: T[]) { return [...new Set(values)]; }
function clamp(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }
function confidenceNumber(value: EvidenceConfidence) { return value === "high" ? 100 : value === "medium" ? 65 : 35; }
function summary(value: JsonValue) {
  const result = typeof value === "string" ? value : JSON.stringify(value);
  return result.length > 240 ? `${result.slice(0, 237)}…` : result;
}

type KnownField<T> = Omit<IntelligenceField<T>, "value"> & { value: T };
function known<T>(field: IntelligenceField<T>): KnownField<T> | null {
  return field.value === "unknown" ? null : field as KnownField<T>;
}

function opportunityId(startupId: string, key: string, evidenceIds: string[]) {
  return createHash("sha256").update(`${startupId}|${key}|${[...evidenceIds].sort().join("|")}`).digest("hex").slice(0, 32);
}

function evidenceRefs(ids: string[], byId: Map<string, Evidence>): ContributionEvidence[] {
  return unique(ids).flatMap((id) => {
    const item = byId.get(id);
    return item ? [{
      evidenceId: item.id,
      claim: item.claim,
      valueSummary: summary(item.value),
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      observedAt: item.observedAt,
      confidence: item.confidence,
    }] : [];
  });
}

function projectConcepts(project: CapabilityProject) {
  return extractCapabilityConcepts([project.description, ...project.technologies, ...project.problemDomains, ...project.capabilitiesDemonstrated]);
}

export function matchContributionProjects(concepts: string[], projects: CapabilityProject[]): ProjectMatch[] {
  const desired = new Set(concepts);
  return projects.flatMap((project) => {
    const matchedConcepts = projectConcepts(project).filter((concept) => desired.has(concept));
    return matchedConcepts.length === 0 ? [] : [{
      projectId: project.id,
      projectName: project.name,
      matchedConcepts,
      repositoryUrl: project.repositoryUrl,
      demoUrl: project.demoUrl,
    }];
  }).sort((a, b) => b.matchedConcepts.length - a.matchedConcepts.length
    || MATURITY_RANK[projects.find((project) => project.id === b.projectId)?.maturity || "learning"] - MATURITY_RANK[projects.find((project) => project.id === a.projectId)?.maturity || "learning"]
    || a.projectName.localeCompare(b.projectName)).slice(0, 3);
}

export function estimateContributionDifficulty(hours: number) {
  return hours <= 12 ? "small" as const : hours <= 24 ? "moderate" as const : "ambitious" as const;
}

function effortFit(hours: number) { return hours <= 8 ? 100 : hours <= 16 ? 90 : hours <= 24 ? 75 : hours <= 40 ? 55 : 30; }

export function calculateContributionScore(input: {
  evidence: ContributionEvidence[];
  startupRelevance: number;
  projectMatches: ProjectMatch[];
  estimatedEffortHours: number;
  expectedImpact: number;
  weights: ContributionScoreBreakdown;
}) {
  const averageConfidence = input.evidence.length === 0 ? 0 : input.evidence.reduce((sum, item) => sum + confidenceNumber(item.confidence), 0) / input.evidence.length;
  const evidenceStrength = averageConfidence * Math.min(1, 0.75 + input.evidence.length * 0.125);
  const bestMatchCount = input.projectMatches[0]?.matchedConcepts.length || 0;
  const akshRelevance = bestMatchCount === 0 ? 0 : bestMatchCount === 1 ? 45 : bestMatchCount === 2 ? 70 : bestMatchCount === 3 ? 88 : 100;
  const breakdown = {
    evidenceStrength: clamp(evidenceStrength),
    startupRelevance: clamp(input.startupRelevance),
    akshRelevance,
    effortFit: effortFit(input.estimatedEffortHours),
    expectedImpact: clamp(input.expectedImpact),
  };
  const contributionScore = Math.round(Object.entries(breakdown).reduce((total, [key, value]) => total + value * input.weights[key as keyof ContributionScoreBreakdown] / 100, 0));
  const confidenceScore = clamp(breakdown.evidenceStrength * 0.55 + breakdown.startupRelevance * 0.25 + breakdown.akshRelevance * 0.2);
  return {
    contributionScore,
    breakdown,
    confidenceScore,
    confidence: confidenceScore >= 75 ? "high" as const : confidenceScore >= 45 ? "medium" as const : "low" as const,
  };
}

function detectCandidates(input: ContributionEngineInput, evidenceById: Map<string, Evidence>) {
  const { intelligence, startupName } = input;
  const productFields = [known(intelligence.product.description), known(intelligence.product.category), known(intelligence.company.industry)].filter((field): field is NonNullable<typeof field> => Boolean(field));
  const productEvidenceIds = unique(productFields.flatMap((field) => field.evidenceIds)).filter((id) => evidenceById.has(id));
  const productText = productFields.map((field) => String(field.value));
  const startupConcepts = extractCapabilityConcepts(productText);
  const developer = known(intelligence.product.developerResources);
  const launches = known(intelligence.product.recentLaunches);
  const roles = known(intelligence.hiring.technicalRoles);
  const secondarySignalIds = unique([...(roles?.evidenceIds || []), ...(launches?.evidenceIds || [])]).filter((id) => evidenceById.has(id));
  const candidates: Candidate[] = [];

  if (developer && developer.value.length > 0) {
    const label = developer.value[0].label;
    candidates.push({
      key: "developer-integration-starter",
      type: "SDK / API integration",
      title: `Build a TypeScript integration starter for ${label}`,
      problem: `${startupName} exposes ${label}, creating a concrete developer-adoption surface. Public evidence does not establish current SDK coverage, so this is framed as a demonstrable starter rather than a claim that an SDK is missing.`,
      proposedSolution: "Create a small typed client or example application covering authentication placeholders, one read path, one write path where publicly documented, error handling, and a runnable README.",
      expectedImpact: "Could give prospective developers a copyable integration path and give the team a concrete artifact to evaluate without changing production systems.",
      evidenceIds: unique([...developer.evidenceIds, ...productEvidenceIds]),
      requiredConcepts: unique(["developer-tools", "typescript", "full-stack", ...startupConcepts]),
      estimatedEffortHours: 12,
      startupRelevance: 95,
      expectedImpactScore: 85,
    });
  }

  if (startupConcepts.includes("ai-workflows") || startupConcepts.includes("applied-ml")) {
    candidates.push({
      key: "ai-evaluation-harness",
      type: "evaluation pipeline",
      title: `Create a focused evaluation harness for ${startupName}`,
      problem: `${startupName}'s sourced product description indicates an AI or ML system. A compact, evidence-preserving regression harness is a testable contribution hypothesis; the current existence or absence of internal evaluation tooling is unknown.`,
      proposedSolution: "Define a small fixture set from public product behavior, typed expected outputs, repeatable evaluation runs, failure categories, and an inspectable report suitable for comparing iterations.",
      expectedImpact: "Could demonstrate a practical way to detect regressions and make product-quality discussions more concrete while staying outside private data and production infrastructure.",
      evidenceIds: unique([...productEvidenceIds, ...secondarySignalIds]),
      requiredConcepts: unique(["ai-workflows", "applied-ml", "evidence", ...startupConcepts]),
      estimatedEffortHours: 18,
      startupRelevance: 88,
      expectedImpactScore: 88,
    });
  }

  if (startupConcepts.includes("data") || startupConcepts.includes("geospatial") || startupConcepts.includes("documents")) {
    const focus = startupConcepts.includes("geospatial") ? "geospatial data" : startupConcepts.includes("documents") ? "document processing" : "data ingestion";
    candidates.push({
      key: `inspectable-${focus.replaceAll(" ", "-")}-pipeline`,
      type: "data pipeline",
      title: `Prototype an inspectable ${focus} pipeline`,
      problem: `${startupName}'s public product evidence depends on ${focus}. The hypothesis is that a small observable pipeline artifact could demonstrate useful handling of inputs, validation, failures, and outputs without assuming access to the startup's internal stack.`,
      proposedSolution: "Build a fixture-driven ingestion slice with schema validation, provenance, rejected-record reporting, idempotent reruns, and a compact operator view or report.",
      expectedImpact: "Could demonstrate reliability and operational visibility on a startup-relevant workflow using only public or synthetic inputs.",
      evidenceIds: productEvidenceIds,
      requiredConcepts: unique(["data", focus === "geospatial data" ? "geospatial" : focus === "document processing" ? "documents" : "developer-tools", "evidence"]),
      estimatedEffortHours: 20,
      startupRelevance: 84,
      expectedImpactScore: 82,
    });
  }

  if (launches && launches.value.length > 0 && startupConcepts.some((concept) => ["frontend", "full-stack", "developer-tools", "visualization", "mobile"].includes(concept))) {
    candidates.push({
      key: "launch-demo-slice",
      type: "frontend / product improvement",
      title: `Build a narrow interactive demo for the recent ${startupName} launch`,
      problem: `${startupName} has explicit recent-launch evidence and a product surface that overlaps with Aksh's product-engineering catalog. A small public-data demo can make one workflow tangible without asserting that the existing product experience is deficient.`,
      proposedSolution: "Choose one publicly observable workflow and implement a responsive before/after or guided demo with fixture data, clear empty/error states, and a short measurement plan.",
      expectedImpact: "Could provide a concrete conversation artifact for evaluating product clarity, onboarding, or developer experience in hours rather than proposing a broad redesign.",
      evidenceIds: unique([...launches.evidenceIds, ...productEvidenceIds]),
      requiredConcepts: unique(["frontend", "full-stack", ...startupConcepts]),
      estimatedEffortHours: 14,
      startupRelevance: 90,
      expectedImpactScore: 78,
    });
  }

  if (startupConcepts.includes("fintech") && (startupConcepts.includes("compliance") || startupConcepts.includes("evidence"))) {
    candidates.push({
      key: "auditable-workflow-validator",
      type: "automation / internal tooling",
      title: `Prototype an auditable workflow validator for ${startupName}`,
      problem: `${startupName}'s sourced product domain combines financial workflows with compliance or audit concerns. A bounded validation artifact is relevant without presuming a specific internal control failure.`,
      proposedSolution: "Model one public or synthetic workflow as typed steps with validation rules, human-review checkpoints, append-only events, and an exportable exception report.",
      expectedImpact: "Could demonstrate how to make one operational path more inspectable and safer while preserving human decision boundaries.",
      evidenceIds: productEvidenceIds,
      requiredConcepts: ["fintech", "compliance", "evidence", "ai-workflows"],
      estimatedEffortHours: 24,
      startupRelevance: 86,
      expectedImpactScore: 86,
    });
  }

  return candidates;
}

export function generateContributionOpportunities(input: ContributionEngineInput): ContributionOpportunity[] {
  const config = validateContributionConfig(input.config || DEFAULT_CONTRIBUTION_ENGINE_CONFIG);
  if (input.startupScorecard.score < config.minimumStartupScore) return [];
  const projects = input.projects || AKSH_CAPABILITY_PROFILE;
  const evidenceById = new Map(input.evidence.map((item) => [item.id, item]));
  const now = new Date().toISOString();
  const deduplicated = new Map<string, ContributionOpportunity>();

  for (const candidate of detectCandidates(input, evidenceById)) {
    const evidence = evidenceRefs(candidate.evidenceIds, evidenceById);
    if (evidence.length === 0) continue;
    const projectMatches = matchContributionProjects(candidate.requiredConcepts, projects);
    if (projectMatches.length === 0) continue;
    const scoring = calculateContributionScore({
      evidence,
      startupRelevance: candidate.startupRelevance,
      projectMatches,
      estimatedEffortHours: candidate.estimatedEffortHours,
      expectedImpact: candidate.expectedImpactScore,
      weights: config.scoreWeights,
    });
    const id = opportunityId(input.intelligence.startupId, candidate.key, evidence.map((item) => item.evidenceId));
    const opportunity: ContributionOpportunity = {
      id,
      startupId: input.intelligence.startupId,
      type: candidate.type,
      title: candidate.title,
      problem: candidate.problem,
      evidence,
      proposedSolution: candidate.proposedSolution,
      expectedImpact: candidate.expectedImpact,
      relevantAkshProjects: projectMatches,
      relevantSkills: unique(projectMatches.flatMap((match) => match.matchedConcepts)).map(conceptLabel),
      estimatedDifficulty: estimateContributionDifficulty(candidate.estimatedEffortHours),
      estimatedEffortHours: candidate.estimatedEffortHours,
      contributionScore: scoring.contributionScore,
      contributionScoreBreakdown: scoring.breakdown,
      confidence: scoring.confidence,
      confidenceScore: scoring.confidenceScore,
      status: "suggested",
      buildSpec: null,
      engineVersion: config.version,
      createdAt: now,
      updatedAt: now,
    };
    const existing = deduplicated.get(candidate.key);
    if (!existing || opportunity.contributionScore > existing.contributionScore) deduplicated.set(candidate.key, opportunity);
  }

  return [...deduplicated.values()].sort((a, b) => b.contributionScore - a.contributionScore || a.title.localeCompare(b.title)).slice(0, config.maximumSuggestions);
}
