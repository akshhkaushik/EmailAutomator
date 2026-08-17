export type NormalizedFundingDate = { date: string; precision: "day" | "month" | "year" };

function validDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function normalizeFundingDate(input: string): NormalizedFundingDate | null {
  const value = input.trim();
  let match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match.map(Number);
    return validDate(year, month, day) ? { date: value, precision: "day" } : null;
  }
  match = value.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const month = Number(match[2]);
    return month >= 1 && month <= 12 ? { date: `${match[1]}-${match[2]}-01`, precision: "month" } : null;
  }
  match = value.match(/^(\d{4})$/);
  if (match) return { date: `${match[1]}-01-01`, precision: "year" };

  match = value.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i);
  if (match) {
    const month = new Date(`${match[1]} 1, 2000 UTC`).getUTCMonth() + 1;
    return { date: `${match[2]}-${String(month).padStart(2, "0")}-01`, precision: "month" };
  }
  return null;
}

export function daysSince(date: string, now = new Date()) {
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - timestamp) / 86_400_000));
}
