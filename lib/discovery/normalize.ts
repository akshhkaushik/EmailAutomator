import type { DiscoveredStartup } from "./types.ts";

const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain", "0.0.0.0", "127.0.0.1", "::", "::1"]);

export function parseHttpUrl(input: string, label = "URL") {
  const value = input.trim();
  if (!value) throw new Error(`${label} is required.`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid absolute URL.`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${label} must use http or https.`);
  if (url.username || url.password) throw new Error(`${label} must not contain credentials.`);
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".local")) {
    throw new Error(`${label} must use a public hostname.`);
  }
  return url;
}

export function normalizeWebsite(input: string) {
  const raw = input.trim();
  if (!raw) return "";
  const url = parseHttpUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`, "Startup website");
  url.hash = "";
  url.search = "";
  url.pathname = "/";
  return url.toString();
}

export function normalizeDomain(input: string) {
  if (!input.trim()) return "";
  try {
    const url = parseHttpUrl(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`, "Startup website");
    return url.hostname.replace(/^www\./i, "").replace(/\.$/, "").toLowerCase();
  } catch {
    return "";
  }
}

export function normalizeName(input: string) {
  return input.replace(/\s+/g, " ").trim().slice(0, 160);
}

export function startupIdentity(startup: Pick<DiscoveredStartup, "name" | "website" | "sourceUrl">) {
  const domain = normalizeDomain(startup.website);
  if (domain) return `domain:${domain}`;
  const name = normalizeName(startup.name).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  return name ? `source:${startup.sourceUrl}|name:${name}` : "";
}

function prefer(current: string, candidate: string) {
  return current.trim() || candidate.trim();
}

export function deduplicateDiscoveredStartups(startups: DiscoveredStartup[]) {
  const deduplicated = new Map<string, DiscoveredStartup>();
  for (const raw of startups) {
    const name = normalizeName(raw.name);
    if (!name) continue;
    let website = "";
    try {
      website = normalizeWebsite(raw.website);
    } catch {
      website = "";
    }
    const startup = {
      ...raw,
      name,
      website,
      description: raw.description.replace(/\s+/g, " ").trim().slice(0, 1_000),
      location: raw.location.replace(/\s+/g, " ").trim().slice(0, 180),
    };
    const identity = startupIdentity(startup);
    if (!identity) continue;
    const existing = deduplicated.get(identity);
    if (!existing) {
      deduplicated.set(identity, startup);
      continue;
    }
    deduplicated.set(identity, {
      ...existing,
      name: prefer(existing.name, startup.name),
      website: prefer(existing.website, startup.website),
      description: prefer(existing.description, startup.description),
      location: prefer(existing.location, startup.location),
      discoveredAt: existing.discoveredAt < startup.discoveredAt ? existing.discoveredAt : startup.discoveredAt,
    });
  }
  return [...deduplicated.values()];
}
