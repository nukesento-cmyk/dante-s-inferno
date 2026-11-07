import { orderingBadge } from '../lib/hours';
import type { Settings } from '../services/types';

export function OpenBadge({ settings }: { settings: Settings | undefined }) {
  if (!settings) return null;
  const b = orderingBadge(settings.ordering);
  return (
    <span className={`badge ${b.open ? 'badge-open' : 'badge-closed'}`}>
      <span className="dot" aria-hidden="true" />
      {b.text}
    </span>
  );
}
