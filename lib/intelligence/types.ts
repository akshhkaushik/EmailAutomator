import type { Accelerator, Cohort, Startup } from "../discovery/types.ts";

export const EVIDENCE_CATEGORIES = [
  "company", "funding", "team", "founder", "product", "hiring", "technical", "activity",
] as const;

export type EvidenceCategory = typeof EVIDENCE_CATEGORIES[number];
export const EVIDENCE_CLAIMS: Record<EvidenceCategory, readonly string[]> = {
  company: ["company.acceleratorMembership", "company.description", "company.industry", "company.location", "company.foundedYear"],
  funding: ["funding.round"],
  team: ["team.size"],
  founder: ["founder.person"],
  product: ["product.description", "product.category", "product.launch"],
  hiring: ["hiring.technicalRole", "hiring.announcement"],
  technical: ["product.developerInfo"],
  activity: [],
};
export type EvidenceConfidence = "high" | "medium" | "low";
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type Evidence = {
  id: string;
  startupId: string;
  category: EvidenceCategory;
  claim: string;
  value: JsonValue;
  sourceName: string;
  sourceUrl: string;
  observedAt: string;
  confidence: EvidenceConfidence;
  metadata: Record<string, JsonValue>;
};

export type EvidenceDraft = Omit<Evidence, "id" | "startupId">;

export type ResearchRun = {
  id: string;
  startupId: string;
  status: "running" | "completed" | "partial" | "failed";
  sourceIds: string[];
  evidenceIds: string[];
  errors: Array<{ sourceId: string; message: string }>;
  startedAt: string;
  completedAt: string | null;
};

export type IntelligenceField<T> = {
  value: T | "unknown";
  evidenceIds: string[];
  confidence: EvidenceConfidence | "unknown";
};

export type FundingRound = {
  roundType: string | "unknown";
  amount: string | "unknown";
  date: string | "unknown";
  datePrecision: "day" | "month" | "year" | "unknown";
  investors: string[] | "unknown";
};

export type TeamObservation = {
  count: number;
  label: string;
  sourceName: string;
  sourceUrl: string;
  observedAt: string;
  confidence: EvidenceConfidence;
  evidenceId: string;
};

export type TeamEstimate = {
  min: number;
  max: number;
  label: "estimate";
  evidenceIds: string[];
  confidence: EvidenceConfidence;
} | "unknown";

export type Founder = { name: string; role: string | "unknown"; profileUrl: string | "unknown" };
export type TechnicalRole = { title: string };
export type DeveloperResource = { label: string; url: string };

export type StartupIntelligence = {
  startupId: string;
  company: {
    description: IntelligenceField<string>;
    industry: IntelligenceField<string>;
    location: IntelligenceField<string>;
    foundedYear: IntelligenceField<number>;
  };
  funding: {
    latestRound: IntelligenceField<FundingRound>;
    daysSinceLatestFunding: IntelligenceField<number>;
  };
  team: { observations: TeamObservation[]; estimate: TeamEstimate };
  founders: IntelligenceField<Founder[]>;
  product: {
    description: IntelligenceField<string>;
    category: IntelligenceField<string>;
    recentLaunches: IntelligenceField<string[]>;
    developerResources: IntelligenceField<DeveloperResource[]>;
  };
  hiring: {
    technicalRoles: IntelligenceField<TechnicalRole[]>;
    recentAnnouncements: IntelligenceField<string[]>;
    engineeringActivity: IntelligenceField<"observed">;
  };
  evidenceIds: string[];
  lastResearchedAt: string;
  builtAt: string;
};

export type ResearchDocument = {
  sourceName: string;
  sourceUrl: string;
  html: string;
  text: string;
  observedAt: string;
};

export type ResearchContext = {
  fetchDocument(url: string, sourceName: string): Promise<ResearchDocument>;
};

export type ResearchSourceInput = {
  startup: Startup;
  accelerator: Accelerator | null;
  cohort: Cohort | null;
  context: ResearchContext;
};

export interface StartupResearchSource {
  readonly id: string;
  collect(input: ResearchSourceInput): Promise<EvidenceDraft[]>;
}
