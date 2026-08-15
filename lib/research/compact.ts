export type ResearchPage = { url: string; text: string };

const RESEARCH_SIGNAL_WORDS = [
  "product", "platform", "customer", "user", "workflow", "feature", "service", "team",
  "business", "developer", "data", "automation", "intelligence", "security", "analytics",
  "integration", "infrastructure", "mission", "help", "build", "manage", "create",
];

const LOW_INFORMATION_PATTERNS = [
  /^(?:home|about|contact|pricing|careers?|blog|sign in|log in|menu|privacy|terms)$/i,
  /(?:accept all cookies|cookie preferences|all rights reserved)/i,
];

export function researchSentences(text: string) {
  const seen = new Set<string>();
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.replace(/^SOURCE:\s*/i, "").replace(/\s+/g, " ").trim())
    .filter((sentence) => {
      const key = sentence.toLowerCase();
      // Accelerator profiles often describe a company with one short, useful tagline.
      if (sentence.length < 20 || sentence.length > 520 || seen.has(key)) return false;
      if (LOW_INFORMATION_PATTERNS.some((pattern) => pattern.test(sentence))) return false;
      seen.add(key);
      return true;
    });
}

export function sentenceScore(sentence: string, index: number) {
  const lower = sentence.toLowerCase();
  const signals = RESEARCH_SIGNAL_WORDS.reduce(
    (score, word) => score + (lower.includes(word) ? 2 : 0),
    0,
  );
  const specificity = /\b(?:AI|API|B2B|SaaS|ML|enterprise|mobile|software|application)\b/i.test(sentence) ? 3 : 0;
  return signals + specificity + Math.max(0, 5 - Math.floor(index / 3));
}

export function compactResearch(pages: ResearchPage[], limit = 9_000) {
  const sections = pages.slice(0, 4).map((page) => {
    const sentences = researchSentences(page.text)
      .map((sentence, index) => ({ sentence, index, score: sentenceScore(sentence, index) }))
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, 12)
      .sort((left, right) => left.index - right.index)
      .map(({ sentence }) => sentence);
    return `SOURCE: ${page.url}\n${sentences.join(" ")}`;
  });
  return sections.join("\n\n").slice(0, limit);
}
