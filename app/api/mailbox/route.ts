import { requirePersonalAccess, DiscoveryAccessError } from "@/lib/discovery/auth";
import { buildStartupOutreachRows, GmailMailboxError, loadStartupMailbox, summarizeMailbox } from "@/lib/mailbox";
import { errorName, structuredLog } from "@/lib/observability";
import { listTrackingRecords } from "@/lib/tracking";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const identity = await requirePersonalAccess(request, "outreach mailbox review");
    const [mailbox, trackingRecords] = await Promise.all([
      loadStartupMailbox(identity.token),
      listTrackingRecords(identity.email, 500),
    ]);
    const rows = buildStartupOutreachRows({
      senderEmail: identity.email,
      sentThreads: mailbox.threads,
      bounceMessages: mailbox.bounceMessages,
      trackingRecords,
    });
    return Response.json({
      generatedAt: new Date().toISOString(),
      window: "Last 365 days",
      summary: summarizeMailbox(rows),
      rows,
    }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The outreach mailbox could not be loaded.";
    if (!(error instanceof DiscoveryAccessError) && !(error instanceof GmailMailboxError)) {
      structuredLog("error", "mailbox.failed", { errorType: errorName(error) });
    }
    const status = error instanceof DiscoveryAccessError || error instanceof GmailMailboxError ? error.status : 500;
    return Response.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
}
