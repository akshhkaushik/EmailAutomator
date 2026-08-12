import { createHash } from "node:crypto";
import type { ContributionOpportunity } from "../contributions/types.ts";
import type { OpportunityScorecard } from "../scoring/types.ts";
import type { BuildSpec } from "./types.ts";

export function generateBuildSpec(opportunity: ContributionOpportunity, scorecard: OpportunityScorecard, createdAt = new Date().toISOString()): BuildSpec {
  if (scorecard.tier !== "S") throw new Error("Build-before-ask specifications require an S-tier startup.");
  if (opportunity.status !== "approved" && opportunity.status !== "building" && opportunity.status !== "built") throw new Error("Approve the contribution opportunity before creating a build specification.");
  if (opportunity.evidence.length === 0) throw new Error("A build specification requires public evidence.");
  const id = createHash("sha256").update(`${opportunity.id}|build-v1`).digest("hex").slice(0, 32);
  return {
    id,
    startupId: opportunity.startupId,
    opportunityId: opportunity.id,
    title: opportunity.title,
    problem: opportunity.problem,
    whyItMatters: opportunity.expectedImpact,
    scope: `Produce one independently runnable proof for “${opportunity.title}” using only public or synthetic inputs. Do not deploy into the startup's systems or modify its repositories.`,
    implementationPlan: [
      "Freeze a small fixture set and record its public or synthetic provenance.",
      opportunity.proposedSolution,
      "Implement one primary path and one visible failure path.",
      "Add deterministic tests and concise setup documentation.",
    ],
    architecture: ["Fixture or public-input boundary", "Typed processing or integration module", "Validation and failure reporting", "Runnable demonstration surface"],
    APIs: opportunity.evidence.flatMap((item) => item.claim === "product.developerInfo" ? [{ label: item.sourceName, url: item.sourceUrl }] : []),
    expectedOutput: ["Runnable proof of concept", "Fixture-backed tests", "README with evidence, assumptions, and limitations", "Demonstrable success and failure output"],
    acceptanceCriteria: [
      "All startup-specific facts link to the public evidence listed in this specification.",
      "The primary workflow is reproducible from the README.",
      "At least one invalid or failed input is handled visibly.",
      "No private data, production credentials, or external repository writes are required.",
    ],
    demoIdea: `Show the cited public signal, run the smallest successful ${opportunity.type.toLowerCase()} workflow, then show one failure case and its inspectable output.`,
    estimatedEffort: opportunity.estimatedEffortHours,
    knownFromPublicEvidence: opportunity.evidence,
    assumptions: [
      "The artifact would be useful enough for the startup to evaluate; this has not been confirmed by the company.",
      "Public or synthetic fixtures can represent the workflow without private company data.",
      "The proposed technical shape is an external demonstration, not knowledge of the startup's internal architecture.",
    ],
    createdAt,
    updatedAt: createdAt,
    status: "draft",
    proof: null,
  };
}
