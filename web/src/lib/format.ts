/** Number formatting shared by every page (en-US grouping; AED for money; tabular numerals in CSS). */
export const fmtInt = (v: number) => Math.round(v).toLocaleString("en-US");
export const fmt1 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
export const fmtPct = (v: number, digits = 1) => `${v.toFixed(digits)}%`;
export const fmtShare = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
export const fmtSignedPct = (v: number, digits = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}%`;

/** Compact AED: AED 2.57 M, AED 845 k, AED 512. */
export function fmtAED(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 1e6) return `${sign}AED ${(a / 1e6).toFixed(2)} M`;
  if (a >= 1e4) return `${sign}AED ${Math.round(a / 1e3)} k`;
  return `${sign}AED ${Math.round(a).toLocaleString("en-US")}`;
}

/** Compact mass: 153 t, 9.8 t, 640 kg. */
export function fmtKg(v: number): string {
  return Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("en-US", { maximumFractionDigits: v >= 1e5 ? 0 : 1 })} t` : `${Math.round(v)} kg`;
}

/** Relative change (a vs b) as a signed percentage string. */
export const change = (a: number, b: number) => (b === 0 ? 0 : (a / b - 1) * 100);
