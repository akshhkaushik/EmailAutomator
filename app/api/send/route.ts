import { markdownToHtml, markdownToPlain } from "@/lib/markdown";
import {
  createPendingTrackingRecord,
  markTrackingRecordSent,
  removeTrackingRecord,
  trackingStorageReady,
  sameGoogleMailbox,
  verifyGoogleAccessToken,
} from "@/lib/tracking";

function utf8Base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Url(value: string) {
  return utf8Base64(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function cleanHeader(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim() || /[\r\n]/.test(value)) throw new Error(`Invalid ${label}.`);
  return value.trim();
}

export async function POST(request: Request) {
  let trackingId = "";
  let trackingPrepared = false;
  try {
    const auth = request.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) return Response.json({ error: "Connect Gmail before sending." }, { status: 401 });
    const identity = await verifyGoogleAccessToken(auth);
    const payload = await request.json() as {
      to?: string;
      subject?: string;
      body?: string;
      recipientName?: string;
      companyName?: string;
      companyUrl?: string;
      trackOpens?: boolean;
      resume?: { name?: string; type?: string; base64?: string };
    };
    const to = cleanHeader(payload.to, "recipient");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("Invalid recipient email.");
    const subject = cleanHeader(payload.subject, "subject");
    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    if (!body) throw new Error("The email message is empty.");
    const resumeName = cleanHeader(payload.resume?.name, "résumé filename").replace(/[^\w.\- ()]/g, "_");
    const resumeType = cleanHeader(payload.resume?.type || "application/pdf", "résumé type");
    const attachment = payload.resume?.base64 || "";
    if (!attachment || attachment.length > 11_200_000) throw new Error("Attach a résumé smaller than 8 MB.");

    const selfTest = sameGoogleMailbox(to, identity.email);
    const requestedTracking = payload.trackOpens !== false;
    const trackOpens = requestedTracking && !selfTest;
    if (requestedTracking && !selfTest && !trackingStorageReady()) {
      return Response.json({ error: "Open tracking storage is not connected yet. Connect Upstash Redis in Vercel or turn off open tracking for this email." }, { status: 503 });
    }
    trackingId = crypto.randomUUID();
    trackingPrepared = await createPendingTrackingRecord({
      id: trackingId,
      senderEmail: identity.email,
      recipientEmail: to,
      recipientName: typeof payload.recipientName === "string" ? payload.recipientName.trim().slice(0, 100) : "",
      companyName: typeof payload.companyName === "string" ? payload.companyName.trim().slice(0, 160) : "",
      companyUrl: typeof payload.companyUrl === "string" ? payload.companyUrl.trim().slice(0, 500) : "",
      subject,
      trackingEnabled: trackOpens,
      selfTest,
    });
    const trackingPixel = trackOpens && trackingPrepared
      ? `<img src="${new URL(`/api/track/${trackingId}`, request.url).toString()}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0" />`
      : "";

    const mixed = `signal-mixed-${crypto.randomUUID()}`;
    const alternative = `signal-alt-${crypto.randomUUID()}`;
    const encodedSubject = `=?UTF-8?B?${utf8Base64(subject)}?=`;
    const encodedFilename = `=?UTF-8?B?${utf8Base64(resumeName)}?=`;
    const mime = [
      `To: ${to}`,
      `Subject: ${encodedSubject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${mixed}"`,
      "",
      `--${mixed}`,
      `Content-Type: multipart/alternative; boundary="${alternative}"`,
      "",
      `--${alternative}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      utf8Base64(markdownToPlain(body)),
      "",
      `--${alternative}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      utf8Base64(`<div style="font-family:Arial,sans-serif;line-height:1.65;color:#17201b">${markdownToHtml(body)}${trackingPixel}</div>`),
      "",
      `--${alternative}--`,
      "",
      `--${mixed}`,
      `Content-Type: ${resumeType}; name="${encodedFilename}"`,
      `Content-Disposition: attachment; filename="${encodedFilename}"`,
      "Content-Transfer-Encoding: base64",
      "",
      attachment.replace(/\s/g, ""),
      "",
      `--${mixed}--`,
    ].join("\r\n");

    const gmailResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: base64Url(mime) }),
    });
    const gmailResult = await gmailResponse.json() as { id?: string; error?: { message?: string } };
    if (!gmailResponse.ok) {
      if (trackingPrepared) await removeTrackingRecord(trackingId);
      const message = gmailResponse.status === 401
        ? "Your Gmail permission expired. Reconnect Gmail and try again."
        : gmailResult.error?.message || "Gmail rejected the message.";
      return Response.json({ error: message }, { status: gmailResponse.status });
    }
    let trackedRecord = null;
    let trackingWarning = selfTest
      ? "Email sent as a self-test. Open tracking was disabled because Gmail cannot distinguish your Sent-folder view from a recipient open."
      : "";
    if (trackingPrepared && gmailResult.id) {
      try {
        trackedRecord = await markTrackingRecordSent(trackingId, gmailResult.id);
      } catch (trackingError) {
        console.error("Email sent but analytics finalization failed", trackingError);
        trackingPrepared = false;
        trackingWarning = "The email was sent, but its analytics record could not be finalized.";
      }
    }
    return Response.json({
      id: gmailResult.id,
      trackingId: trackedRecord?.id || null,
      tracked: Boolean(trackedRecord?.trackingEnabled),
      selfTest,
      sentAt: trackedRecord?.sentAt || new Date().toISOString(),
      warning: trackingWarning || undefined,
    });
  } catch (error) {
    if (trackingPrepared && trackingId) {
      try {
        await removeTrackingRecord(trackingId);
      } catch (cleanupError) {
        console.error("Tracking cleanup failed", cleanupError);
      }
    }
    console.error("Email send failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "The email was not sent." }, { status: 400 });
  }
}
