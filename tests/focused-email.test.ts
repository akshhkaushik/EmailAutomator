import assert from "node:assert/strict";
import test from "node:test";
import { coldEmailFormatMetrics, composeFocusedOutreachEmail, focusedOutreachSubject } from "../lib/outreach/focused-email.ts";

test("outreach points to the portfolio without listing completed projects", () => {
  const body = composeFocusedOutreachEmail({
    recipient: "Cy",
    companyName: "AegisAI",
    companyUrl: "https://aegisai.ai",
    companyObservation: "Your product focuses on agentic AI for email security.",
    pitch: "a prospect-facing assessment flow that demonstrates product value earlier and helps sales conversations move forward.",
    portfolioUrl: "https://akshhkaushik.github.io",
    signature: "Best regards,\n\nAksh Kaushik",
  });

  assert.match(body, /building practical AI and product systems/i);
  assert.match(body, /\[portfolio]\(https:\/\/akshhkaushik\.github\.io\/?\)/i);
  assert.match(body, /I could build/i);
  assert.match(body, /sales conversations/i);
  assert.match(body, /attached my CV/i);
  assert.match(body, /take ownership, work responsibly/i);
  assert.match(body, /stay accountable for delivery/i);
  assert.match(body, /Would it help if I sent over a short outline/i);
  assert.doesNotMatch(body, /I (?:have |have already )?built/i);
  assert.doesNotMatch(body, /CEO Voice|Veritas|EvoComb|GLOB/i);
  const format = coldEmailFormatMetrics(focusedOutreachSubject("AegisAI Security Labs"), body);
  assert.equal(format.subjectWords, 4);
  assert.ok(format.contentWords >= 50 && format.contentWords <= 100);
  assert.equal(format.questions, 1);
  assert.doesNotMatch(body, /\*\*/);
});

test("normalizes repeated AI lead-ins and company names into natural prose", () => {
  const subject = focusedOutreachSubject("100ms");
  const body = composeFocusedOutreachEmail({
    recipient: "Kshitij Gupta",
    companyName: "100ms",
    companyUrl: "https://100ms.live",
    companyObservation: "100ms offers developer-friendly SDKs and interactivity APIs for embedding real-time video and audio into applications.",
    pitch: "I could build a lightweight developer dashboard widget for monitoring live room events and API status, reducing troubleshooting time.",
    portfolioUrl: "https://akshhkaushik.github.io",
    signature: "Best,\n\nAksh Kaushik",
  });

  assert.match(body, /While looking into \[100ms].*I noticed it offers developer-friendly SDKs/i);
  assert.match(body, /I could build a lightweight developer dashboard widget/i);
  assert.doesNotMatch(body, /I could build I could build/i);
  assert.doesNotMatch(body, /100ms.*100ms offers/i);
  const format = coldEmailFormatMetrics(subject, body);
  assert.ok(format.contentWords >= 50 && format.contentWords <= 100);
  assert.equal(format.questions, 1);
});
