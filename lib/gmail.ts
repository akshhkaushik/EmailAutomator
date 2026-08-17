export class GmailApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export async function sendRawGmailMessage(accessToken: string, raw: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
    signal: AbortSignal.timeout(15_000),
  });
  let result: { id?: string; error?: { message?: string } } = {};
  try { result = await response.json() as typeof result; } catch { /* Gmail may return an empty proxy error. */ }
  if (!response.ok) {
    const message = response.status === 401
      ? "Your Gmail permission expired. Reconnect Gmail and try again."
      : result.error?.message || "Gmail rejected the message.";
    throw new GmailApiError(response.status, message);
  }
  if (!result.id) throw new GmailApiError(502, "Gmail accepted the request without returning a message ID.");
  return { id: result.id };
}
