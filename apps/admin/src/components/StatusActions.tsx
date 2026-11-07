import { useState } from 'react';
import type { OrderStatus, StaffRole } from '@dantes/shared';
import { nextStatuses } from '../lib/roles';
import { humanize } from '../lib/format';
import { Button, Input } from './ui';

export function statusTone(s: string): 'gray' | 'green' | 'orange' | 'red' | 'blue' | 'cream' {
  switch (s) {
    case 'PAID':
    case 'SUCCEEDED':
      return 'green';
    case 'ACCEPTED':
    case 'PREPARING':
    case 'PENDING':
    case 'INITIATED':
      return 'orange';
    case 'READY':
    case 'OUT_FOR_DELIVERY':
      return 'blue';
    case 'COMPLETED':
      return 'gray';
    case 'CANCELLED':
    case 'FAILED':
    case 'PAYMENT_FAILED':
      return 'red';
    default:
      return 'cream';
  }
}

/** Offers only the valid next statuses for this role (ORDER_TRANSITIONS), with an optional note. */
export function StatusActions({ status, role, busy, onChange }: { status: OrderStatus; role: StaffRole; busy?: boolean; onChange: (next: OrderStatus, note: string) => void }) {
  const [note, setNote] = useState('');
  const options = nextStatuses(status, role);
  if (options.length === 0) {
    return <p className="text-sm text-zinc-500">No further status changes are available for this order.</p>;
  }
  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-600" htmlFor="status-note">
        Note (optional)
      </label>
      <Input id="status-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Rider on the way" />
      <div className="flex flex-wrap gap-2">
        {options.map((s) => (
          <Button
            key={s}
            variant={s === 'CANCELLED' ? 'danger' : 'primary'}
            disabled={busy}
            onClick={() => {
              onChange(s, note);
              setNote('');
            }}
          >
            {s === 'CANCELLED' ? 'Cancel order' : `Mark ${humanize(s).toLowerCase()}`}
          </Button>
        ))}
      </div>
    </div>
  );
}
