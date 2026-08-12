import { isIP } from "node:net";
import { isPublicIpAddress } from "./http.ts";
import { parseHttpUrl } from "./normalize.ts";
import type { AcceleratorStatus } from "./types.ts";

export class ValidationError extends Error {}

function objectInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("Request body must be a JSON object.");
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, options: { required?: boolean; max?: number } = {}) {
  const result = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (options.required && !result) throw new ValidationError(`${label} is required.`);
  if (result.length > (options.max || 500)) throw new ValidationError(`${label} is too long.`);
  return result;
}

function publicUrl(value: unknown, label: string) {
  const result = text(value, label, { required: true, max: 2_000 });
  try {
    const url = parseHttpUrl(result, label);
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(hostname) && !isPublicIpAddress(hostname)) throw new Error(`${label} must use a public hostname.`);
    return url.toString();
  } catch (error) {
    throw new ValidationError(error instanceof Error ? error.message : `${label} is invalid.`);
  }
}

function id(value: unknown, label: string, required = true) {
  const result = text(value, label, { required, max: 100 });
  if (result && !/^[a-zA-Z0-9_-]{8,100}$/.test(result)) throw new ValidationError(`${label} is invalid.`);
  return result;
}

export function validateAcceleratorInput(value: unknown) {
  const input = objectInput(value);
  const status = text(input.status, "Status", { max: 20 }) || "active";
  if (!(["active", "paused"] as string[]).includes(status)) throw new ValidationError("Status must be active or paused.");
  return {
    name: text(input.name, "Accelerator name", { required: true, max: 160 }),
    website: publicUrl(input.website, "Accelerator website"),
    portfolioUrl: publicUrl(input.portfolioUrl, "Portfolio URL"),
    description: text(input.description, "Description", { max: 1_000 }),
    status: status as AcceleratorStatus,
  };
}

export function validateCohortInput(value: unknown) {
  const input = objectInput(value);
  let year: number | null = null;
  if (input.year !== undefined && input.year !== null && input.year !== "") {
    year = typeof input.year === "number" ? input.year : Number(input.year);
    if (!Number.isInteger(year) || year < 1950 || year > 2100) throw new ValidationError("Cohort year must be between 1950 and 2100.");
  }
  return {
    acceleratorId: id(input.acceleratorId, "Accelerator"),
    name: text(input.name, "Cohort name", { required: true, max: 160 }),
    year,
    portfolioUrl: publicUrl(input.portfolioUrl, "Cohort portfolio URL"),
    source: text(input.source, "Cohort source", { max: 160 }) || "public-portfolio-page",
  };
}

export function validateDiscoveryInput(value: unknown) {
  const input = objectInput(value);
  return {
    acceleratorId: id(input.acceleratorId, "Accelerator"),
    cohortId: id(input.cohortId, "Cohort", false) || null,
  };
}

export function validateListFilters(url: URL) {
  return {
    acceleratorId: id(url.searchParams.get("acceleratorId"), "Accelerator", false) || null,
    cohortId: id(url.searchParams.get("cohortId"), "Cohort", false) || null,
  };
}

export function validateResourceId(value: string, label: string) {
  return id(value, label);
}
