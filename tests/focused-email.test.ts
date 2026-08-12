import assert from "node:assert/strict";
import test from "node:test";
import { composeFocusedOutreachEmail } from "../lib/outreach/focused-email.ts";

test("outreach points to the portfolio without listing completed projects", () => {
  const body = composeFocusedOutreachEmail({
    recipient: "Cy",
    companyName: "AegisAI",
    companyUrl: "https://aegisai.ai",
    companyObservation: "Your product focuses on agentic AI for email security.",
    pitch: "a prospect-facing assessment flow that demonstrates product value earlier and helps sales conversations move forward.",
    portfolioUrl: "https://akshhkaushik.github.io",
    highlightTerms: ["prospect-facing assessment flow", "sales conversations"],
    signature: "Best regards,\n\nAksh Kaushik",
  });

  assert.match(body, /currently building practical AI, product, and automation systems/i);
  assert.match(body, /\[portfolio]\(https:\/\/akshhkaushik\.github\.io\/?\)/i);
  assert.match(body, /One concrete thing I could build/i);
  assert.match(body, /sales conversations/i);
  assert.match(body, /attached my CV for context/i);
  assert.doesNotMatch(body, /I (?:have |have already )?built/i);
  assert.doesNotMatch(body, /CEO Voice|Veritas|EvoComb|GLOB/i);
});
