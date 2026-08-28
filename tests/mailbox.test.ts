import assert from "node:assert/strict";
import test from "node:test";
import { buildStartupOutreachRows, summarizeMailbox, type GmailMessage, type GmailThread } from "../lib/mailbox.ts";
import type { TrackingRecord } from "../lib/tracking.ts";

const AKSH = "akshhkaushik@gmail.com";

function message(input: {
  id: string;
  threadId: string;
  at: string;
  from: string;
  to: string;
  cc?: string;
  subject: string;
  sent?: boolean;
  snippet?: string;
}): GmailMessage {
  return {
    id: input.id,
    threadId: input.threadId,
    internalDate: String(Date.parse(input.at)),
    labelIds: input.sent ? ["SENT"] : ["INBOX"],
    snippet: input.snippet,
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: input.from },
        { name: "To", value: input.to },
        ...(input.cc ? [{ name: "Cc", value: input.cc }] : []),
        { name: "Subject", value: input.subject },
      ],
    },
  };
}

function tracking(overrides: Partial<TrackingRecord> = {}): TrackingRecord {
  return {
    id: "8fd10a7f-e37c-46cb-af11-b58c32d853c8",
    senderEmail: AKSH,
    recipientEmail: "founder@aegisai.com",
    recipientName: "Mira",
    companyName: "AegisAI",
    companyUrl: "https://aegisai.com",
    subject: "Solutions engineering at AegisAI",
    gmailMessageId: "tracked-sent",
    status: "sent",
    trackingEnabled: true,
    selfTest: false,
    sentAt: "2026-08-20T08:00:00.000Z",
    firstOpenedAt: "2026-08-20T09:00:00.000Z",
    lastOpenedAt: "2026-08-20T09:00:00.000Z",
    openCount: 1,
    opens: [{ observedAt: "2026-08-20T09:00:00.000Z", userAgent: "GmailImageProxy" }],
    clickCount: 0,
    clicks: [],
    trackedLinks: [],
    ...overrides,
  };
}

test("classifies a direct recipient reply as replied", () => {
  const thread: GmailThread = {
    id: "arthur-thread",
    messages: [
      message({ id: "arthur-sent", threadId: "arthur-thread", at: "2026-08-18T08:00:00Z", from: AKSH, to: "Arthur <arthur@dentalrobotics.ch>", subject: "Solutions engineering at Dental Robotics", sent: true }),
      message({ id: "arthur-reply", threadId: "arthur-thread", at: "2026-08-18T10:00:00Z", from: "Arthur <arthur@dentalrobotics.ch>", to: AKSH, subject: "Re: Solutions engineering at Dental Robotics" }),
    ],
  };

  const rows = buildStartupOutreachRows({ senderEmail: AKSH, sentThreads: [thread], bounceMessages: [], trackingRecords: [] });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].companyName, "Dental Robotics");
  assert.equal(rows[0].status, "replied");
  assert.equal(rows[0].openStatus, "unknown");
});

test("keeps reply and delivery failure separate for recipients in one thread", () => {
  const thread: GmailThread = {
    id: "superbryn-thread",
    messages: [
      message({ id: "superbryn-sent", threadId: "superbryn-thread", at: "2026-08-19T08:00:00Z", from: AKSH, to: "Parth Jain <parth@superbryn.com>", cc: "Hiring <hiring@superbryn.com>", subject: "Founder’s Office / Solutions Engineering — Aksh Kaushik", sent: true }),
      message({ id: "parth-reply", threadId: "superbryn-thread", at: "2026-08-19T09:00:00Z", from: "Parth Jain <parth@superbryn.com>", to: AKSH, subject: "Re: Founder’s Office / Solutions Engineering — Aksh Kaushik" }),
    ],
  };
  const bounce = message({
    id: "superbryn-bounce",
    threadId: "bounce-thread",
    at: "2026-08-19T08:05:00Z",
    from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
    to: AKSH,
    subject: "Delivery Status Notification (Failure)",
    snippet: "Your message wasn't delivered to hiring@superbryn.com because the address couldn't be found.",
  });

  const rows = buildStartupOutreachRows({ senderEmail: AKSH, sentThreads: [thread], bounceMessages: [bounce], trackingRecords: [] });
  const byRecipient = new Map(rows.map((row) => [row.recipientEmail, row]));

  assert.equal(byRecipient.get("parth@superbryn.com")?.status, "replied");
  assert.equal(byRecipient.get("hiring@superbryn.com")?.status, "delivery_failed");
  assert.equal(summarizeMailbox(rows).total, 2);
});

test("uses an observed platform tracking event for seen status", () => {
  const thread: GmailThread = {
    id: "tracked-thread",
    messages: [message({ id: "tracked-sent", threadId: "tracked-thread", at: "2026-08-20T08:00:00Z", from: AKSH, to: "Mira <founder@aegisai.com>", subject: "Solutions engineering at AegisAI", sent: true })],
  };

  const rows = buildStartupOutreachRows({ senderEmail: AKSH, sentThreads: [thread], bounceMessages: [], trackingRecords: [tracking()] });

  assert.equal(rows[0].status, "seen");
  assert.equal(rows[0].openStatus, "observed");
  assert.equal(rows[0].companyName, "AegisAI");
});

test("does not invent a seen signal for mail sent outside the platform", () => {
  const thread: GmailThread = {
    id: "manual-thread",
    messages: [message({ id: "manual-sent", threadId: "manual-thread", at: "2026-08-21T08:00:00Z", from: AKSH, to: "Founder <hello@newstartup.ai>", subject: "Engineering internship application", sent: true })],
  };

  const rows = buildStartupOutreachRows({ senderEmail: AKSH, sentThreads: [thread], bounceMessages: [], trackingRecords: [] });

  assert.equal(rows[0].status, "not_replied");
  assert.equal(rows[0].openStatus, "unknown");
  assert.equal(summarizeMailbox(rows).openUnknown, 1);
});
