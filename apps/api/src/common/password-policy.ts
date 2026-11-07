import { z } from 'zod';

const COMMON = new Set([
  'password', 'password1', '12345678', '123456789', '1234567890', '11111111', 'qwertyui', 'qwerty123', 'iloveyou', 'abcd1234',
  'letmein1', 'admin123', 'welcome1', 'changeme', 'change-me-now', 'dantespizza', 'pizza123', 'pizzapizza',
]);

/** Returns a human readable problem, or null when the password is acceptable. */
export function passwordProblem(password: string, personal: string[] = []): string | null {
  if (password.length < 8) return 'Use at least 8 characters';
  if (password.length > 128) return 'Use at most 128 characters';
  if (/^(.)\1+$/.test(password)) return 'Do not repeat a single character';
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return 'That password is too common';
  for (const p of personal) {
    const full = p.toLowerCase();
    const bit = full.split('@')[0]!;
    if ((full.length >= 6 && lower.includes(full)) || (bit.length >= 4 && lower.includes(bit))) return 'Do not use your email or phone number in your password';
  }
  return null;
}

/** Adds the password policy to an object schema, using the listed sibling fields as personal data. */
export function withPasswordPolicy<T extends z.ZodTypeAny>(schema: T, personalFields: string[] = ['email', 'phone']) {
  return schema.superRefine((value, ctx) => {
    const v = value as Record<string, unknown>;
    if (typeof v.password !== 'string') return;
    const problem = passwordProblem(v.password, personalFields.map((f) => (typeof v[f] === 'string' ? (v[f] as string) : '')).filter(Boolean));
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message: problem });
  });
}
