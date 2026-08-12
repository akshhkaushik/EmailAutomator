import { extractHttpLinks, markdownToHtml, markdownToPlain } from "@/lib/markdown";
import {
  createPendingTrackingRecord,
  markTrackingRecordSent,
  removeTrackingRecord,
  trackingStorageReady,
  sameGoogleMailbox,
  beginSendAttempt,
  completeSendAttempt,
  releaseSendAttempt,
  emailSendFingerprint,
} from "@/lib/tracking";
import { requirePersonalAccess, DiscoveryAccessError } from "@/lib/discovery/auth";
import { enforceSendRateLimit, DiscoveryRateLimitError } from "@/lib/discovery/rate-limit";
import { jsonBody } from "@/lib/discovery/api";
import { errorName, opaqueId, requestId, structuredLog } from "@/lib/observability";
import { getOutreachRepository } from "@/lib/outreach/redis-repository";
import { detectEditedCompanyClaims, validateOutreachClaims } from "@/lib/outreach/validation";
import { getIntelligenceRepository } from "@/lib/intelligence/redis-repository";
import { getDiscoveryRepository } from "@/lib/discovery/redis-repository";
import { getContributionRepository } from "@/lib/contributions/redis-repository";
import { scoreStartupOpportunity } from "@/lib/scoring/engine";
import { getOutcomeRepository } from "@/lib/learning/redis-repository";
import type { OutreachDraftAudit } from "@/lib/outreach/types";
import { GmailApiError, sendRawGmailMessage } from "@/lib/gmail";

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
  const operationId = requestId(request);
  let trackingId = "";
  let trackingPrepared = false;
  let sendAttemptKey = "";
  let sendFingerprint = "";
  let gmailRequestStarted = false;
  try {
    const identity = await requirePersonalAccess(request, "email sending");
    await enforceSendRateLimit(identity.email);
    structuredLog("info", "email.approval_received", { requestId: operationId, actorId: opaqueId(identity.email) });
    const payload = await jsonBody(request, 12_500_000) as {
      to?: string;
      subject?: string;
      body?: string;
      recipientName?: string;
      companyName?: string;
      companyUrl?: string;
      trackOpens?: boolean;
      outreachDraftId?: string;
      resume?: { name?: string; type?: string; base64?: string };
    };
    const to = cleanHeader(payload.to, "recipient");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("Invalid recipient email.");
    const subject = cleanHeader(payload.subject, "subject");
    if (subject.length > 200) throw new Error("The email subject is too long.");
    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    if (!body) throw new Error("The email message is empty.");
    if (body.length > 30_000) throw new Error("The email message is too long.");
    const hasAttachment = Boolean(payload.resume?.name || payload.resume?.base64);
    const resumeName = hasAttachment ? cleanHeader(payload.resume?.name, "résumé filename").replace(/[^\w.\- ()]/g, "_") : "";
    const resumeType = hasAttachment ? cleanHeader(payload.resume?.type || "application/pdf", "résumé type") : "";
    const allowedResumeTypes = new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
    if (hasAttachment && !allowedResumeTypes.has(resumeType.toLowerCase())) throw new Error("Attach a PDF, DOC, or DOCX résumé.");
    const attachment = (payload.resume?.base64 || "").replace(/\s/g, "");
    if (hasAttachment && (!attachment || attachment.length > 11_200_000 || attachment.length % 4 !== 0 || !/^[a-zA-Z0-9+/]*={0,2}$/.test(attachment))) throw new Error("Attach a valid résumé smaller than 8 MB.");
    let auditedDraft: OutreachDraftAudit | null = null;
    if (payload.outreachDraftId) {
      const outreachRepository = getOutreachRepository();
      auditedDraft = await outreachRepository.get(payload.outreachDraftId);
      if (!auditedDraft) return Response.json({ error: "The intelligence outreach draft was not found." }, { status: 404 });
      if (auditedDraft.sentAt) return Response.json({ error: "This outreach draft has already been sent." }, { status: 409 });
      const currentDraft = auditedDraft;
      const startup = await getDiscoveryRepository().getStartup(currentDraft.startupId);
      if (!startup) return Response.json({ error: "The startup linked to this draft was not found." }, { status: 404 });
      const evidence = await getIntelligenceRepository().listEvidence(currentDraft.startupId);
      const editedClaims = detectEditedCompanyClaims(`${subject}. ${body}`, startup.name, currentDraft.detectedClaims);
      const claims = [...currentDraft.detectedClaims.filter((claim) => body.includes(claim.text)), ...editedClaims.filter((claim) => !currentDraft.detectedClaims.some((original) => original.text === claim.text))];
      const validation = validateOutreachClaims(claims, evidence);
      auditedDraft = await outreachRepository.updateValidatedContent(currentDraft.id, subject, body, to, validation);
      if (!validation.valid) return Response.json({ error: "This intelligence draft contains unsupported company claims. Revalidate it before sending.", unsupportedClaims: validation.unsupportedClaims }, { status: 422 });
    }

    const selfTest = sameGoogleMailbox(to, identity.email);
    const requestedTracking = payload.trackOpens !== false;
    const trackOpens = requestedTracking && !selfTest;
    if (requestedTracking && !selfTest && !trackingStorageReady()) {
      return Response.json({ error: "Open tracking storage is not connected yet. Connect Upstash Redis in Vercel or turn off open tracking for this email." }, { status: 503 });
    }
    sendFingerprint = emailSendFingerprint({ to, subject, body, attachment });
    const idempotencyKey = payload.outreachDraftId
      ? `outreach:${payload.outreachDraftId}`
      : request.headers.get("idempotency-key")?.trim() || `legacy:${sendFingerprint}`;
    const sendAttempt = await beginSendAttempt(identity.email, idempotencyKey, sendFingerprint);
    sendAttemptKey = sendAttempt.key;
    if (sendAttempt.state === "completed") return Response.json({ ...sendAttempt.result, idempotentReplay: true }, { headers: { "Cache-Control": "private, no-store" } });
    if (sendAttempt.state === "conflict") return Response.json({ error: "This idempotency key was already used for different email content." }, { status: 409 });
    if (sendAttempt.state === "processing") return Response.json({ error: "This email send is already in progress. Check Gmail Sent before retrying." }, { status: 409, headers: { "Retry-After": "30" } });
    trackingId = crypto.randomUUID();
    const trackedLinks = trackOpens
      ? extractHttpLinks(body).slice(0, 20).map((url, index) => ({ id: `link-${index + 1}`, url }))
      : [];
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
      trackedLinks,
    });
    const trackingPixel = trackOpens && trackingPrepared
      ? `<img src="${new URL(`/api/track/${trackingId}`, request.url).toString()}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0" />`
      : "";
    const trackedUrl = (url: string) => {
      const tracked = trackedLinks.find((item) => item.url === url);
      return tracked && trackingPrepared ? new URL(`/api/click/${trackingId}/${tracked.id}`, request.url).toString() : url;
    };
    const plainBody = trackedLinks.reduce((value, link) => value.replaceAll(link.url, trackedUrl(link.url)), markdownToPlain(body));

    const mixed = `signal-mixed-${crypto.randomUUID()}`;
    const alternative = `signal-alt-${crypto.randomUUID()}`;
    const encodedSubject = `=?UTF-8?B?${utf8Base64(subject)}?=`;
    const encodedFilename = `=?UTF-8?B?${utf8Base64(resumeName)}?=`;
    const mime = [
      `To: ${to}`,
      `Subject: ${encodedSubject}`,
      `Message-ID: <${crypto.randomUUID()}@aksh-outreach.local>`,
      `Date: ${new Date().toUTCString()}`,
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
      utf8Base64(plainBody),
      "",
      `--${alternative}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      utf8Base64(`<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#17201b">${markdownToHtml(body, trackedUrl)}${trackingPixel}</div>`),
      "",
      `--${alternative}--`,
      "",
      ...(hasAttachment ? [
        `--${mixed}`,
        `Content-Type: ${resumeType}; name="${encodedFilename}"`,
        `Content-Disposition: attachment; filename="${encodedFilename}"`,
        "Content-Transfer-Encoding: base64",
        "",
        attachment,
        "",
      ] : []),
      `--${mixed}--`,
    ].join("\r\n");

    gmailRequestStarted = true;
    structuredLog("info", "email.send_started", { requestId: operationId, actorId: opaqueId(identity.email), outreachId: auditedDraft?.id || null });
    let gmailResult: { id: string };
    try {
      gmailResult = await sendRawGmailMessage(identity.token, base64Url(mime));
    } catch (error) {
      if (!(error instanceof GmailApiError)) throw error;
      if (trackingPrepared) await removeTrackingRecord(trackingId);
      await releaseSendAttempt(sendAttemptKey);
      sendAttemptKey = "";
      gmailRequestStarted = false;
      return Response.json({ error: error.message }, { status: error.status });
    }
    let trackedRecord = null;
    let trackingWarning = selfTest
      ? "Email sent as a self-test. Open tracking was disabled because Gmail cannot distinguish your Sent-folder view from a recipient open."
      : "";
    if (trackingPrepared && gmailResult.id) {
      try {
        trackedRecord = await markTrackingRecordSent(trackingId, gmailResult.id);
      } catch (trackingError) {
        structuredLog("error", "email.tracking_finalize_failed", { requestId: operationId, errorType: errorName(trackingError) });
        trackingPrepared = false;
        trackingWarning = "The email was sent, but its analytics record could not be finalized.";
      }
    }
    if (auditedDraft) {
      try {
        const sentAt = trackedRecord?.sentAt || new Date().toISOString();
        await getOutreachRepository().markSent(auditedDraft.id, sentAt);
        const intelligenceRepository = getIntelligenceRepository();
        const [intelligence, evidence, opportunity] = await Promise.all([intelligenceRepository.getIntelligence(auditedDraft.startupId), intelligenceRepository.listEvidence(auditedDraft.startupId), getContributionRepository().get(auditedDraft.startupId, auditedDraft.opportunityId)]);
        if (intelligence && opportunity) {
          const scorecard = scoreStartupOpportunity({ intelligence, evidence });
          const round = intelligence.funding.latestRound.value;
          const team = intelligence.team.estimate;
          await getOutcomeRepository().save({
            id: crypto.randomUUID(), startupId: auditedDraft.startupId, outreachId: auditedDraft.id, trackingId: trackedRecord?.id || null, sentAt,
            replyStatus: "pending", replyClassification: null, followUpCount: 0, interview: false, technicalTask: false, referral: false, rejection: false, offer: false, notes: "",
            startupTier: scorecard.tier, fundingStage: round === "unknown" ? "unknown" : round.roundType, teamSize: team === "unknown" ? "unknown" : team.min === team.max ? String(team.min) : `${team.min}–${team.max}`,
            signalTypes: [...new Set(opportunity.evidence.map((item) => item.claim.split(".")[0]))], outreachMode: auditedDraft.mode, contributionType: opportunity.type, buildBeforeAsk: auditedDraft.mode !== "contribution", updatedAt: sentAt,
          });
        }
      } catch (auditError) {
        structuredLog("error", "email.outcome_finalize_failed", { requestId: operationId, outreachId: auditedDraft.id, errorType: errorName(auditError) });
        trackingWarning = trackingWarning || "The email was sent, but its intelligence outcome record could not be finalized.";
      }
    }
    const responsePayload = {
      id: gmailResult.id || null,
      trackingId: trackedRecord?.id || null,
      tracked: Boolean(trackedRecord?.trackingEnabled),
      selfTest,
      sentAt: trackedRecord?.sentAt || new Date().toISOString(),
      warning: trackingWarning || undefined,
    };
    await completeSendAttempt(sendAttemptKey, sendFingerprint, responsePayload);
    structuredLog("info", "email.sent", { requestId: operationId, actorId: opaqueId(identity.email), outreachId: auditedDraft?.id || null, tracked: Boolean(trackedRecord?.trackingEnabled), selfTest });
    return Response.json(responsePayload, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (trackingPrepared && trackingId) {
      try {
        await removeTrackingRecord(trackingId);
      } catch (cleanupError) {
        structuredLog("error", "email.tracking_cleanup_failed", { requestId: operationId, errorType: errorName(cleanupError) });
      }
    }
    if (sendAttemptKey && !gmailRequestStarted) {
      try { await releaseSendAttempt(sendAttemptKey); } catch { /* A short-lived lock is safer than a duplicate send. */ }
    }
    structuredLog("error", "email.send_failed", { requestId: operationId, errorType: errorName(error), deliveryUncertain: gmailRequestStarted });
    const message = gmailRequestStarted ? "Gmail delivery status is uncertain. Check Gmail Sent before retrying." : error instanceof Error ? error.message : "The email was not sent.";
    const status = error instanceof DiscoveryAccessError ? error.status : error instanceof DiscoveryRateLimitError ? 429 : gmailRequestStarted ? 502 : 400;
    return Response.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store", ...(status === 429 ? { "Retry-After": "60" } : {}) } });
  }
}
