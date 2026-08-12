type FocusedOutreachInput = {
  recipient: string;
  companyName: string;
  companyUrl: string;
  companyObservation: string;
  pitch: string;
  portfolioUrl?: string;
  highlightTerms?: string[];
  signature: string;
};

function clean(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function markdownLabel(value: string) {
  return value.replace(/[\[\]]/g, "").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(value: string, terms: string[]) {
  const formatted = clean(value).replace(/\s+([,.;:!?])/g, "$1");
  const uniqueTerms = [...new Set(terms.map(clean).filter((term) => term.length >= 3 && term.length <= 80))]
    .sort((left, right) => right.length - left.length)
    .slice(0, 6);
  if (uniqueTerms.length === 0) return formatted;
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${uniqueTerms.map(escapeRegExp).join("|")})(?=$|[^\\p{L}\\p{N}])`, "giu");
  return formatted.replace(pattern, "$1**$2**");
}

function safePortfolioUrl(value?: string) {
  try {
    const url = new URL(value || "https://akshhkaushik.github.io");
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "https://akshhkaushik.github.io/";
  } catch {
    return "https://akshhkaushik.github.io/";
  }
}

function focusedPitch(value: string, terms: string[]) {
  const idea = clean(value)
    .replace(/^I (?:wondered whether|was wondering (?:whether|if)) (?:it would be useful to )?/i, "")
    .replace(/^it would be useful to /i, "");
  return idea ? `One concrete thing I could build is ${highlight(idea, terms)}` : "";
}

export function composeFocusedOutreachEmail(input: FocusedOutreachInput) {
  const terms = input.highlightTerms || [];
  return [
    `Hi ${clean(input.recipient)},`,
    `I’m Aksh Kaushik, a third-year student at BITS Pilani. I came across **[${markdownLabel(input.companyName)}](${input.companyUrl})** while researching the company.`,
    highlight(input.companyObservation, terms),
    focusedPitch(input.pitch, terms),
    `I’m currently building practical AI, product, and automation systems; you can see the broader direction of my work in my **[portfolio](${safePortfolioUrl(input.portfolioUrl)})**. I’ve attached my CV for context.`,
    "If this direction is relevant, I’d be grateful for a brief conversation to understand the real constraint and see whether a small prototype could be useful.",
    input.signature,
  ].filter(Boolean).join("\n\n");
}
