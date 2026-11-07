import { normalizeKenyanPhone } from '@dantes/shared';

/** Validates a Kenyan phone typed by a user (accepts 07…, 01…, +254…, 254…). */
export function validatePhoneInput(value: string, { required = true }: { required?: boolean } = {}): { value: string | null; error: string | null } {
  const v = value.trim();
  if (!v) return { value: null, error: required ? 'Enter your phone number' : null };
  const n = normalizeKenyanPhone(v);
  return n ? { value: n, error: null } : { value: null, error: 'Enter a Kenyan number like 0712 345 678' };
}
