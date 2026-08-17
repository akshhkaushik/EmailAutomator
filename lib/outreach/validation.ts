import type { Evidence } from "../intelligence/types.ts";
import type { DetectedClaim, OutreachValidation } from "./types.ts";

const STOPWORDS = new Set(["about", "after", "again", "also", "been", "being", "could", "from", "have", "into", "more", "that", "their", "there", "these", "they", "this", "through", "using", "with", "would", "your"]);
function tokens(value: string) { return [...new Set(value.toLowerCase().match(/[a-z0-9$]+/g) || [])].filter((token) => token.length >= 3 && !STOPWORDS.has(token)); }
function valueText(value: Evidence["value"]) { return typeof value === "string" ? value : JSON.stringify(value); }

export function claimSupported(claim: DetectedClaim, evidenceById: Map<string, Evidence>) {
  if (claim.evidenceIds.length === 0) return false;
  const sources = claim.evidenceIds.flatMap((id) => evidenceById.get(id) ? [evidenceById.get(id)!] : []);
  if (sources.length !== claim.evidenceIds.length) return false;
  const sourceText = sources.map((item) => `${item.claim} ${valueText(item.value)}`).join(" ").toLowerCase();
  const claimTokens = tokens(claim.text);
  const numericTokens = claim.text.match(/(?:\$|₹|€)?\d[\d.,%]*/g) || [];
  if (numericTokens.some((token) => !sourceText.includes(token.toLowerCase()))) return false;
  if (claimTokens.length === 0) return false;
  const overlap = claimTokens.filter((token) => sourceText.includes(token)).length / claimTokens.length;
  return overlap >= 0.35;
}

export function validateOutreachClaims(claims: DetectedClaim[], evidence: Evidence[], validatedAt = new Date().toISOString()): OutreachValidation {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const unsupportedClaims = claims.filter((claim) => !claimSupported(claim, evidenceById)).map((claim) => claim.text);
  return { valid: claims.length > 0 && unsupportedClaims.length === 0, unsupportedClaims, validatedAt };
}

export function detectEditedCompanyClaims(body: string, startupName: string, generatedClaims: DetectedClaim[]) {
  const generatedByText = new Map(generatedClaims.map((claim) => [claim.text.trim().toLowerCase(), claim]));
  const sentences = body.replace(/\[[^\]]+\]\([^)]+\)/g, "").split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter(Boolean);
  const factualPattern = /\b(raised|funded|funding|launched|launches|hiring|hires|employees|team|api|sdk|platform|product|customers?|users?|revenue|founded|based in|builds?|provides?|offers?)\b/i;
  const candidates = sentences.filter((sentence) => factualPattern.test(sentence) && (sentence.toLowerCase().includes(startupName.toLowerCase()) || /\b(the company|their|its|your)\b/i.test(sentence)));
  return candidates.map((sentence) => generatedByText.get(sentence.toLowerCase()) || { text: sentence, evidenceIds: [] });
}
