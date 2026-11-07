import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { formatKes } from '@dantes/shared';
import { reportsApi } from '../api/endpoints';
import { Async, Card, EmptyState, Field, Input, PageHeader, Select, Table, Td, Th } from '../components/ui';
import { fmtDate, todayISO } from '../lib/format';

export function ReportsPage() {
  const [from, setFrom] = useState(todayISO(-29));
  const [to, setTo] = useState(todayISO());
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');
  const valid = !!from && !!to && from <= to;
  const sales = useQuery({ queryKey: ['rep-sales', from, to, groupBy], queryFn: () => reportsApi.sales({ from, to, groupBy }), enabled: valid });
  const prods = useQuery({ queryKey: ['rep-products', from, to], queryFn: () => reportsApi.products({ from, to }), enabled: valid });
  return (
    <>
      <PageHeader title="Reports" subtitle="Revenue and product performance" actions={valid ? <a href={reportsApi.csvUrl(from, to)} download className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium hover:bg-zinc-50">Export CSV</a> : undefined} />
      <div className="mb-4 grid max-w-2xl gap-3 sm:grid-cols-3">
        <Field label="From" error={!valid ? 'Start must be on or before the end date' : undefined}>{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label="To">{(id) => <Input id={id} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
        <Field label="Group by">{(id) => <Select id={id} value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></Select>}</Field>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Sales">
          <Async q={sales} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No sales in this range" />}>
            {(rows) => (
              <Table><thead><tr><Th>Period</Th><Th className="text-right">Orders</Th><Th className="text-right">Revenue</Th></tr></thead>
                <tbody>
                  {rows.map((r, i) => <tr key={i}><Td>{fmtDate(r.period ?? r.date)}</Td><Td className="text-right">{r.orders}</Td><Td className="text-right tabular-nums">{formatKes(r.revenueCents)}</Td></tr>)}
                  <tr className="font-bold"><Td>Total</Td><Td className="text-right">{rows.reduce((a, r) => a + r.orders, 0)}</Td><Td className="text-right tabular-nums">{formatKes(rows.reduce((a, r) => a + r.revenueCents, 0))}</Td></tr>
                </tbody></Table>
            )}
          </Async>
        </Card>
        <Card title="Product performance">
          <Async q={prods} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No product sales in this range" />}>
            {(rows) => (
              <Table><thead><tr><Th>Product</Th><Th className="text-right">Units</Th><Th className="text-right">Revenue</Th></tr></thead>
                <tbody>{rows.map((r, i) => <tr key={r.productId ?? i}><Td>{r.name}</Td><Td className="text-right">{r.quantity}</Td><Td className="text-right tabular-nums">{formatKes(r.revenueCents)}</Td></tr>)}</tbody></Table>
            )}
          </Async>
        </Card>
      </div>
    </>
  );
}
