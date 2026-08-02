import { listTrackingRecords, sameGoogleMailbox, trackingStorageReady, verifyGoogleAccessToken } from "@/lib/tracking";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const identity = await verifyGoogleAccessToken(request.headers.get("authorization"));
    const records = await listTrackingRecords(identity.email);
    const emails = records.map((email) => ({
      ...email,
      selfTest: email.selfTest || sameGoogleMailbox(email.senderEmail, email.recipientEmail),
    }));
    const measuredEmails = emails.filter((email) => !email.selfTest);
    const opened = measuredEmails.filter((email) => email.firstOpenedAt).length;
    const totalOpenEvents = measuredEmails.reduce((total, email) => total + email.openCount, 0);
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
    }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analytics could not be loaded.";
    if (!/^(Connect Gmail|Reconnect Gmail|This Gmail token)/.test(message)) {
      console.error("Analytics request failed", error);
    }
    return Response.json(
      { error: message },
      { status: 401, headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }
}
