import type { BuildProof, BuildSpec } from "../builds/types.ts";
import type { ContributionOpportunity } from "../contributions/types.ts";
import type { Startup } from "../discovery/types.ts";
import type { Evidence, Founder } from "../intelligence/types.ts";
import type { ProjectMatch } from "../scoring/types.ts";

export const OUTREACH_MODES = ["contribution", "build_before_ask", "open_source"] as const;
export type OutreachMode = typeof OUTREACH_MODES[number];

export type OutreachHistoryItem = { id: string; mode: OutreachMode; generatedAt: string; sentAt: string | null; subject: string };
export type OutreachContext = {
  version: "outreach-context-v1";
  startup: Pick<Startup, "id" | "name" | "website" | "domain" | "description" | "location">;
  founders: Founder[];
  relevantStartupSignals: Array<{ claim: string; value: string; evidenceIds: string[] }>;
  evidence: Array<Pick<Evidence, "id" | "category" | "claim" | "value" | "sourceName" | "sourceUrl" | "observedAt" | "confidence">>;
  opportunity: ContributionOpportunity;
  relevantAkshProjects: ProjectMatch[];
  desiredOutreachMode: OutreachMode;
  previousOutreachHistory: OutreachHistoryItem[];
  build: { spec: BuildSpec; proof: BuildProof } | null;
};

export type DetectedClaim = { text: string; evidenceIds: string[] };
export type OutreachValidation = { valid: boolean; unsupportedClaims: string[]; validatedAt: string };

export type OutreachDraftAudit = {
  id: string;
  startupId: string;
  opportunityId: string;
  buildSpecId: string | null;
  recipientContactId: string | null;
  recipientEmail: string;
  recipientName: string;
  mode: OutreachMode;
  subject: string;
  body: string;
  detectedClaims: DetectedClaim[];
  evidenceIds: string[];
  contextVersion: string;
  model: string;
  generatedAt: string;
  updatedAt: string;
  sentAt: string | null;
  validation: OutreachValidation;
};

export interface OutreachContentGenerator {
  readonly model: string;
  generate(context: OutreachContext, recipientName: string): Promise<{ subject: string; body: string; claims: DetectedClaim[] }>;
}
