type FocusedOutreachInput = {
  recipient: string;
  companyName: string;
  companyUrl: string;
  companyObservation: string;
  pitch: string;
  portfolioUrl?: string;
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

function clipWords(value: string, limit: number) {
  const words = clean(value).split(" ").filter(Boolean);
  return words.length <= limit ? words.join(" ") : `${words.slice(0, limit).join(" ").replace(/[,;:]$/, "")}.`;
}

function sentence(value: string) {
  const result = clean(value).replace(/\s+([,.;:!?])/g, "$1");
  return result && !/[.!?]$/.test(result) ? `${result}.` : result;
}

function safePortfolioUrl(value?: string) {
  try {
    const url = new URL(value || "https://akshhkaushik.github.io");
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "https://akshhkaushik.github.io/";
  } catch {
    return "https://akshhkaushik.github.io/";
  }
}

function focusedPitch(value: string) {
  const idea = clean(value)
    .replace(/^I (?:wondered whether|was wondering (?:whether|if)) (?:it would be useful to )?/i, "")
    .replace(/^One concrete thing I could build is /i, "")
    .replace(/^I (?:could|can|would|want to|would like to) build\s+/i, "")
    .replace(/^Build\s+/i, "")
    .replace(/^it would be useful to /i, "");
  return idea ? sentence(`I could build ${clipWords(idea, 24)}`) : "";
}

function conciseObservation(value: string, companyName: string) {
  const company = escapeRegExp(clean(companyName));
  const observation = clean(value)
    .replace(/^What stood out to me was this:\s*/i, "")
    .replace(/^I (?:noticed|saw) (?:that )?/i, "")
    .replace(new RegExp(`^${company}'s\\s+`, "i"), "its ")
    .replace(new RegExp(`^${company}\\s+`, "i"), "it ")
    .replace(/^Your\s+/i, "its ")
    .replace(/^The company\s+/i, "it ")
    .replace(/^(It|Its|The|A|An)\b/, (word) => word.toLowerCase());
  return sentence(clipWords(observation, 22));
}

function shortCompanyName(value: string) {
  return clean(value).split(" ").filter(Boolean).slice(0, 2).join(" ") || "Startup";
}

export function focusedOutreachSubject(companyName: string) {
  return `${shortCompanyName(companyName)} product idea`;
}

export function focusedProofSubject(companyName: string) {
  return `${shortCompanyName(companyName)} prototype`;
}

export function coldEmailFormatMetrics(subject: string, body: string) {
  const count = (value: string) => value
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/gi, " ")
    .match(/[\p{L}\p{N}’'-]+/gu)?.length || 0;
  return {
    subjectWords: count(subject),
    contentWords: count(body.split(/\nBest(?: regards)?,/i)[0]),
    questions: (body.match(/\?/g) || []).length,
  };
}

export function composeFocusedOutreachEmail(input: FocusedOutreachInput) {
  return [
    `Hi ${clean(input.recipient)},`,
    `While looking into [${markdownLabel(input.companyName)}](${input.companyUrl}), I noticed ${conciseObservation(input.companyObservation, input.companyName)}`,
    focusedPitch(input.pitch),
    `I’m Aksh, a third-year BITS Pilani student building practical AI and product systems. I take ownership, work responsibly, communicate clearly, and stay accountable for delivery. My [portfolio](${safePortfolioUrl(input.portfolioUrl)}) has more context; I’ve attached my CV.`,
    "Would it help if I sent over a short outline of how I’d approach this?",
    input.signature,
  ].filter(Boolean).join("\n\n");
}
