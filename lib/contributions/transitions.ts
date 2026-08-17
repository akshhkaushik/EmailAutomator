import type { ContributionStatus } from "./types.ts";

export class ContributionTransitionError extends Error {}

const ALLOWED_TRANSITIONS: Record<ContributionStatus, readonly ContributionStatus[]> = {
  suggested: ["approved", "rejected"],
  approved: ["building", "rejected"],
  building: ["built", "rejected"],
  built: [],
  rejected: ["suggested"],
};

export function assertContributionTransition(from: ContributionStatus, to: ContributionStatus) {
  if (from === to) return;
  if (!ALLOWED_TRANSITIONS[from].includes(to)) throw new ContributionTransitionError(`Contribution opportunity cannot move from ${from} to ${to}.`);
}
