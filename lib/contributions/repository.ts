import type { BuildSpecification, ContributionOpportunity, ContributionStatus } from "./types.ts";

export interface ContributionRepository {
  upsertSuggestions(startupId: string, suggestions: ContributionOpportunity[]): Promise<ContributionOpportunity[]>;
  list(startupId: string): Promise<ContributionOpportunity[]>;
  get(startupId: string, id: string): Promise<ContributionOpportunity | null>;
  updateStatus(startupId: string, id: string, status: ContributionStatus): Promise<ContributionOpportunity>;
  saveBuildSpec(startupId: string, id: string, buildSpec: BuildSpecification): Promise<ContributionOpportunity>;
}
