import { ValidationError } from "../discovery/validation.ts";
import { CONTRIBUTION_STATUSES, type ContributionStatus } from "./types.ts";

export function validateContributionStatus(value: unknown): ContributionStatus {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("Request body must be a JSON object.");
  const status = (value as { status?: unknown }).status;
  if (typeof status !== "string" || !CONTRIBUTION_STATUSES.includes(status as ContributionStatus)) {
    throw new ValidationError(`Status must be one of: ${CONTRIBUTION_STATUSES.join(", ")}.`);
  }
  return status as ContributionStatus;
}
