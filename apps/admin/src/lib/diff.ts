export interface DiffRow {
  path: string;
  before: unknown;
  after: unknown;
  kind: 'added' | 'removed' | 'changed';
}

function flatten(v: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (v !== null && typeof v === 'object' && !(Array.isArray(v) && v.length === 0)) {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) flatten(val, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out[prefix || '(value)'] = v;
  }
  return out;
}

/** Field-level before/after diff for the audit log viewer. */
export function diffValues(before: unknown, after: unknown): DiffRow[] {
  const b = flatten(before ?? {});
  const a = flatten(after ?? {});
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).sort();
  const rows: DiffRow[] = [];
  for (const path of keys) {
    const hasB = path in b;
    const hasA = path in a;
    if (hasB && hasA) {
      if (JSON.stringify(b[path]) !== JSON.stringify(a[path])) rows.push({ path, before: b[path], after: a[path], kind: 'changed' });
    } else rows.push({ path, before: b[path], after: a[path], kind: hasA ? 'added' : 'removed' });
  }
  return rows;
}
