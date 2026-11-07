import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { formatKenyanPhone, formatKes } from '@dantes/shared';
import { customersApi } from '../api/endpoints';
import type { Customer } from '../api/types';
import { Pager, pageInfo } from '../components/Pager';
import { statusTone } from '../components/StatusActions';
import { Async, Badge, Card, Drawer, EmptyState, ErrorState, Input, Loading, PageHeader, Table, Td, Th } from '../components/ui';
import { fmtDate, fmtDateTime, humanize } from '../lib/format';
import { useDebounced } from '../lib/hooks';

export function CustomersPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const q = useDebounced(search);
  const query = useQuery({ queryKey: ['customers', q, page], queryFn: () => customersApi.list({ q, page }), placeholderData: (p) => p });
  const { rows, pages } = pageInfo<Customer>(query.data);
  return (
    <>
      <PageHeader title="Customers" />
      <Input aria-label="Search customers" className="mb-3 max-w-sm" placeholder="Search name, phone or email" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      <Card className="!p-0">
        {query.isPending ? <Loading /> : query.isError ? <div className="p-4"><ErrorState error={query.error} onRetry={() => void query.refetch()} /></div> : rows.length === 0 ? <div className="p-4"><EmptyState title="No customers found" /></div> : (
          <Table>
            <thead><tr><Th>Name</Th><Th>Phone</Th><Th>Email</Th><Th>Joined</Th><Th className="text-right">Orders</Th><Th className="text-right">Spent</Th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-zinc-50" onClick={() => setOpen(c.id)}>
                  <Td><button className="font-semibold text-brand hover:underline" onClick={(e) => { e.stopPropagation(); setOpen(c.id); }}>{c.name}</button></Td>
                  <Td>{c.phone ? formatKenyanPhone(c.phone) : '—'}</Td><Td>{c.email ?? '—'}</Td><Td>{fmtDate(c.createdAt)}</Td>
                  <Td className="text-right">{c.orderCount ?? '—'}</Td><Td className="text-right tabular-nums">{c.totalSpentCents !== undefined ? formatKes(c.totalSpentCents) : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Pager page={page} pages={pages} onPage={setPage} />
      <CustomerDrawer id={open} onClose={() => setOpen(null)} />
    </>
  );
}

function CustomerDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ['customer', id], queryFn: () => customersApi.get(id!), enabled: !!id });
  return (
    <Drawer open={!!id} onClose={onClose} title="Customer">
      <Async q={q}>
        {(c) => (
          <div className="space-y-4 text-sm">
            <div><div className="text-lg font-semibold">{c.name}</div><div className="text-zinc-600">{c.phone ? formatKenyanPhone(c.phone) : ''} {c.email && `· ${c.email}`}</div></div>
            <h3 className="font-semibold">Order history</h3>
            {c.orders?.length ? (
              <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
                {c.orders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 p-2">
                    <div><span className="font-medium">{o.reference}</span><div className="text-xs text-zinc-500">{fmtDateTime(o.createdAt)}</div></div>
                    <Badge tone={statusTone(o.status)}>{humanize(o.status)}</Badge>
                    <span className="tabular-nums">{formatKes(o.totalCents)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-zinc-500">No orders yet.</p>}
          </div>
        )}
      </Async>
    </Drawer>
  );
}
