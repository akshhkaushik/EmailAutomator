import type { TrackingRecord } from "./tracking.ts";

export type GmailHeader = { name?: string; value?: string };
export type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string };
  parts?: GmailPart[];
};
export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
};
export type GmailThread = { id: string; messages?: GmailMessage[] };

export type OutreachStatus = "replied" | "seen" | "not_replied" | "delivery_failed";
export type OpenStatus = "observed" | "not_observed" | "unknown";

export type StartupOutreachRow = {
  id: string;
  threadId: string;
  companyName: string;
  recipientName: string;
  recipientEmail: string;
  subject: string;
  sentAt: string;
  lastActivityAt: string;
  status: OutreachStatus;
  openStatus: OpenStatus;
  firstOpenedAt: string | null;
  repliedAt: string | null;
  bounceAt: string | null;
  bounceReason: string;
  tracked: boolean;
  sentCount: number;
  messageCount: number;
};

export type MailboxSummary = {
  total: number;
  replied: number;
  seen: number;
  notReplied: number;
  deliveryFailed: number;
  openUnknown: number;
};

export class GmailMailboxError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function decodeBase64Url(value: string) {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
  } catch {
    return "";
  }
}

function partText(part: GmailPart | undefined): string {
  if (!part) return "";
  const own = part.body?.data && /^text\/(plain|html)$/i.test(part.mimeType || "") ? decodeBase64Url(part.body.data) : "";
  const nested = (part.parts || []).map(partText).join(" ");
  return `${own} ${nested}`.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ");
}

function messageText(message: GmailMessage) {
  return `${header(message, "subject")} ${message.snippet || ""} ${partText(message.payload)}`.replace(/\s+/g, " ").trim();
}

export function parseMailboxAddressList(value: string) {
  const addresses: Array<{ name: string; email: string }> = [];
  const expression = /(?:(?:"([^"]+)"|([^<>,]+?))\s*)?<([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>|([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
  for (const match of value.matchAll(expression)) {
    const email = (match[3] || match[4] || "").trim().toLowerCase();
    if (!email || addresses.some((item) => item.email === email)) continue;
    const name = (match[1] || match[2] || "").replace(/^['"]|['"]$/g, "").trim();
    addresses.push({ name, email });
  }
  return addresses;
}

function messageDate(message: GmailMessage) {
  const milliseconds = Number(message.internalDate || 0);
  return Number.isFinite(milliseconds) && milliseconds > 0 ? new Date(milliseconds).toISOString() : new Date(0).toISOString();
}

function isSent(message: GmailMessage) {
  return message.labelIds?.includes("SENT") || false;
}

function isDeliveryFailure(message: GmailMessage) {
  const sender = header(message, "from").toLowerCase();
  const subject = header(message, "subject").toLowerCase();
  const text = messageText(message).toLowerCase();
  return sender.includes("mailer-daemon") || sender.includes("postmaster") || sender.includes("mail delivery subsystem") || subject.includes("delivery status notification") || text.includes("address not found") || text.includes("undeliverable");
}

function extractFailedRecipient(message: GmailMessage) {
  const text = messageText(message);
  const patterns = [
    /wasn['’]t delivered to\s+([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
    /delivery to the following recipient failed[^A-Z0-9._%+-]*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
    /(?:final-recipient|original-recipient)[^;]*;\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].toLowerCase();
  }
  return null;
}

function bounceReason(message: GmailMessage) {
  const text = messageText(message).replace(/\s+/g, " ").trim();
  const addressNotFound = text.match(/Address not found[\s\S]{0,240}/i)?.[0];
  if (addressNotFound) return addressNotFound.replace(/\s+(LEARN MORE|The response was:).*$/i, "").trim();
  const smtp = text.match(/(?:550|554)\s+[245]\.[0-9.]+[^.]{0,220}/i)?.[0];
  return (smtp || "Gmail reported that this address could not receive the message.").slice(0, 260);
}

function filenames(part: GmailPart | undefined): string[] {
  if (!part) return [];
  return [part.filename || "", ...(part.parts || []).flatMap(filenames)].filter(Boolean);
}

function looksLikeOutreach(message: GmailMessage, tracked: boolean) {
  if (tracked) return true;
  const subject = header(message, "subject");
  const text = messageText(message);
  const attachments = filenames(message.payload).join(" ");
  return /(application|intern|engineer|founder|office|opportun|role|contribut|joining|career|job|hiring|work with|collaborat|solutions)/i.test(subject)
    || /(github|portfolio|bits pilani|resume|curriculum vitae|proof of work)/i.test(text)
    || /(?:cv|resume).*\.(?:pdf|docx?)$/i.test(attachments);
}

function titleCase(value: string) {
  return value.split(/\s+/).filter(Boolean).map((word) => word.length <= 3 ? word.toUpperCase() : `${word[0].toUpperCase()}${word.slice(1)}`).join(" ");
}

const PUBLIC_MAIL_DOMAINS = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "proton.me", "protonmail.com"]);

function inferCompanyName(email: string, recipientName: string) {
  const [local = "", domain = ""] = email.split("@");
  if (domain && !PUBLIC_MAIL_DOMAINS.has(domain)) {
    const base = domain.split(".")[0].replace(/[-_]+/g, " ").replace(/(ventures|systems|technologies|technology|labs|robotics|capital)$/i, " $1");
    return titleCase(base);
  }
  if (recipientName) return recipientName;
  return titleCase(local.replace(/[._+-]+/g, " ").replace(/\d+$/g, "")) || email;
}

function trackingFor(message: GmailMessage, recipientEmail: string, records: TrackingRecord[]) {
  const subject = header(message, "subject").trim().toLowerCase();
  return records.find((record) => record.gmailMessageId === message.id && record.recipientEmail.toLowerCase() === recipientEmail)
    || records.find((record) => record.recipientEmail.toLowerCase() === recipientEmail && record.subject.trim().toLowerCase() === subject)
    || null;
}

export function buildStartupOutreachRows(input: {
  senderEmail: string;
  sentThreads: GmailThread[];
  bounceMessages: GmailMessage[];
  trackingRecords: TrackingRecord[];
}) {
  const senderEmail = input.senderEmail.toLowerCase();
  const bouncedByRecipient = new Map<string, GmailMessage>();
  for (const message of input.bounceMessages.filter(isDeliveryFailure)) {
    const recipient = extractFailedRecipient(message);
    const previous = recipient ? bouncedByRecipient.get(recipient) : null;
    if (recipient && (!previous || messageDate(message) > messageDate(previous))) bouncedByRecipient.set(recipient, message);
  }

  const rows: StartupOutreachRow[] = [];
  for (const thread of input.sentThreads) {
    const messages = [...(thread.messages || [])].sort((first, second) => Number(first.internalDate || 0) - Number(second.internalDate || 0));
    const sentMessages = messages.filter(isSent);
    const firstSent = sentMessages[0];
    if (!firstSent) continue;
    const recipients = [...parseMailboxAddressList(header(firstSent, "to")), ...parseMailboxAddressList(header(firstSent, "cc"))]
      .filter((recipient, index, all) => recipient.email !== senderEmail && all.findIndex((item) => item.email === recipient.email) === index);
    if (recipients.length === 0) continue;

    for (const recipient of recipients) {
      const trackedRecord = trackingFor(firstSent, recipient.email, input.trackingRecords);
      if (!looksLikeOutreach(firstSent, Boolean(trackedRecord))) continue;
      const sentAt = messageDate(firstSent);
      const reply = messages.find((message) => {
        if (isSent(message) || isDeliveryFailure(message) || messageDate(message) < sentAt) return false;
        return parseMailboxAddressList(header(message, "from")).some((sender) => sender.email === recipient.email);
      });
      const bounce = bouncedByRecipient.get(recipient.email) || messages.find((message) => isDeliveryFailure(message) && extractFailedRecipient(message) === recipient.email) || null;
      const openStatus: OpenStatus = trackedRecord?.firstOpenedAt ? "observed" : trackedRecord?.trackingEnabled ? "not_observed" : "unknown";
      const status: OutreachStatus = bounce ? "delivery_failed" : reply ? "replied" : openStatus === "observed" ? "seen" : "not_replied";
      const dates = messages.map(messageDate).concat(bounce ? [messageDate(bounce)] : []);
      rows.push({
        id: `${thread.id}:${recipient.email}`,
        threadId: thread.id,
        companyName: trackedRecord?.companyName || inferCompanyName(recipient.email, recipient.name),
        recipientName: trackedRecord?.recipientName || recipient.name,
        recipientEmail: recipient.email,
        subject: header(firstSent, "subject") || trackedRecord?.subject || "No subject",
        sentAt,
        lastActivityAt: dates.sort().at(-1) || sentAt,
        status,
        openStatus,
        firstOpenedAt: trackedRecord?.firstOpenedAt || null,
        repliedAt: reply ? messageDate(reply) : null,
        bounceAt: bounce ? messageDate(bounce) : null,
        bounceReason: bounce ? bounceReason(bounce) : "",
        tracked: Boolean(trackedRecord),
        sentCount: sentMessages.length,
        messageCount: messages.length + (bounce && !messages.some((message) => message.id === bounce.id) ? 1 : 0),
      });
    }
  }
  return rows.sort((first, second) => second.lastActivityAt.localeCompare(first.lastActivityAt));
}

export function summarizeMailbox(rows: StartupOutreachRow[]): MailboxSummary {
  return {
    total: rows.length,
    replied: rows.filter((row) => row.status === "replied").length,
    seen: rows.filter((row) => row.status === "seen").length,
    notReplied: rows.filter((row) => row.status === "not_replied").length,
    deliveryFailed: rows.filter((row) => row.status === "delivery_failed").length,
    openUnknown: rows.filter((row) => row.openStatus === "unknown").length,
  };
}

async function gmailJson<T>(url: string, token: string, fetcher: typeof fetch): Promise<T> {
  const response = await fetcher(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: { message?: string } };
    const permissionError = response.status === 403 || /scope|permission/i.test(data.error?.message || "");
    throw new GmailMailboxError(permissionError ? "Reconnect Gmail and grant read-only mailbox access to build the outreach list." : "Gmail could not load the outreach mailbox.", permissionError ? 403 : response.status);
  }
  return response.json() as Promise<T>;
}

async function mapLimit<T, R>(items: T[], limit: number, operation: (item: T) => Promise<R>) {
  const results: R[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await operation(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function loadStartupMailbox(token: string, fetcher: typeof fetch = fetch) {
  const base = "https://gmail.googleapis.com/gmail/v1/users/me";
  const sentQuery = encodeURIComponent("in:sent newer_than:365d");
  const bounceQuery = encodeURIComponent('newer_than:365d {from:mailer-daemon@googlemail.com from:mailer-daemon@gmail.com subject:"Delivery Status Notification"}');
  const [sentList, bounceList] = await Promise.all([
    gmailJson<{ messages?: Array<{ id: string; threadId: string }> }>(`${base}/messages?maxResults=500&q=${sentQuery}`, token, fetcher),
    gmailJson<{ messages?: Array<{ id: string; threadId: string }> }>(`${base}/messages?maxResults=200&q=${bounceQuery}`, token, fetcher),
  ]);
  const threadIds = [...new Set((sentList.messages || []).map((message) => message.threadId))].slice(0, 500);
  const bounceIds = [...new Set((bounceList.messages || []).map((message) => message.id))].slice(0, 200);
  const [threads, bounceMessages] = await Promise.all([
    mapLimit(threadIds, 8, (threadId) => gmailJson<GmailThread>(`${base}/threads/${encodeURIComponent(threadId)}?format=full`, token, fetcher)),
    mapLimit(bounceIds, 8, (messageId) => gmailJson<GmailMessage>(`${base}/messages/${encodeURIComponent(messageId)}?format=full`, token, fetcher)),
  ]);
  return { threads, bounceMessages };
}
