function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
}

function linkify(value: string) {
  return escapeHtml(value)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#235f46">$1</a>')
    .replace(/\n/g, "<br>");
}

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
  try {
    const auth = request.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) return Response.json({ error: "Connect Gmail before sending." }, { status: 401 });
    const payload = await request.json() as {
      to?: string;
      subject?: string;
      body?: string;
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
      utf8Base64(body),
      "",
      `--${alternative}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      utf8Base64(`<div style="font-family:Arial,sans-serif;line-height:1.65;color:#17201b">${linkify(body)}</div>`),
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
      const message = gmailResponse.status === 401
        ? "Your Gmail permission expired. Reconnect Gmail and try again."
        : gmailResult.error?.message || "Gmail rejected the message.";
      return Response.json({ error: message }, { status: gmailResponse.status });
    }
    return Response.json({ id: gmailResult.id });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The email was not sent." }, { status: 400 });
  }
}
