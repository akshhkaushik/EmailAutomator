import { ValidationError } from "../discovery/validation.ts";
import { REPLY_CATEGORIES, type OutreachOutcome, type ReplyCategory } from "./types.ts";

export function validateOutcomePatch(value: unknown): Partial<Pick<OutreachOutcome, "replyStatus" | "replyClassification" | "followUpCount" | "interview" | "technicalTask" | "referral" | "rejection" | "offer" | "notes">> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("Outcome update must be a JSON object.");
  const input = value as Record<string, unknown>;
  const patch: Partial<OutreachOutcome> = {};
  if (input.replyClassification !== undefined) {
    if (input.replyClassification !== null && (typeof input.replyClassification !== "string" || !REPLY_CATEGORIES.includes(input.replyClassification as ReplyCategory))) throw new ValidationError(`Reply classification must be one of: ${REPLY_CATEGORIES.join(", ")}.`);
    patch.replyClassification = input.replyClassification as ReplyCategory | null;
    patch.replyStatus = input.replyClassification === "no_response" ? "no_response" : input.replyClassification ? "replied" : "pending";
  }
  for (const field of ["interview", "technicalTask", "referral", "rejection", "offer"] as const) if (input[field] !== undefined) { if (typeof input[field] !== "boolean") throw new ValidationError(`${field} must be boolean.`); patch[field] = input[field]; }
  if (input.followUpCount !== undefined) { if (!Number.isInteger(input.followUpCount) || Number(input.followUpCount) < 0 || Number(input.followUpCount) > 3) throw new ValidationError("Follow-up count must be between 0 and 3."); patch.followUpCount = Number(input.followUpCount); }
  if (input.notes !== undefined) { if (typeof input.notes !== "string") throw new ValidationError("Notes must be text."); patch.notes = input.notes.trim().slice(0, 4_000); }
  return patch;
}
