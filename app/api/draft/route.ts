import { getVercelOidcToken } from "@vercel/oidc";

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

function textFromHtml(html: string) {
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
    .slice(0, 70_000);
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
    companyName,
    companySummary: `A preview research summary for ${companyUrl.hostname}. Live website analysis activates when AI Gateway or an OpenAI fallback is configured.`,
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
    body: renderTemplate(profile.template, {
      recipient: recipientName || "there",
      company: companyName,
      company_detail: detail,
      contribution,
      projects: projectLinks(selectedProjects),
      name: profile.name || "Your name",
    }, profile),
    demo: true,
  };
}

function validProjects(profile: Profile) {
  return (profile.projects || []).flatMap((project) => {
    if (!project.title?.trim() || !project.liveUrl?.trim()) return [];
    try {
      const live = new URL(project.liveUrl);
      if (!["http:", "https:"].includes(live.protocol)) return [];
      let repoUrl = "";
      if (project.repoUrl?.trim()) {
        const repo = new URL(project.repoUrl);
        if (["http:", "https:"].includes(repo.protocol)) repoUrl = repo.toString();
      }
      return [{
        title: project.title.trim().slice(0, 100),
        description: (project.description || "").trim().slice(0, 600),
        liveUrl: live.toString(),
        repoUrl,
      }];
    } catch {
      return [];
    }
  }).slice(0, 12);
}

function projectLinks(projects: Array<{ title: string; liveUrl: string; repoUrl: string; reason: string }>) {
  if (projects.length === 0) return "I’d be glad to share relevant work samples.";
  return projects.map((project) => {
    const source = project.repoUrl ? ` · [Source code](${project.repoUrl})` : "";
    return `- [${project.title}](${project.liveUrl})${source} — ${project.reason}`;
  }).join("\n");
}

function renderTemplate(
  template: string | undefined,
  values: Record<string, string>,
  profile: Profile,
) {
  const defaultTemplate = "Hi {{recipient}},\n\nI was impressed by {{company_detail}} at {{company}}.\n\nI’d love to contribute. I could help with {{contribution}}.\n\nI’ve attached my résumé and would be glad to share a few concrete ideas.\n\nBest,\n{{name}}";
  let body = template || defaultTemplate;
  for (const [key, value] of Object.entries(values)) {
    body = body.replaceAll(`{{${key}}}`, value);
  }
  const links = [profile.portfolio && `Portfolio: ${profile.portfolio}`, profile.linkedin && `LinkedIn: ${profile.linkedin}`].filter(Boolean);
  if (links.length) body += `\n${links.join("\n")}`;
  return body;
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as {
      companyUrl?: string;
      recipientEmail?: string;
      recipientName?: string;
      profile?: Profile;
    };
    const companyUrl = normalizeUrl(payload.companyUrl);
    if (!payload.recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.recipientEmail)) {
      return Response.json({ error: "Enter a valid recipient email." }, { status: 400 });
    }
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

    const websiteResponse = await fetch(companyUrl.toString(), {
      redirect: "follow",
      headers: { "User-Agent": "SignalOutreachResearch/1.0" },
    });
    if (!websiteResponse.ok) throw new Error(`The company website returned ${websiteResponse.status}.`);
    const websiteText = textFromHtml(await websiteResponse.text());
    if (websiteText.length < 120) throw new Error("The company website did not contain enough readable information.");

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        companyName: { type: "string" },
        companySummary: { type: "string" },
        evidence: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
        contributionIdeas: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
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
        subject: { type: "string" },
        companyDetail: {
          type: "string",
          description: "A concise noun phrase that fits grammatically after 'I was interested in'; no terminal punctuation.",
        },
        contribution: {
          type: "string",
          description: "A concise gerund or noun phrase that fits grammatically after 'I could help with'; no terminal punctuation.",
        },
      },
      required: ["companyName", "companySummary", "evidence", "contributionIdeas", "selectedProjects", "subject", "companyDetail", "contribution"],
    };

    const aiRequest = {
      store: false,
      instructions:
        "You research a company for respectful, truthful job outreach. Use only the supplied website text. Never invent metrics, customers, funding, technologies, names, or open roles. Keep the insight specific but modest. Suggest how the sender could contribute based on real context. Write companyDetail as a concise noun phrase that fits immediately after 'I was interested in'. Write contribution as a concise gerund or noun phrase that fits immediately after 'I could help with'. Do not end either phrase with punctuation. Select at most two supplied projects only when they genuinely support the contribution. Copy every selected project title and URL exactly; never invent or alter a project or URL. Avoid flattery, hype, and pressure.",
      input: `Company URL: ${companyUrl.toString()}\nRecipient: ${payload.recipientName || "unknown"}\nSender role: ${profile.role || ""}\nSender context: ${profile.context || ""}\nSender projects (use exact titles and URLs): ${JSON.stringify(projects)}\n\nWebsite text:\n${websiteText}`,
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
      selectedProjects: Array<{ title: string; liveUrl: string; repoUrl: string; reason: string }>;
      subject: string;
      companyDetail: string;
      contribution: string;
    };
    const allowedProjects = new Map(projects.map((project) => [project.liveUrl, project]));
    const selectedProjects = result.selectedProjects.flatMap((project) => {
      const allowed = allowedProjects.get(project.liveUrl);
      if (!allowed || allowed.title !== project.title) return [];
      return [{ ...allowed, reason: project.reason }];
    }).slice(0, 2);
    return Response.json({
      companyName: result.companyName,
      companySummary: result.companySummary,
      evidence: result.evidence,
      contributionIdeas: result.contributionIdeas,
      selectedProjects,
      subject: result.subject,
      body: renderTemplate(profile.template, {
        recipient: payload.recipientName || "there",
        company: result.companyName,
        company_detail: result.companyDetail,
        contribution: result.contribution,
        projects: projectLinks(selectedProjects),
        name: profile.name || "Your name",
      }, profile),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not research this company.";
    return Response.json({ error: message }, { status: 400 });
  }
}
