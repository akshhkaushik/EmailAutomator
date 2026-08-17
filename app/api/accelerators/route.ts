import { discoveryApiError, jsonBody } from "@/lib/discovery/api";
import { requireDiscoveryAccess } from "@/lib/discovery/auth";
import { getDiscoveryRepository } from "@/lib/discovery/redis-repository";
import { validateAcceleratorInput } from "@/lib/discovery/validation";
import { ACCELERATOR_CATALOG } from "@/lib/discovery/accelerator-catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireDiscoveryAccess(request);
    const accelerators = await getDiscoveryRepository().listAccelerators();
    return Response.json({ accelerators, catalog: ACCELERATOR_CATALOG }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return discoveryApiError(error); }
}

export async function POST(request: Request) {
  try {
    await requireDiscoveryAccess(request);
    const input = validateAcceleratorInput(await jsonBody(request));
    const accelerator = await getDiscoveryRepository().createAccelerator(input);
    return Response.json({ accelerator }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return discoveryApiError(error); }
}
