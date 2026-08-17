export type AcceleratorStatus = "active" | "paused";
export type StartupDiscoveryStatus = "discovered" | "reviewed" | "ignored";

export type Accelerator = {
  id: string;
  name: string;
  website: string;
  portfolioUrl: string;
  description: string;
  status: AcceleratorStatus;
  createdAt: string;
  updatedAt: string;
};

export type Cohort = {
  id: string;
  acceleratorId: string;
  name: string;
  year: number | null;
  portfolioUrl: string;
  source: string;
  createdAt: string;
  updatedAt: string;
};

export type StartupProvenance = {
  discoverySource: string;
  sourceUrl: string;
  discoveredAt: string;
  acceleratorId: string;
  cohortId: string | null;
  cohortName: string | null;
};

export type Startup = {
  id: string;
  name: string;
  website: string;
  domain: string;
  description: string;
  acceleratorId: string;
  cohortId: string | null;
  location: string;
  sourceUrls: string[];
  provenance: StartupProvenance[];
  discoveryStatus: StartupDiscoveryStatus;
  createdAt: string;
  updatedAt: string;
};

export type DiscoveryInput = {
  accelerator: Accelerator;
  cohort: Cohort | null;
  sourceUrl: string;
};

export type DiscoveredStartup = {
  name: string;
  website: string;
  description: string;
  location: string;
  sourceUrl: string;
  discoveredAt: string;
};

export interface StartupDiscoverySource {
  readonly id: string;
  discover(input: DiscoveryInput): Promise<DiscoveredStartup[]>;
}

export type DiscoveryResult = {
  accelerator: Accelerator;
  cohort: Cohort | null;
  sourceUrl: string;
  discoveredAt: string;
  extracted: number;
  created: number;
  updated: number;
  startups: Startup[];
};
