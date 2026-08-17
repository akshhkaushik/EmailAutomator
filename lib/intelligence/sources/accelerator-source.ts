import type { EvidenceDraft, ResearchSourceInput, StartupResearchSource } from "../types.ts";

export class AcceleratorSource implements StartupResearchSource {
  readonly id = "accelerator-source";

  async collect(input: ResearchSourceInput) {
    const source = input.startup.provenance[0];
    if (!source) return [];
    const sourceName = input.accelerator?.name || "Accelerator portfolio";
    const base = {
      sourceName,
      sourceUrl: source.sourceUrl,
      observedAt: source.discoveredAt,
      confidence: "high" as const,
      metadata: { adapter: this.id },
    };
    const evidence: EvidenceDraft[] = [{
      ...base,
      category: "company",
      claim: "company.acceleratorMembership",
      value: { accelerator: sourceName, cohort: source.cohortName },
    }];
    if (input.startup.description) evidence.push({ ...base, category: "company", claim: "company.description", value: input.startup.description, confidence: "medium" });
    if (input.startup.location) evidence.push({ ...base, category: "company", claim: "company.location", value: input.startup.location, confidence: "medium" });
    return evidence;
  }
}
