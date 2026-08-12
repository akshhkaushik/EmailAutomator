import { listTrackingRecords, sameGoogleMailbox, trackingStorageReady } from "@/lib/tracking";
import { requirePersonalAccess, DiscoveryAccessError } from "@/lib/discovery/auth";
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
    const totalLinkClicks = measuredEmails.reduce((total, email) => total + (email.clickCount || 0), 0);
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
        totalLinkClicks,
      },
      emails,
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
