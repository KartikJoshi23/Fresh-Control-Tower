/**
 * Number, unit and date formatting shared by every page. One style everywhere (team decision, 15 Nov 2026):
 * - weights always in kilograms with thousands separators: "128,450 kg" (the data is in kg);
 * - money in UAE dirhams, in full below one million ("AED 7,768") and in millions above ("AED 2.14 million");
 * - dates day-first, UAE style: "15/11/2026"; chart ticks drop the year ("15/11") when the axis title gives it.
 * Separators are commas (en-US grouping); numerals are tabular in CSS.
 */
export const fmtInt = (v: number) => Math.round(v).toLocaleString("en-US");
export const fmtPct = (v: number, digits = 1) => `${v.toFixed(digits)}%`;
export const fmtShare = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
export const fmtSignedPct = (v: number, digits = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}%`;
/** A difference in percentage points, e.g. "+28.3 points". */
export const fmtSignedPts = (v: number, digits = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)} points`;

/** Money: "AED 7,768" below one million, "AED 2.14 million" from one million. */
export function fmtAED(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 1e6) return `${sign}AED ${(a / 1e6).toFixed(2)} million`;
  return `${sign}AED ${Math.round(a).toLocaleString("en-US")}`;
}

/** Mass, always in kilograms: "128,450 kg"; values under 10 kg keep one decimal ("2.5 kg"). */
export function fmtKg(v: number): string {
  const a = Math.abs(v);
  const text = a > 0 && a < 10 ? a.toLocaleString("en-US", { maximumFractionDigits: 1 }) : Math.round(a).toLocaleString("en-US");
  return `${v < 0 ? "−" : ""}${text} kg`;
}

/** Units count: "1,195 units" (or "1 unit"). */
export const fmtUnits = (v: number) => `${fmtInt(v)} ${Math.round(Math.abs(v)) === 1 ? "unit" : "units"}`;

/** Relative change (a vs b) as a percentage number. */
export const change = (a: number, b: number) => (b === 0 ? 0 : (a / b - 1) * 100);

/**
 * Axis helper for money: picks "AED" or "AED million" for the axis title from the largest value, and returns a tick
 * formatter without the currency (the title carries it), so ticks stay short.
 */
export function aedAxis(max: number): { unit: string; tick: (v: number) => string } {
  return Math.abs(max) >= 1e6
    ? { unit: "AED million", tick: (v) => (v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 }) }
    : { unit: "AED", tick: (v) => Math.round(v).toLocaleString("en-US") };
}

const pad = (n: number) => String(n).padStart(2, "0");
/** "2026-11-15" or "2026-11-15T06:00" (Gulf time as written) → a local Date without timezone shifts. */
export const parseDate = (d: string) => new Date(d.includes("T") ? d : `${d}T00:00:00`);
/** 15/11/2026 */
export const fmtDate = (d: string | Date) => {
  const t = typeof d === "string" ? parseDate(d) : d;
  return `${pad(t.getDate())}/${pad(t.getMonth() + 1)}/${t.getFullYear()}`;
};
/** 15/11 (chart ticks; the axis title gives the year). */
export const fmtDayMonth = (d: string | Date) => {
  const t = typeof d === "string" ? parseDate(d) : d;
  return `${pad(t.getDate())}/${pad(t.getMonth() + 1)}`;
};
/** "15/11/2026 06:00" for an hourly timestamp. */
export const fmtDateTime = (d: string) => `${fmtDate(d)} ${d.slice(11, 16)}`;
/** "Sun 15/11/2026" (tooltips). */
export const fmtWeekdayDate = (d: string | Date) => {
  const t = typeof d === "string" ? parseDate(d) : d;
  return `${t.toLocaleDateString("en-GB", { weekday: "short" })} ${fmtDate(t)}`;
};

/** Whole days from one "YYYY-MM-DD" date to another (UTC, so no daylight-saving drift). */
export const daysBetween = (start: string, date: string) =>
  Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
