/**
 * Display-only digit rendering.
 *
 * Anything that *computes* with a Nepali number does it in `sajilo-core`; this
 * only draws digits the UI already has, which is why a duplicate here is safe
 * where a duplicate calendar table would not be.
 */
const DEVANAGARI = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"] as const;

export type NumeralStyle = "devanagari" | "latin";

export function digits(value: number, style: NumeralStyle, pad = 0): string {
  const latin = String(Math.trunc(Math.abs(value))).padStart(pad, "0");
  const signed = value < 0 ? `-${latin}` : latin;
  if (style === "latin") return signed;
  return signed.replace(/\d/g, (d) => DEVANAGARI[Number(d)] ?? d);
}
