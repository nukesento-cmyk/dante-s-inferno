import { parseKes } from '@dantes/shared';

/** Staff type shillings; the API stores integer cents. Returns null when blank/invalid. */
export function kesToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim();
  if (s === '') return null;
  return parseKes(s);
}

/** Like kesToCents but yields NaN for blank/invalid so zod rejects it with a path. */
export function kesToCentsStrict(input: string | null | undefined): number {
  const c = kesToCents(input);
  return c === null ? Number.NaN : c;
}

/** 125000 -> "1250", 125050 -> "1250.50" (plain editable text, no thousands separators). */
export function centsToKes(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export function bpsToPercent(bps: number): string {
  return String(bps / 100);
}
export function percentToBps(input: string): number | null {
  const n = Number(input.trim());
  if (input.trim() === '' || !Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
