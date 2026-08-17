import { EVIDENCE_CATEGORIES, EVIDENCE_CLAIMS, type EvidenceCategory, type EvidenceDraft, type JsonValue, type ResearchDocument } from "./types.ts";

function normalized(value: string) { return value.replace(/\s+/g, " ").trim().toLowerCase(); }

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return typeof value === "object" && Object.values(value as Record<string, unknown>).every(isJsonValue);
}

export function validateLlmEvidenceOutput(output: unknown, documents: ResearchDocument[]): EvidenceDraft[] {
  if (!Array.isArray(output)) throw new Error("LLM evidence output must be an array.");
  const byUrl = new Map(documents.map((document) => [document.sourceUrl, document]));
  return output.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("LLM evidence entry must be an object.");
    const item = candidate as Record<string, unknown>;
    if (item.value === "unknown" || item.value === null || item.value === undefined) return [];
    if (typeof item.category !== "string" || !EVIDENCE_CATEGORIES.includes(item.category as EvidenceCategory)) throw new Error("LLM evidence category is invalid.");
    if (typeof item.claim !== "string" || !/^[a-z]+\.[a-zA-Z]+$/.test(item.claim)) throw new Error("LLM evidence claim is invalid.");
    if (!EVIDENCE_CLAIMS[item.category as EvidenceCategory].includes(item.claim)) throw new Error("LLM evidence claim does not match its category.");
    if (typeof item.sourceUrl !== "string" || !byUrl.has(item.sourceUrl)) throw new Error("LLM evidence source URL was not retrieved.");
    if (typeof item.supportingQuote !== "string" || normalized(item.supportingQuote).length < 12) throw new Error("LLM evidence needs a supporting quote.");
    const document = byUrl.get(item.sourceUrl)!;
    if (!normalized(document.text).includes(normalized(item.supportingQuote))) throw new Error("LLM supporting quote was not found in the retrieved source.");
    if (!isJsonValue(item.value)) throw new Error("LLM evidence value must be JSON-compatible.");
    return [{
      category: item.category as EvidenceCategory,
      claim: item.claim,
      value: item.value,
      sourceName: document.sourceName,
      sourceUrl: document.sourceUrl,
      observedAt: document.observedAt,
      confidence: "medium" as const,
      metadata: { extraction: "llm", supportingQuote: item.supportingQuote },
    }];
  });
}
