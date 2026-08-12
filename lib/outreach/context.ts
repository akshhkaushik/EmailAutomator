import type { BuildSpec } from "../builds/types.ts";
import { hasBuildProof } from "../builds/validation.ts";
import type { ContributionOpportunity } from "../contributions/types.ts";
import type { Startup } from "../discovery/types.ts";
import type { Evidence, StartupIntelligence } from "../intelligence/types.ts";
import type { OutreachContext, OutreachHistoryItem, OutreachMode } from "./types.ts";

export function assertOutreachMode(mode: OutreachMode, opportunity: ContributionOpportunity, build: BuildSpec | null) {
  if (opportunity.status !== "approved" && opportunity.status !== "building" && opportunity.status !== "built") throw new Error("Approve the contribution opportunity before drafting outreach.");
  if (mode === "contribution") return;
  if (!build || build.status !== "completed" || !hasBuildProof(build.proof)) throw new Error("Completed build proof is required for this outreach mode.");
  if (!(build.proof?.githubUrl || build.proof?.prUrl || build.proof?.demoUrl)) throw new Error("Build-before-ask and open-source outreach require a GitHub repository, pull request, or demo URL.");
}

export function buildOutreachContext(input: {
  startup: Startup;
  intelligence: StartupIntelligence;
  evidence: Evidence[];
  opportunity: ContributionOpportunity;
  mode: OutreachMode;
  build: BuildSpec | null;
  history: OutreachHistoryItem[];
}): OutreachContext {
  assertOutreachMode(input.mode, input.opportunity, input.build);
  const selectedIds = new Set(input.opportunity.evidence.map((item) => item.evidenceId));
  const evidence = input.evidence.filter((item) => selectedIds.has(item.id)).map(({ id, category, claim, value, sourceName, sourceUrl, observedAt, confidence }) => ({ id, category, claim, value, sourceName, sourceUrl, observedAt, confidence }));
  if (evidence.length === 0) throw new Error("The selected opportunity has no current EvidenceLedger records.");
  const founders = input.intelligence.founders.value === "unknown" ? [] : input.intelligence.founders.value;
  return {
    version: "outreach-context-v1",
    startup: { id: input.startup.id, name: input.startup.name, website: input.startup.website, domain: input.startup.domain, description: input.startup.description, location: input.startup.location },
    founders,
    relevantStartupSignals: input.opportunity.evidence.map((item) => ({ claim: item.claim, value: item.valueSummary, evidenceIds: [item.evidenceId] })),
    evidence,
    opportunity: input.opportunity,
    relevantAkshProjects: input.opportunity.relevantAkshProjects,
    desiredOutreachMode: input.mode,
    previousOutreachHistory: input.history.slice(0, 10),
    build: input.build?.proof ? { spec: input.build, proof: input.build.proof } : null,
  };
}
