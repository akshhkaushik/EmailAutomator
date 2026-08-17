import type { Evidence, EvidenceDraft, ResearchRun, StartupIntelligence } from "./types.ts";

export type EvidenceUpsertResult = { evidence: Evidence; created: boolean };

export interface IntelligenceRepository {
  createResearchRun(startupId: string, sourceIds: string[]): Promise<ResearchRun>;
  completeResearchRun(id: string, input: Pick<ResearchRun, "status" | "evidenceIds" | "errors">): Promise<ResearchRun>;
  upsertEvidence(startupId: string, draft: EvidenceDraft): Promise<EvidenceUpsertResult>;
  listEvidence(startupId: string): Promise<Evidence[]>;
  saveIntelligence(intelligence: StartupIntelligence): Promise<StartupIntelligence>;
  getIntelligence(startupId: string): Promise<StartupIntelligence | null>;
  listResearchRuns(startupId: string, limit?: number): Promise<ResearchRun[]>;
}
