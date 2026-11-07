import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { auditApi } from '../api/endpoints';
import type { AuditEntry } from '../api/types';
import { Pager, pageInfo } from '../components/Pager';
import { Badge, Card, Drawer, EmptyState, ErrorState, Input, Loading, PageHeader, Table, Td, Th } from '../components/ui';
import { diffValues } from '../lib/diff';
import { fmtDateTime } from '../lib/format';
import { useDebounced } from '../lib/hooks';

const show = (v: unknown) => (v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v));

export function AuditPage() {
  const [entity, setEntity] = useState('');
  const [userId, setUserId] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<AuditEntry | null>(null);
  const e = useDebounced(entity);
  const u = useDebounced(userId);
  const query = useQuery({ queryKey: ['audit', e, u, page], queryFn: () => auditApi.list({ entity: e, userId: u, page }), placeholderData: (p) => p });
  const { rows, pages } = pageInfo<AuditEntry>(query.data);
  return (
    <>
      <PageHeader title="Audit log" subtitle="Every admin change with before and after values" />
      <div className="mb-3 grid max-w-xl gap-2 sm:grid-cols-2">
        <Input aria-label="Filter by entity" placeholder="Entity (e.g. Product)" value={entity} onChange={(ev) => { setEntity(ev.target.value); setPage(1); }} />
        <Input aria-label="Filter by user ID" placeholder="Staff user ID" value={userId} onChange={(ev) => { setUserId(ev.target.value); setPage(1); }} />
      </div>
      <Card className="!p-0">
        {query.isPending ? <Loading /> : query.isError ? <div className="p-4"><ErrorState error={query.error} onRetry={() => void query.refetch()} /></div> : rows.length === 0 ? <div className="p-4"><EmptyState title="No audit entries" /></div> : (
          <Table>
            <thead><tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Entity</Th><Th className="text-right">Changes</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-50">
                  <Td>{fmtDateTime(r.createdAt)}</Td><Td>{r.userName ?? r.user?.name ?? r.userId ?? 'System'}</Td><Td><Badge tone="cream">{r.action}</Badge></Td>
                  <Td>{r.entity}{r.entityId && <span className="ml-1 text-xs text-zinc-500">{r.entityId.slice(0, 10)}</span>}</Td>
                  <Td className="text-right"><button className="text-brand hover:underline" onClick={() => setOpen(r)}>View diff</button></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Pager page={page} pages={pages} onPage={setPage} />
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? `${open.action} ${open.entity}` : 'Change'}>
        {open && (() => {
          const d = diffValues(open.before, open.after);
          return d.length === 0 ? <p className="text-zinc-500">No field differences recorded.</p> : (
            <table className="w-full text-xs">
              <thead><tr><th className="p-1 text-left">Field</th><th className="p-1 text-left">Before</th><th className="p-1 text-left">After</th></tr></thead>
              <tbody>
                {d.map((r) => (
                  <tr key={r.path} className="border-t border-zinc-100 align-top">
                    <td className="p-1 font-mono">{r.path}</td>
                    <td className={`p-1 break-all ${r.kind !== 'added' ? 'bg-red-50 text-red-800' : ''}`}>{r.kind === 'added' ? '—' : show(r.before)}</td>
                    <td className={`p-1 break-all ${r.kind !== 'removed' ? 'bg-emerald-50 text-emerald-800' : ''}`}>{r.kind === 'removed' ? '—' : show(r.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })()}
      </Drawer>
    </>
  );
}
