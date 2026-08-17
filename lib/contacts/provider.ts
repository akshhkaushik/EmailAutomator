import { HunterEmailFinder } from "./hunter.ts";
import { SnovEmailFinder } from "./snov.ts";
import type { FounderEmailFinder } from "./types.ts";

type FounderEmailEnvironment = Partial<Pick<NodeJS.ProcessEnv, "SNOV_CLIENT_ID" | "SNOV_CLIENT_SECRET" | "HUNTER_API_KEY">>;

export function founderEmailProviderFromEnvironment(environment: FounderEmailEnvironment = process.env as FounderEmailEnvironment): FounderEmailFinder | undefined {
  const snovClientId = environment.SNOV_CLIENT_ID?.trim() || "";
  const snovClientSecret = environment.SNOV_CLIENT_SECRET?.trim() || "";
  if (snovClientId && snovClientSecret) return new SnovEmailFinder(snovClientId, snovClientSecret);
  const hunterApiKey = environment.HUNTER_API_KEY?.trim() || "";
  return hunterApiKey ? new HunterEmailFinder(hunterApiKey) : undefined;
}
