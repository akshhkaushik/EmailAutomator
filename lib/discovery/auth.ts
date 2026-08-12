import { verifyGoogleAccessToken } from "../tracking.ts";

export class DiscoveryAccessError extends Error {
  readonly status: number;

  constructor(message: string, status: number) { super(message); this.status = status; }
}

export async function requirePersonalAccess(request: Request, purpose = "this workspace") {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) throw new DiscoveryAccessError(`Google authentication is not configured for ${purpose}.`, 503);
  let identity: { email: string; token: string };
  try {
    identity = await verifyGoogleAccessToken(request.headers.get("authorization"));
  } catch (error) {
    throw new DiscoveryAccessError(error instanceof Error ? error.message : `Connect Gmail to use ${purpose}.`, 401);
  }
  const owner = process.env.DISCOVERY_OWNER_EMAIL?.trim().toLowerCase();
  if (!owner && process.env.NODE_ENV === "production") throw new DiscoveryAccessError("Workspace owner authorization is not configured.", 503);
  if (owner && identity.email !== owner) throw new DiscoveryAccessError("This account is not authorized to manage startup discovery.", 403);
  return identity;
}

export function requireDiscoveryAccess(request: Request) {
  return requirePersonalAccess(request, "startup discovery");
}
