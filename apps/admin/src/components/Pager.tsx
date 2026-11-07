import type { Paginated } from '../api/types';
import { toList } from '../lib/format';
import { Button } from './ui';

export function pageInfo<T>(data: Paginated<T> | T[] | undefined) {
  const rows = data ? toList<T>(data) : [];
  const paged = data && !Array.isArray(data) ? data : null;
  const total = paged?.total ?? rows.length;
  const pageSize = paged?.pageSize || rows.length || 1;
  return { rows, total, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-sm">
      <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <span>Page {page} of {pages}</span>
      <Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
    </div>
  );
}
