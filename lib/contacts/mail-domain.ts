import { resolveMx } from "node:dns/promises";
import type { MailDomainInspection } from "./types.ts";

export type MailDomainInspector = (domain: string) => Promise<MailDomainInspection>;

export const inspectMailDomain: MailDomainInspector = async (domain) => {
  const checkedAt = new Date().toISOString();
  try {
    const records = await resolveMx(domain);
    const exchanges = records
      .filter((record) => record.exchange && record.exchange !== ".")
      .sort((left, right) => left.priority - right.priority)
      .map((record) => record.exchange.toLowerCase());
    return { status: exchanges.length > 0 ? "present" : "missing", exchanges, checkedAt };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (["ENODATA", "ENOTFOUND", "ENXDOMAIN"].includes(code)) return { status: "missing", exchanges: [], checkedAt };
    return { status: "unknown", exchanges: [], checkedAt };
  }
};
