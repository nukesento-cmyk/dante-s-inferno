/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FieldValues, Resolver } from 'react-hook-form';
import type { z } from 'zod';

/**
 * Validates form values with a shared @dantes/shared zod schema.
 * `toPayload` converts form values (shillings as text...) into the API shape (cents).
 * Issue paths ending in `Cents` map back onto form fields ending in `Kes`.
 */
export function sharedResolver<TForm extends FieldValues, TOut = any>(
  schema: z.ZodTypeAny,
  toPayload?: (v: TForm) => unknown,
): Resolver<TForm, any, TOut> {
  return async (values) => {
    const payload = toPayload ? toPayload(values as TForm) : values;
    const r = schema.safeParse(payload);
    if (r.success) return { values: r.data as TOut, errors: {} };
    const errors: Record<string, unknown> = {};
    for (const issue of r.error.issues) {
      const path = issue.path.map((p) => (typeof p === 'string' ? p.replace(/Cents$/, 'Kes') : p));
      const last = String(issue.path[issue.path.length - 1] ?? '');
      const message = last.endsWith('Cents') ? 'Enter a valid amount in KES, e.g. 1,250' : issue.message;
      setNested(errors, path, { type: issue.code, message });
    }
    return { values: {}, errors: errors as never };
  };
}

function setNested(obj: Record<string, unknown>, path: (string | number)[], value: unknown) {
  let cur: Record<string | number, unknown> = obj;
  path.forEach((key, i) => {
    if (i === path.length - 1) {
      if (!(key in cur)) cur[key] = value;
    } else {
      if (typeof cur[key] !== 'object' || cur[key] === null) cur[key] = typeof path[i + 1] === 'number' ? [] : {};
      cur = cur[key] as Record<string | number, unknown>;
    }
  });
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
