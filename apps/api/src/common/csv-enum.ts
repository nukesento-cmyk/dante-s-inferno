import { z } from 'zod';

/** Accepts "A,B,C" (or a single value) and yields a validated array. */
export const csvEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .transform((v) => v.split(',').map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)).min(1));
