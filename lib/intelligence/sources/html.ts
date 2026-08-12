import { normalizeName } from "../../discovery/normalize.ts";

export function decodeHtml(value: string) {
  const point = (code: string, radix: number) => {
    const number = Number.parseInt(code, radix);
    return Number.isInteger(number) && number >= 0 && number <= 0x10ffff ? String.fromCodePoint(number) : " ";
  };
  return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code: string) => point(code, 10))
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) => point(code, 16));
}

export function htmlText(html: string) {
  return decodeHtml(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function attribute(tag: string, name: string) {
  return decodeHtml(tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"))?.[2] || "").trim();
}

export function metaContent(html: string, names: string[]) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (attribute(tag, "name") || attribute(tag, "property")).toLowerCase();
    const content = attribute(tag, "content");
    if (wanted.has(key) && content) return normalizeName(content).slice(0, 1_000);
  }
  return "";
}

export function jsonLdRecords(html: string) {
  const records: Array<Record<string, unknown>> = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    records.push(record);
    for (const key of ["@graph", "itemListElement", "item", "founder", "founders"]) if (key in record) visit(record[key]);
  };
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(decodeHtml(match[1]))); } catch { /* Malformed structured data is ignored. */ }
  }
  return records;
}

export function schemaTypes(record: Record<string, unknown>) {
  const value = record["@type"];
  return (Array.isArray(value) ? value : [value]).filter((item): item is string => typeof item === "string").map((item) => item.toLowerCase());
}

export function addressText(value: unknown) {
  if (typeof value === "string") return normalizeName(value);
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return [record.streetAddress, record.addressLocality, record.addressRegion, record.postalCode, record.addressCountry]
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map(normalizeName).join(", ");
}

export function pageLinks(html: string, baseUrl: string) {
  const base = new URL(baseUrl);
  const links: Array<{ url: string; label: string }> = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(attribute(match[1], "href"), base);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      url.hash = "";
      links.push({ url: url.toString(), label: normalizeName(htmlText(match[2])).slice(0, 160) });
    } catch { /* Ignore malformed links. */ }
  }
  return links;
}

export function sentences(text: string) {
  return text.split(/(?<=[.!?])\s+/).map((item) => item.replace(/\s+/g, " ").trim()).filter((item) => item.length >= 20 && item.length <= 500);
}
