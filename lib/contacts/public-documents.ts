import { fetchPublicResearchPage } from "../discovery/http.ts";
import { publicContactPageUrls } from "./public-evidence.ts";
import type { PublicEmailDocument } from "./types.ts";

export async function loadPublicEmailDocuments(seedUrls: string[], existing: PublicEmailDocument[] = []) {
  const documents = new Map(existing.map((document) => [document.sourceUrl, document]));
  const seeds = [...new Set(seedUrls.filter(Boolean))].slice(0, 5);
  const fetchedSeeds = await Promise.allSettled(seeds.filter((url) => !documents.has(url)).map((url) => fetchPublicResearchPage(url)));
  for (const result of fetchedSeeds) {
    if (result.status === "fulfilled") documents.set(result.value.sourceUrl, { sourceUrl: result.value.sourceUrl, content: result.value.content, observedAt: new Date().toISOString() });
  }
  const first = [...documents.values()];
  const domain = seeds[0] ? new URL(seeds[0]).hostname : "";
  const linked = [...new Set(first.flatMap((document) => publicContactPageUrls(document.content, document.sourceUrl, domain)))]
    .filter((url) => !documents.has(url)).slice(0, 4);
  const fetchedLinked = await Promise.allSettled(linked.map((url) => fetchPublicResearchPage(url)));
  for (const result of fetchedLinked) {
    if (result.status === "fulfilled") documents.set(result.value.sourceUrl, { sourceUrl: result.value.sourceUrl, content: result.value.content, observedAt: new Date().toISOString() });
  }
  return [...documents.values()].slice(0, 9);
}
