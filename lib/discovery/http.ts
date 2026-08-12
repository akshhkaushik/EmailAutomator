import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { parseHttpUrl } from "./normalize.ts";
import { retry } from "../reliability.ts";

const DISCOVERY_USER_AGENT = "EmailAutomator-Discovery/1.0 (+personal research; one portfolio page per request)";
const MAX_HTML_BYTES = 1_000_000;
const MAX_ROBOTS_BYTES = 128_000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

type Address = { address: string; family: number };
type Lookup = (hostname: string) => Promise<Address[]>;

function ipv4Parts(address: string) {
  const parts = address.split(".").map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

export function isPublicIpAddress(input: string) {
  const address = input.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(address) === 4) {
    const parts = ipv4Parts(address);
    if (!parts) return false;
    const [a, b, c] = parts;
    return !(
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (isIP(address) === 6) {
    if (address.startsWith("::ffff:")) return isPublicIpAddress(address.slice(7));
    return !(
      address === "::" || address === "::1" ||
      address.startsWith("fc") || address.startsWith("fd") ||
      /^fe[89ab]/.test(address) || address.startsWith("ff") ||
      address.startsWith("2001:db8:")
    );
  }
  return false;
}

const defaultLookup: Lookup = async (hostname) => lookup(hostname, { all: true, verbatim: true });

export async function assertPublicDestination(url: URL, resolver: Lookup = defaultLookup) {
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const literalFamily = isIP(hostname);
  const addresses = literalFamily ? [{ address: hostname, family: literalFamily }] : await resolver(hostname);
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error("Discovery source must resolve only to public internet addresses.");
  }
}

export async function boundedText(response: Response, maxBytes: number) {
  const declaredLength = Number(response.headers.get("content-length") || "0");
  if (declaredLength > maxBytes) throw new Error("Discovery source is larger than the allowed response size.");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Discovery source is larger than the allowed response size.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function guardedFetch(
  input: URL,
  options: { maxBytes: number; accept: string; timeout?: number; respectRobots?: boolean; preferMarkdownAlternate?: boolean },
) {
  let current = input;
  let followedMarkdownAlternate = false;
  const deadline = Date.now() + (options.timeout || REQUEST_TIMEOUT_MS);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await assertPublicDestination(current);
    if (options.respectRobots) await assertRobotsAllowed(current);
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Discovery source request timed out.");
    const response = await retry(async () => {
      const result = await fetch(current, {
        redirect: "manual",
        headers: { Accept: options.accept, "User-Agent": DISCOVERY_USER_AGENT },
        signal: AbortSignal.timeout(remaining),
      });
      if (result.status === 429 || result.status >= 500) {
        await result.body?.cancel();
        throw new RetryableHttpError(result.status);
      }
      return result;
    }, { attempts: 2, baseDelayMs: 125, shouldRetry: (error) => error instanceof RetryableHttpError });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Discovery source returned an invalid redirect.");
      current = parseHttpUrl(new URL(location, current).toString(), "Discovery redirect");
      continue;
    }
    if (options.preferMarkdownAlternate && !followedMarkdownAlternate) {
      const alternate = markdownAlternateUrl(response.headers.get("link"), current);
      if (alternate) {
        await response.body?.cancel();
        current = alternate;
        followedMarkdownAlternate = true;
        continue;
      }
    }
    return { response, text: await boundedText(response, options.maxBytes), finalUrl: current };
  }
  throw new Error("Discovery source redirected too many times.");
}

export function markdownAlternateUrl(linkHeader: string | null, source: URL) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(/,(?=\s*<)/)) {
    const href = part.match(/<([^>]+)>/)?.[1];
    if (!href || !/\brel\s*=\s*["']?alternate["']?/i.test(part) || !/\btype\s*=\s*["']text\/markdown["']/i.test(part)) continue;
    try {
      const candidate = new URL(href, source);
      if (candidate.origin === source.origin && ["http:", "https:"].includes(candidate.protocol)) return candidate;
    } catch { /* Ignore malformed alternate representations. */ }
  }
  return null;
}

class RetryableHttpError extends Error {
  readonly status: number;
  constructor(status: number) { super(`Public source returned HTTP ${status}.`); this.status = status; }
}

type RobotsRule = { kind: "allow" | "disallow"; path: string };

export function robotsAllows(robotsText: string, pathname: string) {
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];
  let group: { agents: string[]; rules: RobotsRule[] } | null = null;
  for (const rawLine of robotsText.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (!group || group.rules.length > 0) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
    } else if (group && (key === "allow" || key === "disallow")) {
      group.rules.push({ kind: key, path: value });
    }
  }
  const agent = DISCOVERY_USER_AGENT.toLowerCase().split("/")[0];
  const matching = groups.filter((candidate) => candidate.agents.some((value) => value === "*" || agent.includes(value)));
  const rules = matching.flatMap((candidate) => candidate.rules)
    .filter((rule) => rule.path && pathname.startsWith(rule.path))
    .sort((a, b) => b.path.length - a.path.length || (a.kind === "allow" ? -1 : 1));
  return rules[0]?.kind !== "disallow";
}

async function assertRobotsAllowed(target: URL) {
  const robotsUrl = new URL("/robots.txt", target.origin);
  const { response, text } = await guardedFetch(robotsUrl, {
    maxBytes: MAX_ROBOTS_BYTES,
    accept: "text/plain,*/*;q=0.2",
    timeout: 5_000,
  });
  if (response.status === 404 || response.status === 410) return;
  if (!response.ok) throw new Error(`Could not verify robots.txt (HTTP ${response.status}).`);
  if (!robotsAllows(text, `${target.pathname}${target.search}`)) {
    throw new Error("The portfolio page is disallowed by robots.txt.");
  }
}

export async function fetchPublicPortfolioPage(input: string) {
  const target = parseHttpUrl(input, "Portfolio URL");
  const { response, text, finalUrl } = await guardedFetch(target, {
    maxBytes: MAX_HTML_BYTES,
    accept: "text/html,application/xhtml+xml;q=0.9",
    respectRobots: true,
  });
  if (!response.ok) throw new Error(`Portfolio page returned HTTP ${response.status}.`);
  const contentType = response.headers.get("content-type") || "";
  if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    throw new Error("Portfolio URL did not return an HTML page.");
  }
  if (text.trim().length < 40) throw new Error("Portfolio page did not contain enough readable HTML.");
  return { html: text, sourceUrl: finalUrl.toString() };
}

export async function fetchPublicResearchPage(input: string) {
  const target = parseHttpUrl(input, "Research URL");
  const { response, text, finalUrl } = await guardedFetch(target, {
    maxBytes: MAX_HTML_BYTES,
    accept: "text/markdown,text/html,application/xhtml+xml;q=0.9",
    respectRobots: true,
    preferMarkdownAlternate: true,
  });
  if (!response.ok) throw new Error(`Research page returned HTTP ${response.status}.`);
  const contentType = response.headers.get("content-type") || "";
  if (contentType && !/text\/html|application\/xhtml\+xml|text\/markdown/i.test(contentType)) {
    throw new Error("Research URL did not return a readable web page.");
  }
  if (text.trim().length < 40) throw new Error("Research page did not contain enough readable content.");
  return { content: text, sourceUrl: finalUrl.toString(), contentType };
}
