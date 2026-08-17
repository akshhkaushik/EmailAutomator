import type { BuildSpecification, ContributionOpportunity } from "./types.ts";

export function generateBuildSpecification(opportunity: ContributionOpportunity, generatedAt = new Date().toISOString()): BuildSpecification {
  const relevantApis = opportunity.evidence.flatMap((item) => item.claim === "product.developerInfo"
    ? [{ label: item.sourceName, url: item.sourceUrl }] : []);
  const projectNames = opportunity.relevantAkshProjects.map((project) => project.projectName).join(", ");
  return {
    problem: opportunity.problem,
    scope: `Deliver one independently runnable demonstration of “${opportunity.title}” using only public or synthetic inputs. Exclude production deployment, private startup data, account impersonation, and changes to the startup's repositories.`,
    proposedImplementation: [
      "Freeze a small set of public or synthetic fixtures and document their provenance.",
      opportunity.proposedSolution,
      "Add deterministic tests for the main path plus one invalid-input and one failure case.",
      "Package a concise README with setup, limitations, screenshots or sample output, and explicit assumptions.",
    ],
    inputs: [
      ...opportunity.evidence.map((item) => `${item.claim}: ${item.valueSummary}`),
      "Public documentation and synthetic fixtures only",
    ],
    outputs: ["Runnable proof of concept", "Fixture-backed test suite", "README with assumptions and limitations", "Short demo artifact or recorded walkthrough"],
    acceptanceCriteria: [
      "Every startup-specific claim links to one of the opportunity's evidence sources.",
      "A new user can run the primary demo path from the README.",
      "The demonstration handles at least one invalid or failed input visibly.",
      `The implementation visibly uses capabilities demonstrated by ${projectNames || "the matched Aksh project catalog"}.`,
      "No private data, secrets, production credentials, or external repository modifications are required.",
    ],
    estimatedEffortHours: opportunity.estimatedEffortHours,
    relevantApis,
    potentialDemo: `A 3–5 minute walkthrough showing the sourced problem, the smallest successful workflow, one failure case, and the measurable output for ${opportunity.title}.`,
    generatedAt,
  };
}
