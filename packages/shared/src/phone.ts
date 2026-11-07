/** Kenyan mobile numbers: +254 7XX XXX XXX or +254 1XX XXX XXX, stored as E.164. */
const E164_KE = /^\+254[17]\d{8}$/;

/** Normalize "0712 345 678", "712345678", "254712345678", "+254 712-345-678" to "+254712345678". */
export function normalizeKenyanPhone(input: string): string | null {
  let d = input.replace(/[\s\-().]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('254')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  const e164 = `+254${d}`;
  return E164_KE.test(e164) ? e164 : null;
}

export function isKenyanPhone(input: string): boolean {
  return normalizeKenyanPhone(input) !== null;
}

/** "+254712345678" -> "+254 712 345 678" */
export function formatKenyanPhone(e164: string): string {
  const m = /^\+254(\d{3})(\d{3})(\d{3})$/.exec(e164);
  return m ? `+254 ${m[1]} ${m[2]} ${m[3]}` : e164;
}

/** Daraja wants "2547XXXXXXXX" without the plus. */
export function toMpesaMsisdn(e164: string): string {
  return e164.replace(/^\+/, '');
}
