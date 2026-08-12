import type { BuildRepository } from "../builds/repository.ts";
import type { ContributionRepository } from "../contributions/repository.ts";
import type { DiscoveryRepository } from "../discovery/repository.ts";
import type { IntelligenceRepository } from "../intelligence/repository.ts";
import { buildOutreachContext } from "./context.ts";
import { DeterministicOutreachGenerator, GeminiOutreachGenerator } from "./generator.ts";
import type { OutreachRepository } from "./repository.ts";
import type { OutreachContentGenerator, OutreachDraftAudit, OutreachMode } from "./types.ts";
import { detectEditedCompanyClaims, validateOutreachClaims } from "./validation.ts";
import { structuredLog } from "../observability.ts";
import type { FounderContactRepository } from "../contacts/repository.ts";
import { canUseFounderContact } from "../contacts/service.ts";

export async function createIntelligenceOutreach(input: {
  startupId: string;
  opportunityId: string;
  mode: OutreachMode;
  recipientEmail: string;
  recipientName: string;
  recipientContactId?: string | null;
  discoveryRepository: DiscoveryRepository;
  intelligenceRepository: IntelligenceRepository;
  contributionRepository: ContributionRepository;
  buildRepository: BuildRepository;
  outreachRepository: OutreachRepository;
  contactRepository?: FounderContactRepository;
  generator?: OutreachContentGenerator;
}) {
  const startedAt = Date.now();
  structuredLog("info", "outreach_generation.started", { startupId: input.startupId, opportunityId: input.opportunityId, mode: input.mode });
  const [startup, intelligence, evidence, opportunity, history] = await Promise.all([
    input.discoveryRepository.getStartup(input.startupId),
    input.intelligenceRepository.getIntelligence(input.startupId),
    input.intelligenceRepository.listEvidence(input.startupId),
    input.contributionRepository.get(input.startupId, input.opportunityId),
    input.outreachRepository.history(input.startupId),
  ]);
  if (!startup) throw new Error("Startup was not found.");
  if (!intelligence) throw new Error("Startup intelligence was not found.");
  if (!opportunity) throw new Error("Contribution opportunity was not found.");
  if (input.recipientContactId) {
    if (!input.contactRepository) throw new Error("Founder contact storage is required for discovered recipients.");
    const contact = await input.contactRepository.get(input.startupId, input.recipientContactId);
    if (!contact || !canUseFounderContact(contact) || contact.email !== input.recipientEmail) throw new Error("Select a valid verified founder email before drafting outreach.");
  }
  const build = await input.buildRepository.getByOpportunity(input.startupId, input.opportunityId);
  const context = buildOutreachContext({ startup, intelligence, evidence, opportunity, mode: input.mode, build, history });
  const generator = input.generator || (process.env.GEMINI_API_KEY ? new GeminiOutreachGenerator(process.env.GEMINI_API_KEY) : new DeterministicOutreachGenerator());
  const generated = await generator.generate(context, input.recipientName);
  if (!generated.subject.trim() || generated.subject.length > 200 || !generated.body.trim() || generated.body.length > 20_000) throw new Error("Outreach generation returned invalid email content.");
  const discoveredClaims = detectEditedCompanyClaims(`${generated.subject}. ${generated.body}`, startup.name, generated.claims);
  const claims = [...generated.claims, ...discoveredClaims.filter((claim) => !generated.claims.some((generatedClaim) => generatedClaim.text === claim.text))];
  const validation = validateOutreachClaims(claims, evidence);
  const timestamp = new Date().toISOString();
  const draft: OutreachDraftAudit = {
    id: crypto.randomUUID(), startupId: startup.id, opportunityId: opportunity.id, buildSpecId: build?.id || null, recipientContactId: input.recipientContactId || null,
    recipientEmail: input.recipientEmail, recipientName: input.recipientName, mode: input.mode,
    subject: generated.subject, body: generated.body, detectedClaims: claims,
    evidenceIds: [...new Set(claims.flatMap((claim) => claim.evidenceIds))],
    contextVersion: context.version, model: generator.model, generatedAt: timestamp, updatedAt: timestamp, sentAt: null, validation,
  };
  await input.outreachRepository.save(draft);
  structuredLog("info", "outreach_generation.completed", { startupId: startup.id, opportunityId: opportunity.id, draftId: draft.id, mode: input.mode, model: generator.model, valid: validation.valid, durationMs: Date.now() - startedAt });
  return { context, draft };
}
