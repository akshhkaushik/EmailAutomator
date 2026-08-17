import { hasBuildProof } from "./validation.ts";
import type { BuildProof, BuildStatus } from "./types.ts";

const TRANSITIONS: Record<BuildStatus, readonly BuildStatus[]> = {
  draft: ["approved", "abandoned"],
  approved: ["building", "abandoned"],
  building: ["completed", "abandoned"],
  completed: [],
  abandoned: [],
};

export function assertBuildTransition(from: BuildStatus, to: BuildStatus, proof: BuildProof | null) {
  if (from === to) return;
  if (!TRANSITIONS[from].includes(to)) throw new Error(`Build specification cannot move from ${from} to ${to}.`);
  if (to === "completed" && !hasBuildProof(proof)) throw new Error("Attach verifiable proof before marking a build completed.");
}
