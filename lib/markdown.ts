export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
}

export function extractHttpLinks(value: string) {
  const cleanUrl = (url: string) => url.replace(/[.,;:!?]+$/, "");
  const links = [
    ...[...value.matchAll(/\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/g)].map((match) => cleanUrl(match[1])),
    ...[...value.matchAll(/(?<!\]\()(https?:\/\/[^\s<)]+)/g)].map((match) => cleanUrl(match[1])),
  ];
  return [...new Set(links)];
}

export function markdownToHtml(value: string, rewriteLink: (url: string) => string = (url) => url) {
  const links: string[] = [];
  const withLinkTokens = escapeHtml(value).replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    (_match, label: string, url: string) => {
      const index = links.push(
        `<a href="${escapeHtml(rewriteLink(url.replaceAll("&amp;", "&")))}" target="_blank" rel="noopener noreferrer" style="color:#235f46;font-weight:700;text-decoration:underline">${label}</a>`,
      ) - 1;
      return `%%SIGNAL_LINK_${index}%%`;
    },
  );

  const formatted = withLinkTokens
    .replace(
      /\*\*([^*\n]+)\*\*/g,
      '<strong style="font-weight:700;color:#102c21">$1</strong>',
    )
    .replace(/(https?:\/\/[^\s<]+)/g, (_match, url: string) => `<a href="${escapeHtml(rewriteLink(url.replaceAll("&amp;", "&")))}" style="color:#235f46;text-decoration:underline">${url}</a>`)
    .replace(/%%SIGNAL_LINK_(\d+)%%/g, (_match, index: string) => links[Number(index)] || "");

  return formatted
    .trim()
    .split(/\n{2,}/)
    .map((paragraph, index, paragraphs) =>
      `<p style="margin:0 0 ${index === paragraphs.length - 1 ? "0" : "10px"};padding:0">${paragraph.replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

export function markdownToPlain(value: string) {
  return value
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1: $2");
}
