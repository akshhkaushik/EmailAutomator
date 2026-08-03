import { getVercelOidcToken } from "@vercel/oidc";
import { PERSONAL_RESEARCH_SUMMARY, RESEARCHED_PROJECTS, STARTUP_CAPABILITIES } from "@/lib/personal-profile";

type Profile = {
  name?: string;
  role?: string;
  context?: string;
  portfolio?: string;
  linkedin?: string;
  projects?: Array<{
    id?: string;
    title?: string;
    description?: string;
    liveUrl?: string;
    repoUrl?: string;
  }>;
  template?: string;
};

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
const PERSONAL_EMAIL_HOSTS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "outlook.com", "hotmail.com",
  "live.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "aol.com", "hey.com",
  "example.com",
]);

const EMAIL_SIGNATURE = [
  "Best regards,",
  "",
  "Aksh Kaushik",
  "",
  "BITS Pilani",
  "",
  "GitHub: https://github.com/akshhkaushik",
  "",
  "LinkedIn: https://www.linkedin.com/in/aksh-kaushik-047187317/",
  "",
  "Portfolio: https://akshhkaushik.github.io",
  "",
  "Email: f20240903@pilani.bits-pilani.ac.in",
].join("\n");

const FIXED_PORTFOLIO_TITLES = new Set(["CEO Voice Platform", "Veritas", "EvoComb", "GLOB"]);

const FIXED_PORTFOLIO_BLOCK = [
  "Over the past year, I’ve spent most of my time building AI and data systems intended for real use rather than only demonstrations. A few examples I’d be grateful to share are:",
  "**[CEO Voice Platform](https://ceo-voice-platform-two.vercel.app/)** — an end-to-end system for recreating a leader’s writing style using hybrid RAG, structured retrieval, evaluation pipelines, constraint-preserving re-voicing, and production-oriented backend architecture.",
  "**[Veritas](https://veritas-virid.vercel.app/)** — an AI-powered real-time fact-checking platform with FastAPI, vector search, graph databases, retrieval pipelines, browser-extension support, and mobile support.",
  "I’ve also been developing **Geospatial Intelligence Platforms** that combine satellite imagery, environmental indicators, sensor networks, and open geospatial datasets for urban analytics and sustainability research. One example is **[EvoComb — Environmental Stress Index for Delhi NCR](https://evo-comb-web.vercel.app/)**.",
  "Alongside that, I build **Interactive Geospatial Visualization Experiences** that make complex spatial data easier to explore. **[GLOB](https://glob.akshh.workers.dev/)** is one example, using modern web technologies to turn spatial datasets into an intuitive interactive experience.",
].join("\n\n");

function contributionSubject(companyName: string) {
  return `I’d love to contribute to ${cleanGeneratedText(companyName)}`;
}

function personalIntroduction(companyName: string, companyUrl: string) {
  return `I’m Aksh Kaushik, a third-year student at BITS Pilani. I recently came across **[${markdownLabel(companyName)}](${companyUrl})**, and its work genuinely caught my attention.`;
}

function normalizeUrl(input: unknown) {
  if (typeof input !== "string") throw new Error("Enter a valid company website.");
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("The company website must use http or https.");
  const host = url.hostname.toLowerCase();
  if (
    BLOCKED_HOSTS.has(host) ||
    host.endsWith(".local") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) throw new Error("That website address is not allowed.");
  return url;
}

function resolveCompanyUrl(input: unknown, recipientEmail: string) {
  if (typeof input === "string" && input.trim()) {
    return { url: normalizeUrl(input.trim()), inferred: false };
  }
  const domain = recipientEmail.split("@")[1]?.toLowerCase();
  if (!domain || PERSONAL_EMAIL_HOSTS.has(domain)) {
    throw new Error("This recipient uses a personal email address, so the company cannot be identified automatically. Add the optional company website override.");
  }
  return { url: normalizeUrl(`https://${domain}`), inferred: true };
}

function textFromHtml(html: string, limit = 22_000) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function decodeHtml(value: string) {
  const decodeCodePoint = (code: string, radix: number) => {
    const numeric = Number.parseInt(code, radix);
    return Number.isInteger(numeric) && numeric >= 0 && numeric <= 0x10ffff
      ? String.fromCodePoint(numeric)
      : " ";
  };
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code: string) => decodeCodePoint(code, 10))
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) => decodeCodePoint(code, 16))
    .replace(/\s+/g, " ")
    .trim();
}

function htmlAttribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match ? decodeHtml(match[2]) : "";
}

function metadataFromHtml(html: string) {
  const facts: string[] = [];
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) facts.push(`Page title: ${decodeHtml(title)}`);

  const usefulMetadata = new Set([
    "description", "application-name", "keywords",
    "og:title", "og:description", "og:site_name",
    "twitter:title", "twitter:description",
  ]);
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (htmlAttribute(tag, "name") || htmlAttribute(tag, "property")).toLowerCase();
    const content = htmlAttribute(tag, "content");
    if (usefulMetadata.has(key) && content) facts.push(`${key}: ${content}`);
  }
  return [...new Set(facts)].join("\n").slice(0, 8_000);
}

function researchTextFromHtml(html: string, limit = 22_000) {
  const looksLikeHtml = /<(?:html|head|body|main|section|article|meta)\b/i.test(html);
  if (!looksLikeHtml) {
    return html
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, limit);
  }
  const metadata = metadataFromHtml(html);
  const visibleText = textFromHtml(html, limit);
  return [metadata, visibleText && !metadata.includes(visibleText) ? visibleText : ""]
    .filter(Boolean)
    .join("\n")
    .slice(0, limit);
}

const RESEARCH_PATH_HINTS = [
  "product", "platform", "solution", "feature", "about", "company", "customer", "career", "job", "blog",
];

function researchLinks(html: string, baseUrl: URL) {
  const candidates = new Map<string, number>();
  const discoveredLinks = [
    ...html.matchAll(/href=["']([^"'#]+)["']/gi),
    ...html.matchAll(/\[[^\]]*\]\((https?:\/\/[^\s)#]+)[^)]*\)/gi),
  ];
  for (const match of discoveredLinks) {
    try {
      const url = new URL(match[1], baseUrl);
      if (url.origin !== baseUrl.origin || !["http:", "https:"].includes(url.protocol)) continue;
      if (/\.(?:pdf|png|jpe?g|gif|svg|webp|zip|xml|json)$/i.test(url.pathname)) continue;
      url.hash = "";
      url.search = "";
      const normalized = url.toString();
      if (normalized === baseUrl.toString()) continue;
      const path = url.pathname.toLowerCase();
      const score = RESEARCH_PATH_HINTS.reduce(
        (total, hint, index) => total + (path.includes(hint) ? RESEARCH_PATH_HINTS.length - index : 0),
        0,
      );
      if (score > 0) candidates.set(normalized, Math.max(score, candidates.get(normalized) || 0));
    } catch {
      // Ignore malformed or unsupported links from the target page.
    }
  }
  return [...candidates.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([url]) => url);
}

const BROWSER_FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
};

function blockedPageText(value: string) {
  const sample = value.slice(0, 5_000).toLowerCase();
  return sample.length < 3_500 && [
    "access denied", "attention required", "checking your browser", "enable javascript and cookies",
    "just a moment", "security check required", "verify you are human", "target url returned error 403",
  ].some((phrase) => sample.includes(phrase));
}

async function safeFetch(url: string, headers: Record<string, string>, timeout: number) {
  let current = normalizeUrl(url);
  for (let redirectCount = 0; redirectCount <= 4; redirectCount += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      headers,
      signal: AbortSignal.timeout(timeout),
    });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    current = normalizeUrl(new URL(location, current).toString());
  }
  throw new Error("Website redirected too many times.");
}

function readerHeaders() {
  const headers: Record<string, string> = {
    Accept: "text/plain",
    "X-Respond-With": "markdown",
    "X-Max-Tokens": "2500",
    "X-Retain-Images": "none",
    "X-Retain-Links": "all",
  };
  if (process.env.JINA_API_KEY) headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;
  return headers;
}

async function fetchWithReader(target: URL) {
  const readerUrl = `https://r.jina.ai/${target.toString()}`;
  const response = await fetch(readerUrl, {
    headers: readerHeaders(),
    signal: AbortSignal.timeout(14_000),
  });
  const text = await response.text();
  if (!response.ok || text.length < 80 || blockedPageText(text)) {
    throw new Error(`Public reader returned ${response.status}.`);
  }
  return { url: target.toString(), html: text, recovered: true };
}

async function fetchSearchContext(target: URL) {
  const query = `site:${target.hostname} ${target.hostname} product company about`;
  const response = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, {
    headers: readerHeaders(),
    signal: AbortSignal.timeout(14_000),
  });
  const text = await response.text();
  if (!response.ok || text.length < 80 || blockedPageText(text)) {
    throw new Error(`Public search returned ${response.status}.`);
  }
  return {
    url: target.toString(),
    html: `Public web results for ${target.hostname}:\n${text}`,
    recovered: true,
  };
}

async function fetchResearchPage(url: string, allowSearchFallback = false) {
  const target = normalizeUrl(url);
  try {
    const response = await safeFetch(target.toString(), BROWSER_FETCH_HEADERS, 8_000);
    const html = await response.text();
    if (!response.ok) throw new Error(`Website page returned ${response.status}.`);
    if (html.length < 80 || blockedPageText(textFromHtml(html, 5_000))) {
      throw new Error("Website returned a bot-check page instead of readable content.");
    }
    return { url: response.url || target.toString(), html, recovered: false };
  } catch (directError) {
    try {
      return await fetchWithReader(target);
    } catch {
      if (allowSearchFallback) return fetchSearchContext(target);
      throw directError;
    }
  }
}

function cleanGeneratedText(value: string) {
  return value.replace(/[\[\]*_]/g, "").replace(/\s+/g, " ").trim();
}

function cleanGeneratedTextWithoutUrls(value: string) {
  return cleanGeneratedText(value)
    .replace(/(?:\(\s*)?https?:\/\/[^\s)]+(?:\s*\))?/gi, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function markdownLabel(value: string) {
  return value.replace(/[\[\]]/g, "").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightTerms(value: string, terms: string[]) {
  const formatted = cleanGeneratedText(value).replace(/\s+([,.;:!?])/g, "$1");
  const uniqueTerms = [...new Set(terms
    .map((term) => cleanGeneratedText(term))
    .filter((term) => term.length >= 3 && term.length <= 80))]
    .sort((left, right) => right.length - left.length)
    .slice(0, 6);

  if (uniqueTerms.length === 0) return formatted;
  const alternatives = uniqueTerms.map(escapeRegExp).join("|");
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${alternatives})(?=$|[^\\p{L}\\p{N}])`, "giu");
  return formatted.replace(pattern, "$1**$2**");
}

function humblePitch(value: string, terms: string[]) {
  const directIdea = cleanGeneratedText(value)
    .replace(/^I (?:wondered whether|was wondering (?:whether|if)) (?:it would be useful to )?/i, "")
    .replace(/^it would be useful to /i, "");
  const pitch = highlightTerms(directIdea, terms);
  return pitch ? `I may be missing some context, but one small idea I wondered about is this: ${pitch}` : "";
}

function uniqueSenderWork(value: string, terms: string[]) {
  const cleaned = cleanGeneratedText(value);
  if (/\b(?:BITS Pilani|third-year|CEO Voice Platform|Veritas|EvoComb|GLOB)\b/i.test(cleaned)) return "";
  return highlightTerms(cleaned, terms);
}

function extractOutputText(response: {
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}) {
  return response.output
    ?.flatMap((item) => item.content || [])
    .find((part) => part.type === "output_text")?.text;
}

function extractGeminiText(response: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}) {
  return response.candidates
    ?.flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join("")
    .trim();
}

const RESEARCH_SIGNAL_WORDS = [
  "product", "platform", "customer", "user", "workflow", "feature", "service", "team",
  "business", "developer", "data", "automation", "intelligence", "security", "analytics",
  "integration", "infrastructure", "mission", "help", "build", "manage", "create",
];

const LOW_INFORMATION_PATTERNS = [
  /^(?:home|about|contact|pricing|careers?|blog|sign in|log in|menu|privacy|terms)$/i,
  /(?:accept all cookies|cookie preferences|all rights reserved)/i,
];

function researchSentences(text: string) {
  const seen = new Set<string>();
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.replace(/^SOURCE:\s*/i, "").replace(/\s+/g, " ").trim())
    .filter((sentence) => {
      const key = sentence.toLowerCase();
      if (sentence.length < 45 || sentence.length > 520 || seen.has(key)) return false;
      if (LOW_INFORMATION_PATTERNS.some((pattern) => pattern.test(sentence))) return false;
      seen.add(key);
      return true;
    });
}

function sentenceScore(sentence: string, index: number) {
  const lower = sentence.toLowerCase();
  const signals = RESEARCH_SIGNAL_WORDS.reduce(
    (score, word) => score + (lower.includes(word) ? 2 : 0),
    0,
  );
  const specificity = /\b(?:AI|API|B2B|SaaS|ML|enterprise|mobile|software|application)\b/i.test(sentence) ? 3 : 0;
  return signals + specificity + Math.max(0, 5 - Math.floor(index / 3));
}

function compactResearch(pages: Array<{ url: string; text: string }>, limit = 9_000) {
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

function meaningfulWords(value: string) {
  const stopWords = new Set([
    "about", "after", "also", "and", "are", "been", "being", "build", "company", "could",
    "from", "have", "into", "more", "only", "other", "platform", "product", "that", "their",
    "this", "through", "using", "with", "your",
  ]);
  return new Set((value.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || [])
    .filter((word) => !stopWords.has(word)));
}

function promptProjects(
  projects: ReturnType<typeof validProjects>,
  websiteText: string,
) {
  const companyWords = meaningfulWords(websiteText);
  return projects
    .map((project, index) => {
      const projectWords = meaningfulWords(`${project.title} ${project.description}`);
      const overlap = [...projectWords].reduce((score, word) => score + (companyWords.has(word) ? 1 : 0), 0);
      const maturityBoost = /Evidence level: (?:live|substantial)/.test(project.description) ? 3 : 0;
      return { project, index, score: overlap + maturityBoost };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 6)
    .map(({ project }) => ({
      title: project.title,
      description: project.description.slice(0, 260),
      liveUrl: project.liveUrl,
      repoUrl: project.repoUrl,
    }));
}

function companyNameFromResearch(companyUrl: URL, websiteText: string) {
  const metadataName = websiteText.match(/(?:og:site_name|application-name):\s*([^\n.!?]{2,80})/i)?.[1];
  const titleName = websiteText.match(/(?:Page title|Title):\s*([^|—–\n]{2,80})/i)?.[1];
  const hostName = companyUrl.hostname.replace(/^www\./, "").split(".")[0];
  return cleanGeneratedText(metadataName || titleName || hostName)
    .replace(/\s+(?:description|og:title|og:description|twitter:title|url source):.*$/i, "")
    .replace(/\s+(?:-|—|–|\|)\s+.*$/, "")
    .replace(/\s+(?:home|official site)$/i, "")
    .slice(0, 80) || "the team";
}

function cleanResearchEvidence(value: string) {
  const description = value.match(
    /(?:^|\s)(?:description|og:description|twitter:description):\s*(.*?)(?=\s+(?:og:title|og:description|twitter:title|twitter:description|url source):|$)/i,
  )?.[1];
  return cleanGeneratedText(description || value)
    .replace(/^(?:Page title|Title|og:title|twitter:title):\s*/i, "")
    .replace(/\s+(?:description|og:title|og:description|twitter:title|twitter:description|url source):.*$/i, "")
    .trim();
}

function localContribution(companyText: string) {
  const lower = companyText.toLowerCase();
  if (/learn|education|course|student|knowledge/.test(lower)) {
    return {
      idea: "a lightweight learning-progress view that shows where a learner is confident, where they paused, and the next useful concept to revisit",
      terms: ["learning-progress view", "next useful concept"],
    };
  }
  if (/health|clinical|patient|medical|care/.test(lower)) {
    return {
      idea: "a small evidence-and-review panel that keeps generated guidance traceable and gives a human a clear approval step before it reaches users",
      terms: ["evidence-and-review panel", "human approval step"],
    };
  }
  if (/developer|api|infrastructure|workflow|automation/.test(lower)) {
    return {
      idea: "a compact workflow-health view that surfaces failed steps, retry context, and the most useful next action for an operator",
      terms: ["workflow-health view", "retry context"],
    };
  }
  if (/finance|payment|bank|credit|accounting|compliance/.test(lower)) {
    return {
      idea: "a narrow review queue that explains why an item needs attention, preserves its evidence trail, and makes the final human decision easier to audit",
      terms: ["review queue", "evidence trail"],
    };
  }
  if (/map|geo|climate|environment|satellite|location/.test(lower)) {
    return {
      idea: "a focused comparison layer that lets users inspect changes across locations or time while keeping the underlying source visible",
      terms: ["comparison layer", "underlying source"],
    };
  }
  return {
    idea: "a small feedback-and-insight panel that captures where users hesitate, groups recurring friction, and gives the team a clearer next improvement to test",
    terms: ["feedback-and-insight panel", "recurring friction"],
  };
}

function researchedFallbackDraft(
  companyUrl: URL,
  recipientName: string,
  profile: Profile,
  pages: Array<{ url: string; text: string }>,
  projects: ReturnType<typeof validProjects>,
) {
  const websiteText = compactResearch(pages, 8_000);
  const companyName = companyNameFromResearch(companyUrl, websiteText);
  const evidenceCandidates = researchSentences(websiteText)
    .map((sentence, index) => ({ sentence, index, score: sentenceScore(sentence, index) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ sentence }) => cleanResearchEvidence(sentence))
    .filter((sentence) => sentence.length >= 35);
  const evidence = [...new Set(evidenceCandidates)].slice(0, 3);
  const observation = evidence[0] || `The way ${companyName} presents its product and user experience stood out to me.`;
  const contribution = localContribution(websiteText);
  const matched = promptProjects(projects, websiteText).slice(0, 1).map((project) => ({
    ...project,
    reason: "This felt like the closest example of work relevant to the company’s visible product direction.",
  }));
  return {
    companyUrl: companyUrl.origin,
    companyName,
    companySummary: evidence.slice(0, 2).join(" ") || `Research was extracted directly from ${companyUrl.hostname}.`,
    evidence: evidence.length > 0 ? evidence : [`Company source: ${companyUrl.origin}`],
    contributionIdeas: [contribution.idea],
    selectedProjects: matched,
    subject: contributionSubject(companyName),
    body: composeEmail({
      recipient: recipientName || "there",
      companyName,
      companyUrl: companyUrl.origin,
      companyObservation: `What stood out to me was this: ${observation}`,
      senderWork: profile.context || "I enjoy turning ambiguous product problems into practical, inspectable systems.",
      pitch: contribution.idea,
      highlightTerms: contribution.terms,
      selectedProjects: matched,
    }),
    demo: true,
    source: "local-research",
  };
}

function validProjects(profile: Profile) {
  const researched = RESEARCHED_PROJECTS.map((project) => ({
    title: project.title,
    description: `${project.description} Startup relevance: ${project.startupValue} Evidence level: ${project.maturity}.`,
    liveUrl: project.liveUrl,
    repoUrl: project.repoUrl,
  }));
  const seen = new Set<string>();
  return [...(profile.projects || []), ...researched].flatMap((project) => {
    if (!project.title?.trim() || !project.liveUrl?.trim()) return [];
    try {
      const live = new URL(project.liveUrl);
      if (!["http:", "https:"].includes(live.protocol)) return [];
      let repoUrl = "";
      if (project.repoUrl?.trim()) {
        const repo = new URL(project.repoUrl);
        if (["http:", "https:"].includes(repo.protocol)) repoUrl = repo.toString();
      }
      const key = `${project.title.trim().toLowerCase()}|${live.toString()}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{
        title: project.title.trim().slice(0, 100),
        description: (project.description || "").trim().slice(0, 600),
        liveUrl: live.toString(),
        repoUrl,
      }];
    } catch {
      return [];
    }
  }).slice(0, 40);
}

function projectLinks(projects: Array<{ title: string; liveUrl: string; repoUrl: string; reason: string }>) {
  if (projects.length === 0) return "I’d be glad to share relevant work samples.";
  return projects.map((project) =>
    `Another relevant example is **[${markdownLabel(project.title)}](${project.liveUrl})** — ${cleanGeneratedTextWithoutUrls(project.reason)}`,
  ).join("\n");
}

function composeEmail(input: {
  recipient: string;
  companyName: string;
  companyUrl: string;
  companyObservation: string;
  senderWork: string;
  pitch: string;
  highlightTerms?: string[];
  selectedProjects: Array<{ title: string; liveUrl: string; repoUrl: string; reason: string }>;
}) {
  const paragraphs = [
    `Hi ${cleanGeneratedText(input.recipient)},`,
    personalIntroduction(input.companyName, input.companyUrl),
    highlightTerms(input.companyObservation, input.highlightTerms || []),
    uniqueSenderWork(input.senderWork, input.highlightTerms || []),
    FIXED_PORTFOLIO_BLOCK,
  ];
  const additionalProjects = input.selectedProjects.filter((project) => !FIXED_PORTFOLIO_TITLES.has(project.title));
  if (additionalProjects.length > 0) {
    paragraphs.push(projectLinks(additionalProjects));
  }
  paragraphs.push(
    humblePitch(input.pitch, input.highlightTerms || []),
    "If any of this feels useful, I’d be grateful for the chance to learn more about your priorities and explore whether I could contribute to the team.",
  );
  if (!/(?:résumé|resume)/i.test(paragraphs.join(" "))) {
    paragraphs.push("I’ve attached my résumé for context.");
  }
  paragraphs.push(EMAIL_SIGNATURE);
  return paragraphs.filter(Boolean).join("\n\n");
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as {
      companyUrl?: string;
      recipientEmail?: string;
      recipientName?: string;
      profile?: Profile;
    };
    if (!payload.recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.recipientEmail)) {
      return Response.json({ error: "Enter a valid recipient email." }, { status: 400 });
    }
    const resolvedCompany = resolveCompanyUrl(payload.companyUrl, payload.recipientEmail);
    let companyUrl = resolvedCompany.url;
    const profile = payload.profile || {};
    const paidFallbacksEnabled = process.env.ENABLE_PAID_AI_FALLBACKS === "true";
    let gatewayToken = paidFallbacksEnabled
      ? process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN
      : undefined;
    if (paidFallbacksEnabled && !gatewayToken && process.env.VERCEL) {
      try {
        gatewayToken = await getVercelOidcToken();
      } catch {
        gatewayToken = undefined;
      }
    }
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = paidFallbacksEnabled ? process.env.OPENAI_API_KEY : undefined;
    const projects = validProjects(profile);

    let homePage;
    try {
      homePage = await fetchResearchPage(companyUrl.toString(), true);
    } catch (error) {
      if (!resolvedCompany.inferred || companyUrl.hostname.startsWith("www.")) throw error;
      companyUrl = normalizeUrl(`https://www.${companyUrl.hostname}`);
      homePage = await fetchResearchPage(companyUrl.toString(), true);
    }
    const researchBase = normalizeUrl(homePage.url);
    const seedPages = [homePage];
    if (researchBase.pathname !== "/" || researchBase.search) {
      try {
        const rootPage = await fetchResearchPage(researchBase.origin);
        if (rootPage.url !== homePage.url || rootPage.html !== homePage.html) seedPages.push(rootPage);
      } catch {
        // The supplied route is still usable when the root homepage cannot be fetched.
      }
    }
    const linkedCandidates = [...new Set(seedPages.flatMap((page) =>
      researchLinks(page.html, normalizeUrl(page.url)),
    ))].slice(0, 3);
    const linkedPages = await Promise.allSettled(
      linkedCandidates.map((url) => fetchResearchPage(url)),
    );
    const pageCandidates = [
      ...seedPages.map((page) => ({ url: page.url, text: researchTextFromHtml(page.html) })),
      ...linkedPages.flatMap((result) => result.status === "fulfilled"
        ? [{ url: result.value.url, text: researchTextFromHtml(result.value.html, 16_000) }]
        : []),
    ];
    const seenResearchText = new Set<string>();
    const pages = pageCandidates.filter((page) => {
      if (page.text.length < 80 || seenResearchText.has(page.text)) return false;
      seenResearchText.add(page.text);
      return true;
    });
    if (pages.length === 0) throw new Error("The company website did not contain enough readable information.");
    const websiteText = compactResearch(pages);
    const compactProjects = promptProjects(projects, websiteText);

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        companyName: { type: "string" },
        companySummary: { type: "string" },
        evidence: {
          type: "array",
          items: { type: "string", description: "A concrete fact tied to a named product, workflow, audience, or initiative in the supplied sources." },
          minItems: 2,
          maxItems: 4,
        },
        contributionIdeas: {
          type: "array",
          items: { type: "string", description: "A small, specific feature, improvement, or experiment the sender could realistically deliver as an initial contribution." },
          minItems: 2,
          maxItems: 4,
        },
        highlightTerms: {
          type: "array",
          items: {
            type: "string",
            description: "An exact, meaningful 2-6 word phrase copied from companyObservation, senderWork, or pitch that deserves bold emphasis. Choose product names, technical capabilities, and the concrete feature idea; never choose whole sentences or generic phrases.",
          },
          minItems: 3,
          maxItems: 6,
        },
        selectedProjects: {
          type: "array",
          minItems: 0,
          maxItems: 2,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              liveUrl: { type: "string" },
              repoUrl: { type: "string" },
              reason: { type: "string" },
            },
            required: ["title", "liveUrl", "repoUrl", "reason"],
          },
        },
        companyObservation: {
          type: "string",
          description: "Two humble, specific sentences showing a concrete understanding of a real company product, audience, workflow, or priority and why that direction feels meaningful. Avoid exaggerated praise.",
        },
        senderWork: {
          type: "string",
          description: "At most one brief sentence preserving any unique sender fact or intention from the required core email content that is not already covered by the fixed introduction and fixed portfolio block. Do not repeat BITS Pilani, CEO Voice Platform, Veritas, EvoComb, or GLOB.",
        },
        pitch: {
          type: "string",
          description: "State exactly one small, narrowly scoped feature or improvement the sender could prototype in a few days, who it helps, and the practical benefit. State the idea directly without an introductory hedge because the application adds a humble preface.",
        },
      },
      required: ["companyName", "companySummary", "evidence", "contributionIdeas", "highlightTerms", "selectedProjects", "companyObservation", "senderWork", "pitch"],
    };

    const aiRequest = {
      store: false,
      instructions:
        "Write humble, evidence-based startup outreach. The app adds Aksh's BITS Pilani introduction, four fixed linked projects (CEO Voice Platform, Veritas, EvoComb, GLOB), a humble pitch preface, closing, and signature; never repeat them. From supplied sources, identify what the company builds, who it helps, and one visible priority. Add a specific observation and exactly one feature that one engineer could prototype in a few days, naming its user and benefit. Preserve only unique sender context. Every company claim must be traceable to the sources. Never invent metrics, customers, funding, technologies, referral sources, names, roles, or YC affiliation. Select at most two pre-ranked projects, copying titles and URLs exactly. Return 3-6 exact short highlight terms from your prose. No URLs in prose fields. Avoid hype, pressure, generic praise, and repeated calls to action.",
      input: `Company URL: ${companyUrl.toString()}\nRecipient: ${payload.recipientName || "unknown"}\nSender role: ${profile.role || "Product-minded software engineer"}\nSender context: ${(profile.context || PERSONAL_RESEARCH_SUMMARY).slice(0, 1_000)}\nCORE EMAIL PREFERENCE: ${(profile.template || "Ask humbly to contribute to and learn from the team.").slice(0, 800)}\n\nRELEVANT CAPABILITIES:\n- ${STARTUP_CAPABILITIES.slice(0, 5).join("\n- ")}\n\nPRE-RANKED PROJECTS: ${JSON.stringify(compactProjects)}\n\nCOMPRESSED WEBSITE RESEARCH:\n${websiteText}`,
      text: { format: { type: "json_schema", name: "outreach_draft", strict: true, schema } },
      max_output_tokens: 1_200,
    };

    let outputText = "";
    const providerErrors: string[] = [];

    if (geminiKey) {
      const geminiModels = [...new Set([
        process.env.GEMINI_LOW_COST_MODEL || "gemini-3.5-flash-lite",
        ...(process.env.GEMINI_MODELS || "").split(",").map((model) => model.trim()).filter(Boolean),
        "gemini-2.5-flash-lite",
        process.env.GEMINI_MODEL || "",
      ].filter(Boolean))].slice(0, 3);

      for (const geminiModel of geminiModels) {
        try {
          const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": geminiKey,
              },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: aiRequest.instructions }] },
                contents: [{ role: "user", parts: [{ text: aiRequest.input }] }],
                generationConfig: {
                  responseMimeType: "application/json",
                  responseJsonSchema: schema,
                  maxOutputTokens: 1_200,
                },
              }),
            },
          );
          const geminiJson = await geminiResponse.json() as {
            error?: { message?: string };
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          };
          if (geminiResponse.ok) {
            outputText = extractGeminiText(geminiJson) || "";
            if (outputText) break;
          } else {
            providerErrors.push(`Gemini ${geminiModel}: ${geminiJson.error?.message || "request failed"}`);
          }
        } catch (error) {
          providerErrors.push(`Gemini ${geminiModel}: ${error instanceof Error ? error.message : "request failed"}`);
        }
      }
    }

    if (!outputText && gatewayToken) {
      try {
        const gatewayResponse = await fetch("https://ai-gateway.vercel.sh/v1/responses", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${gatewayToken}` },
          body: JSON.stringify({ ...aiRequest, model: process.env.AI_MODEL || "openai/gpt-5.4" }),
        });
        const gatewayJson = await gatewayResponse.json() as {
          error?: { message?: string };
          output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
        };
        if (gatewayResponse.ok) outputText = extractOutputText(gatewayJson) || "";
        else providerErrors.push(`AI Gateway: ${gatewayJson.error?.message || "request failed"}`);
      } catch (error) {
        providerErrors.push(`AI Gateway: ${error instanceof Error ? error.message : "request failed"}`);
      }
    }

    if (!outputText && openaiKey) {
      try {
        const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
          body: JSON.stringify({ ...aiRequest, model: process.env.OPENAI_MODEL || "gpt-5.4" }),
        });
        const openaiJson = await openaiResponse.json() as {
          error?: { message?: string };
          output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
        };
        if (openaiResponse.ok) outputText = extractOutputText(openaiJson) || "";
        else providerErrors.push(`OpenAI: ${openaiJson.error?.message || "request failed"}`);
      } catch (error) {
        providerErrors.push(`OpenAI: ${error instanceof Error ? error.message : "request failed"}`);
      }
    }

    if (!outputText) {
      if (providerErrors.length > 0) console.warn("AI providers unavailable; using local research fallback.", providerErrors);
      return Response.json(researchedFallbackDraft(researchBase, payload.recipientName || "", profile, pages, projects));
    }
    let result: {
      companyName: string;
      companySummary: string;
      evidence: string[];
      contributionIdeas: string[];
      highlightTerms: string[];
      selectedProjects: Array<{ title: string; liveUrl: string; repoUrl: string; reason: string }>;
      companyObservation: string;
      senderWork: string;
      pitch: string;
    };
    try {
      result = JSON.parse(outputText) as typeof result;
    } catch {
      console.warn("AI provider returned invalid JSON; using local research fallback.");
      return Response.json(researchedFallbackDraft(researchBase, payload.recipientName || "", profile, pages, projects));
    }
    const allowedProjects = new Map(projects.map((project) => [project.liveUrl, project]));
    let selectedProjects = result.selectedProjects.flatMap((project) => {
      const allowed = allowedProjects.get(project.liveUrl);
      if (!allowed || allowed.title !== project.title) return [];
      return [{ ...allowed, reason: project.reason }];
    }).slice(0, 2);
    if (selectedProjects.length === 0 && projects.length > 0) {
      selectedProjects = [{
        ...projects[0],
        reason: "A relevant example of the sender’s product and engineering work.",
      }];
    }
    return Response.json({
      companyUrl: researchBase.origin,
      companyName: result.companyName,
      companySummary: result.companySummary,
      evidence: result.evidence,
      contributionIdeas: result.contributionIdeas,
      selectedProjects,
      subject: contributionSubject(result.companyName),
      body: composeEmail({
        recipient: payload.recipientName || "there",
        companyName: result.companyName,
        companyUrl: researchBase.origin,
        companyObservation: result.companyObservation,
        senderWork: result.senderWork,
        pitch: result.pitch,
        highlightTerms: result.highlightTerms,
        selectedProjects,
      }),
      source: "ai",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not research this company.";
    return Response.json({ error: message }, { status: 400 });
  }
}
