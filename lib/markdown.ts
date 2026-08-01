export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
}

export function markdownToHtml(value: string) {
  const links: string[] = [];
  const withLinkTokens = escapeHtml(value).replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    (_match, label: string, url: string) => {
      const index = links.push(
        `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#235f46;font-weight:700;text-decoration:underline">${label}</a>`,
      ) - 1;
      return `%%SIGNAL_LINK_${index}%%`;
    },
  );

  return withLinkTokens
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#235f46;text-decoration:underline">$1</a>')
    .replace(/%%SIGNAL_LINK_(\d+)%%/g, (_match, index: string) => links[Number(index)] || "")
    .replace(/\n/g, "<br>");
}

export function markdownToPlain(value: string) {
  return value
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1: $2");
}
