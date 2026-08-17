import type { BuildProof, BuildSpec, BuildStatus } from "./types.ts";

export interface BuildRepository {
  upsert(spec: BuildSpec): Promise<BuildSpec>;
  get(startupId: string, id: string): Promise<BuildSpec | null>;
  getByOpportunity(startupId: string, opportunityId: string): Promise<BuildSpec | null>;
  list(startupId: string): Promise<BuildSpec[]>;
  attachProof(startupId: string, id: string, proof: BuildProof): Promise<BuildSpec>;
  updateStatus(startupId: string, id: string, status: BuildStatus): Promise<BuildSpec>;
}
