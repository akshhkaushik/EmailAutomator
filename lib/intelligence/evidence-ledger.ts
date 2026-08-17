import { createHash } from "node:crypto";
import type { IntelligenceRepository } from "./repository.ts";
import type { Evidence, EvidenceConfidence, EvidenceDraft, JsonValue } from "./types.ts";

function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function evidenceFingerprint(startupId: string, draft: EvidenceDraft) {
  const identity = [startupId, draft.category, draft.claim, draft.sourceUrl, canonical(draft.value)].join("\n");
  return createHash("sha256").update(identity).digest("hex");
}

export function confidenceRank(confidence: EvidenceConfidence) {
  return confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
}

export class EvidenceLedger {
  private readonly repository: IntelligenceRepository;
  private readonly startupId: string;

  constructor(repository: IntelligenceRepository, startupId: string) {
    this.repository = repository;
    this.startupId = startupId;
  }

  async record(draft: EvidenceDraft) { return this.repository.upsertEvidence(this.startupId, draft); }

  async recordMany(drafts: EvidenceDraft[]) {
    const records: Evidence[] = [];
    let created = 0;
    for (const draft of drafts) {
      const result = await this.record(draft);
      if (result.created) created += 1;
      records.push(result.evidence);
    }
    return { records, created, reused: drafts.length - created };
  }

  async all() { return this.repository.listEvidence(this.startupId); }
}
