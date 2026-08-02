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

const RESEARCH_PATH_HINTS = [
  "product", "platform", "solution", "feature", "about", "company", "customer", "career", "job", "blog",
];

function researchLinks(html: string, baseUrl: URL) {
  const candidates = new Map<string, number>();
  for (const match of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
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

async function fetchResearchPage(url: string) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "SignalOutreachResearch/1.0" },
    signal: AbortSignal.timeout(9_000),
  });
  if (!response.ok) throw new Error(`Website page returned ${response.status}.`);
  return { url: response.url, html: await response.text() };
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
  const formatted = cleanGeneratedText(value);
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

function linkCompany(value: string, companyName: string, companyUrl: string) {
  const cleaned = cleanGeneratedText(value);
  const safeName = markdownLabel(companyName);
  if (!safeName) return cleaned;
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegExp(safeName)})(?=$|[^\\p{L}\\p{N}])`, "iu");
  if (pattern.test(cleaned)) {
    pattern.lastIndex = 0;
    return cleaned.replace(pattern, `$1**[$2](${companyUrl})**`);
  }
  return `Regarding **[${safeName}](${companyUrl})**: ${cleaned}`;
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

function fallbackDraft(companyUrl: URL, recipientName: string, profile: Profile) {
  const company = companyUrl.hostname.replace(/^www\./, "").split(".")[0];
  const companyName = company.charAt(0).toUpperCase() + company.slice(1);
  const detail = `the product direction and customer experience visible across ${companyUrl.hostname}`;
  const contribution = profile.context || "building useful, polished product experiences and automating repetitive work";
  const selectedProjects = validProjects(profile).slice(0, 2).map((project) => ({
    ...project,
    reason: "Included as a concrete example of relevant product work.",
  }));
  return {
    companyUrl: companyUrl.origin,
    companyName,
    companySummary: `A preview research summary for ${companyUrl.hostname}. Live website analysis activates when Gemini, AI Gateway, or an OpenAI fallback is configured.`,
    evidence: [
      `Company source: ${companyUrl.origin}`,
      "The live research service is not configured yet, so no unverified company claims were added.",
    ],
    contributionIdeas: [
      contribution,
      `Explore a small proof of concept aligned with your ${profile.role || "target role"}.`,
    ],
    selectedProjects,
    subject: `A contribution idea for ${companyName}`,
    body: composeEmail({
      recipient: recipientName || "there",
      companyName,
      companyUrl: companyUrl.origin,
      opening: `I spent some time looking through ${companyName} and wanted to reach out directly.`,
      companyObservation: `What stood out was ${detail}.`,
      senderWork: profile.context || "I build practical product experiences and workflow automation.",
      pitch: `As a small first contribution, I could help with ${contribution}.`,
      projectBridge: "One relevant example of how I work is below.",
      closing: "If that direction is useful, I would love to compare notes and explore contributing to the team.",
      highlightTerms: ["small first contribution", "proof of concept", profile.role || "target role"],
      selectedProjects,
      profile,
    }),
    demo: true,
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
  return projects.map((project) => {
    const source = project.repoUrl && project.repoUrl !== project.liveUrl ? ` ([source code](${project.repoUrl}))` : "";
    return `My work on **[${markdownLabel(project.title)}](${project.liveUrl})**${source} is directly relevant here — ${cleanGeneratedTextWithoutUrls(project.reason)}`;
  }).join("\n");
}

function composeEmail(input: {
  recipient: string;
  companyName: string;
  companyUrl: string;
  opening: string;
  companyObservation: string;
  senderWork: string;
  pitch: string;
  projectBridge: string;
  closing: string;
  highlightTerms?: string[];
  selectedProjects: Array<{ title: string; liveUrl: string; repoUrl: string; reason: string }>;
  profile: Profile;
}) {
  const { profile } = input;
  const paragraphs = [
    `Hi ${cleanGeneratedText(input.recipient)},`,
    linkCompany(input.opening, input.companyName, input.companyUrl),
    highlightTerms(input.companyObservation, input.highlightTerms || []),
    highlightTerms(input.senderWork, input.highlightTerms || []),
  ];
  if (input.selectedProjects.length > 0) {
    paragraphs.push(cleanGeneratedTextWithoutUrls(input.projectBridge), projectLinks(input.selectedProjects));
  }
  paragraphs.push(
    highlightTerms(input.pitch, input.highlightTerms || []),
    cleanGeneratedText(input.closing),
  );
  if (!/(?:résumé|resume)/i.test(paragraphs.join(" "))) {
    paragraphs.push("I’ve attached my résumé for context.");
  }
  paragraphs.push(`Best,\n${cleanGeneratedText(profile.name || "Your name")}`);
  const links = [
    profile.portfolio && `[Portfolio](${profile.portfolio})`,
    profile.linkedin && `[LinkedIn](${profile.linkedin})`,
  ].filter(Boolean);
  if (links.length) paragraphs.push(links.join(" · "));
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
    let gatewayToken = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
    if (!gatewayToken && process.env.VERCEL) {
      try {
        gatewayToken = await getVercelOidcToken();
      } catch {
        gatewayToken = undefined;
      }
    }
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!gatewayToken && !geminiKey && !openaiKey) {
      return Response.json(fallbackDraft(companyUrl, payload.recipientName || "", profile));
    }
    const projects = validProjects(profile);

    let homePage;
    try {
      homePage = await fetchResearchPage(companyUrl.toString());
    } catch (error) {
      if (!resolvedCompany.inferred || companyUrl.hostname.startsWith("www.")) throw error;
      companyUrl = normalizeUrl(`https://www.${companyUrl.hostname}`);
      homePage = await fetchResearchPage(companyUrl.toString());
    }
    const researchBase = normalizeUrl(homePage.url);
    const linkedPages = await Promise.allSettled(
      researchLinks(homePage.html, researchBase).map((url) => fetchResearchPage(url)),
    );
    const pages = [
      { url: homePage.url, text: textFromHtml(homePage.html) },
      ...linkedPages.flatMap((result) => result.status === "fulfilled"
        ? [{ url: result.value.url, text: textFromHtml(result.value.html, 16_000) }]
        : []),
    ].filter((page) => page.text.length >= 120);
    if (pages.length === 0) throw new Error("The company website did not contain enough readable information.");
    const websiteText = pages
      .map((page) => `SOURCE: ${page.url}\n${page.text}`)
      .join("\n\n")
      .slice(0, 65_000);

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
        subject: { type: "string", description: "A natural 4-9 word subject mentioning a specific company product, focus, or useful contribution idea." },
        opening: {
          type: "string",
          description: "One natural opening sentence specific to why the sender is contacting this company. Mention the exact companyName once so the application can embed its website link. Do not use generic praise and do not include a greeting.",
        },
        companyObservation: {
          type: "string",
          description: "One or two complete sentences showing a concrete understanding of a real company product, audience, workflow, or priority.",
        },
        senderWork: {
          type: "string",
          description: "One or two natural sentences presenting the sender's work, strengths, credentials, and reason for reaching out. Preserve every concrete fact and important intention from the required core email content and sender context, but adapt the wording to this company. Do not discuss the proposed company feature here.",
        },
        pitch: {
          type: "string",
          description: "One or two complete sentences proposing exactly one small, narrowly scoped company feature or improvement the sender could prototype in a few days, who it helps, and the practical benefit. Do not propose a new platform, broad toolkit, or multi-feature product.",
        },
        projectBridge: {
          type: "string",
          description: "One short sentence naturally connecting the selected work sample to the proposed contribution. Do not repeat its URL.",
        },
        closing: {
          type: "string",
          description: "A natural, low-pressure call to action asking to contribute, discuss the idea, or join the team. Do not include a sign-off or sender name.",
        },
      },
      required: ["companyName", "companySummary", "evidence", "contributionIdeas", "highlightTerms", "selectedProjects", "subject", "opening", "companyObservation", "senderWork", "pitch", "projectBridge", "closing"],
    };

    const aiRequest = {
      store: false,
      instructions:
        "You are a product-minded researcher and excellent job-outreach writer. Write one cohesive email with two equally important parts: (1) the sender's established story and work, which must appear in every email, and (2) one company-specific, small feature idea they could contribute. First infer what the company actually builds, who it serves, and one current product or operational priority from the supplied sources. Compare that need against the supplied researched capability profile and complete project catalog; do not ask the sender to supply project details. Preserve every concrete sender fact, credential, work example, capability, intention, and ask from the REQUIRED CORE EMAIL CONTENT and sender context. You may rewrite and reorder that material naturally, but you must not omit it. Then propose exactly one narrowly scoped feature, improvement, or proof of concept that one engineer could prototype in a few days. It must be a single feature, not a new platform, broad toolkit, boilerplate suite, or sweeping strategy. Name the user or workflow it helps and the practical benefit. Every company claim must be traceable to the supplied website text. Never invent metrics, customers, funding, technologies, names, or open roles. Do not use generic praise such as 'impressed', 'incredible', 'innovative', or 'revolutionary'. Avoid vague language such as 'enhance the user experience', 'drive innovation', or 'contribute across engineering' unless followed by a specific deliverable. Select one strongest matching project by default; select a second only when it proves a clearly different capability essential to the pitch. Prefer live and substantial projects. Use prototypes only for a direct match and describe their maturity honestly. Never present learning repositories as production products. Copy selected project titles and URLs exactly; never invent or alter a project or URL. Mention the exact companyName once in opening. Return 3-6 highlightTerms copied exactly from the drafted prose: short product names, technical capabilities, or the concrete proposed feature—not generic phrases and never complete sentences. Do not place URLs in opening, observation, senderWork, pitch, projectBridge, or closing—the application embeds validated links separately. Keep the complete email concise enough for cold outreach, ideally 180-240 words before the sign-off. Avoid flattery, hype, and pressure.",
      input: `Company URL: ${companyUrl.toString()}\nRecipient: ${payload.recipientName || "unknown"}\nSender role: ${profile.role || "Product-minded software engineer"}\nSender context (required in substance): ${profile.context || PERSONAL_RESEARCH_SUMMARY}\nREQUIRED CORE EMAIL CONTENT (preserve all meaningful sender information; wording may adapt): ${profile.template || "Use the researched personal profile and ask to contribute to and join the team."}\n\nRESEARCHED PERSONAL PROFILE:\n${PERSONAL_RESEARCH_SUMMARY}\n\nSTARTUP CAPABILITY MAP:\n- ${STARTUP_CAPABILITIES.join("\n- ")}\n\nCOMPLETE ORIGINAL PROJECT CATALOG (use exact titles and URLs): ${JSON.stringify(projects)}\n\nWebsite text:\n${websiteText}`,
      text: { format: { type: "json_schema", name: "outreach_draft", strict: true, schema } },
    };

    let outputText = "";
    const providerErrors: string[] = [];

    if (gatewayToken) {
      const gatewayResponse = await fetch("https://ai-gateway.vercel.sh/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${gatewayToken}` },
        body: JSON.stringify({
          ...aiRequest,
          model: process.env.AI_MODEL || "openai/gpt-5.4",
        }),
      });
      const gatewayJson = await gatewayResponse.json() as {
        error?: { message?: string };
        output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
      };
      if (gatewayResponse.ok) outputText = extractOutputText(gatewayJson) || "";
      else providerErrors.push(`AI Gateway: ${gatewayJson.error?.message || "request failed"}`);
    }

    if (!outputText && geminiKey) {
      const geminiModel = process.env.GEMINI_MODEL || "gemini-3.5-flash";
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": geminiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: aiRequest.instructions }],
            },
            contents: [{
              role: "user",
              parts: [{ text: aiRequest.input }],
            }],
            generationConfig: {
              responseMimeType: "application/json",
              responseJsonSchema: schema,
            },
          }),
        },
      );
      const geminiJson = await geminiResponse.json() as {
        error?: { message?: string };
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      if (geminiResponse.ok) outputText = extractGeminiText(geminiJson) || "";
      else providerErrors.push(`Gemini: ${geminiJson.error?.message || "request failed"}`);
    }

    if (!outputText && openaiKey) {
      const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({
          ...aiRequest,
          model: process.env.OPENAI_MODEL || "gpt-5.4",
        }),
      });
      const openaiJson = await openaiResponse.json() as {
        error?: { message?: string };
        output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
      };
      if (openaiResponse.ok) outputText = extractOutputText(openaiJson) || "";
      else providerErrors.push(`OpenAI: ${openaiJson.error?.message || "request failed"}`);
    }

    if (!outputText) {
      throw new Error(providerErrors.join(" ") || "The research service returned an empty draft.");
    }
    const result = JSON.parse(outputText) as {
      companyName: string;
      companySummary: string;
      evidence: string[];
      contributionIdeas: string[];
      highlightTerms: string[];
      selectedProjects: Array<{ title: string; liveUrl: string; repoUrl: string; reason: string }>;
      subject: string;
      opening: string;
      companyObservation: string;
      senderWork: string;
      pitch: string;
      projectBridge: string;
      closing: string;
    };
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
      subject: result.subject,
      body: composeEmail({
        recipient: payload.recipientName || "there",
        companyName: result.companyName,
        companyUrl: researchBase.origin,
        opening: result.opening,
        companyObservation: result.companyObservation,
        senderWork: result.senderWork,
        pitch: result.pitch,
        projectBridge: result.projectBridge,
        closing: result.closing,
        highlightTerms: result.highlightTerms,
        selectedProjects,
        profile,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not research this company.";
    return Response.json({ error: message }, { status: 400 });
  }
}
