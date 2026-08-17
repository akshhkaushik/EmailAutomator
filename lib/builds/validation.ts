import { isIP } from "node:net";
import { isPublicIpAddress } from "../discovery/http.ts";
import { ValidationError } from "../discovery/validation.ts";
import { BUILD_STATUSES, type BuildProof, type BuildStatus } from "./types.ts";

function optionalUrl(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.length > 2_000) throw new ValidationError(`${label} is invalid.`);
  let url: URL;
  try { url = new URL(value); } catch { throw new ValidationError(`${label} must be a valid URL.`); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new ValidationError(`${label} must use HTTP or HTTPS.`);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || (isIP(host) && !isPublicIpAddress(host))) throw new ValidationError(`${label} must use a public hostname.`);
  return url.toString();
}

export function validateBuildProof(value: unknown, now = new Date().toISOString()): BuildProof {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("Proof must be a JSON object.");
  const input = value as Record<string, unknown>;
  const notes = typeof input.notes === "string" ? input.notes.trim().slice(0, 2_000) : "";
  const proof = {
    githubUrl: optionalUrl(input.githubUrl, "GitHub URL"),
    demoUrl: optionalUrl(input.demoUrl, "Demo URL"),
    prUrl: optionalUrl(input.prUrl, "PR URL"),
    documentationUrl: optionalUrl(input.documentationUrl, "Documentation URL"),
    screenshotUrl: optionalUrl(input.screenshotUrl, "Screenshot URL"),
    notes,
    attachedAt: now,
  };
  if (![proof.githubUrl, proof.demoUrl, proof.prUrl, proof.documentationUrl, proof.screenshotUrl].some(Boolean)) throw new ValidationError("Attach at least one verifiable proof URL.");
  if (proof.githubUrl && new URL(proof.githubUrl).hostname !== "github.com") throw new ValidationError("GitHub URL must point to github.com.");
  if (proof.prUrl && !(new URL(proof.prUrl).hostname === "github.com" && /\/pull\/\d+\/?$/.test(new URL(proof.prUrl).pathname))) throw new ValidationError("PR URL must point to a GitHub pull request.");
  return proof;
}

export function validateBuildStatus(value: unknown): BuildStatus {
  const status = value && typeof value === "object" ? (value as { status?: unknown }).status : null;
  if (typeof status !== "string" || !BUILD_STATUSES.includes(status as BuildStatus)) throw new ValidationError(`Build status must be one of: ${BUILD_STATUSES.join(", ")}.`);
  return status as BuildStatus;
}

export function hasBuildProof(proof: BuildProof | null) {
  return Boolean(proof && [proof.githubUrl, proof.demoUrl, proof.prUrl, proof.documentationUrl, proof.screenshotUrl].some(Boolean));
}
