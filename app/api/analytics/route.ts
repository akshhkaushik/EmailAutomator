import { listTrackingRecords, sameGoogleMailbox, trackingStorageReady } from "@/lib/tracking";
import { requirePersonalAccess, DiscoveryAccessError } from "@/lib/discovery/auth";
import { getOutcomeRepository } from "@/lib/learning/redis-repository";
import { calculateLearningAnalytics } from "@/lib/learning/analytics";
import { recommendFollowUp } from "@/lib/learning/follow-ups";
import { getDiscoveryRepository } from "@/lib/discovery/redis-repository";
import { getIntelligenceRepository } from "@/lib/intelligence/redis-repository";
import { rankStartupOpportunities } from "@/lib/scoring/service";
import { getBuildRepository } from "@/lib/builds/redis-repository";
import { errorName, structuredLog } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const identity = await requirePersonalAccess(request, "analytics");
    const records = await listTrackingRecords(identity.email);
    const emails = records.map((email) => ({
      ...email,
      selfTest: email.selfTest || sameGoogleMailbox(email.senderEmail, email.recipientEmail),
    }));
    const measuredEmails = emails.filter((email) => !email.selfTest);
    const opened = measuredEmails.filter((email) => email.firstOpenedAt).length;
    const totalOpenEvents = measuredEmails.reduce((total, email) => total + email.openCount, 0);
    const outcomes = trackingStorageReady() ? await getOutcomeRepository().list() : [];
    const learning = calculateLearningAnalytics(outcomes);
    let dashboard = {
      startupsResearched: 0,
      qualifiedStartups: 0,
      outreachSent: outcomes.length,
      replyRate: learning.totals.replyRate,
      positiveReplyRate: learning.totals.positiveReplyRate,
      interviews: learning.totals.interviews,
      opportunitiesBuilt: 0,
      opportunitiesConverted: learning.totals.opportunitiesConverted,
    };
    if (trackingStorageReady()) {
      const discoveryRepository = getDiscoveryRepository();
      const intelligenceRepository = getIntelligenceRepository();
      const ranked = await rankStartupOpportunities({ discoveryRepository, intelligenceRepository });
      const builds = await Promise.all(ranked.map(({ startup }) => getBuildRepository().list(startup.id)));
      dashboard = {
        ...dashboard,
        startupsResearched: ranked.filter(({ scorecard }) => scorecard !== null).length,
        qualifiedStartups: ranked.filter(({ scorecard }) => (scorecard?.score || 0) >= 55).length,
        opportunitiesBuilt: builds.flat().filter((build) => build.status === "completed").length,
      };
    }
    return Response.json({
      configured: trackingStorageReady(),
      generatedAt: new Date().toISOString(),
      stats: {
        sent: measuredEmails.length,
        selfTests: emails.length - measuredEmails.length,
        opened,
        unopened: measuredEmails.length - opened,
        openRate: measuredEmails.length ? Math.round((opened / measuredEmails.length) * 1000) / 10 : 0,
        totalOpenEvents,
      },
      emails,
      outcomes,
      followUps: outcomes.flatMap((outcome) => recommendFollowUp(outcome) || []),
      learning,
      dashboard,
    }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analytics could not be loaded.";
    if (!/^(Connect Gmail|Reconnect Gmail|This Gmail token)/.test(message)) {
      structuredLog("error", "analytics.failed", { errorType: errorName(error) });
    }
    return Response.json(
      { error: message },
      { status: error instanceof DiscoveryAccessError ? error.status : 500, headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }
}
