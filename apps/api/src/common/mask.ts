import { env } from '../config/env';

/** Masks Kenyan phone numbers (+254712345678 / 0712345678 -> +2547******78) and card-like digit runs in log text. */
export function maskSensitive(text: string): string {
  let out = text
    .replace(/(\+?254|\b0)([17]\d{2})\d{4}(\d{2})\b/g, (_m, p: string, mid: string, tail: string) => `${p === '0' ? '0' : '+254'}${mid.slice(0, 1)}******${tail}`)
    .replace(/\b(?:\d[ -]?){13,19}\b/g, '[card?]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1***')
    .replace(/(dp_(?:staff|customer)=)[^;\s"]+/g, '$1***');
  // Reset links are secrets in production; in development they stay visible because no email is sent.
  if (env.isProduction) out = out.replace(/(token=)[A-Za-z0-9_-]{16,}/g, '$1***');
  return out;
}

export const maskPhone = (phone: string) => maskSensitive(phone);
