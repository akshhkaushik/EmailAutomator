import type { ContributionEvidence } from "../contributions/types.ts";

export const BUILD_STATUSES = ["draft", "approved", "building", "completed", "abandoned"] as const;
export type BuildStatus = typeof BUILD_STATUSES[number];

export type BuildProof = {
  githubUrl: string;
  demoUrl: string;
  prUrl: string;
  documentationUrl: string;
  screenshotUrl: string;
  notes: string;
  attachedAt: string;
};

export type BuildSpec = {
  id: string;
  startupId: string;
  opportunityId: string;
  title: string;
  problem: string;
  whyItMatters: string;
  scope: string;
  implementationPlan: string[];
  architecture: string[];
  APIs: Array<{ label: string; url: string }>;
  expectedOutput: string[];
  acceptanceCriteria: string[];
  demoIdea: string;
  estimatedEffort: number;
  knownFromPublicEvidence: ContributionEvidence[];
  assumptions: string[];
  createdAt: string;
  updatedAt: string;
  status: BuildStatus;
  proof: BuildProof | null;
};
