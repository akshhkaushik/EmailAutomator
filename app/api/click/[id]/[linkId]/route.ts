import { observeLinkClick } from "@/lib/tracking";
import { errorName, structuredLog } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string; linkId: string }> }) {
  try {
    const { id, linkId } = await context.params;
    const result = await observeLinkClick(id, linkId, request.headers.get("user-agent") || "Unknown email client");
    if (result) return Response.redirect(result.url, 302);
  } catch (error) {
    structuredLog("error", "tracking.link_click_failed", { errorType: errorName(error) });
  }
  return new Response("This tracked link is unavailable.", {
    status: 404,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" },
  });
}
