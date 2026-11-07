import type { OpeningHoursDay, OrderingState } from '@dantes/shared';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const dayName = (d: number) => DAYS[d] ?? '';

export function nairobiToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(now);
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** "Open now · closes 22:00" / "Closed · opens Sun 10:00" */
export function orderingBadge(ordering: OrderingState | undefined, now = new Date()): { open: boolean; text: string } {
  if (!ordering) return { open: false, text: 'Hours unavailable' };
  if (ordering.open) return { open: true, text: `Open now · closes ${ordering.closesAt}` };
  if (ordering.reason === 'PAUSED') return { open: false, text: 'Orders paused' };
  return { open: false, text: `Closed${nextOpeningText(ordering, now) ? ' · opens ' + nextOpeningText(ordering, now) : ''}` };
}

export function nextOpeningText(ordering: OrderingState, now = new Date()): string | null {
  if (ordering.open || !ordering.nextOpening) return null;
  const { date, time } = ordering.nextOpening;
  return date === nairobiToday(now) ? `today ${time}` : `${dayName(weekdayOf(date))} ${time}`;
}

export function closedReason(ordering: OrderingState, pauseMessage?: string): string {
  if (ordering.open) return '';
  switch (ordering.reason) {
    case 'PAUSED':
      return pauseMessage || 'Online ordering is paused right now.';
    case 'SPECIAL_CLOSURE':
      return ordering.label ? `We are closed: ${ordering.label}.` : 'We are closed today.';
    case 'CLOSED_TODAY':
      return 'We are closed today.';
    case 'BEFORE_OPENING':
      return 'We have not opened yet today.';
    case 'AFTER_LAST_ORDER':
      return 'The kitchen has stopped taking orders for today.';
  }
}

/** Monday-first weekly list for display. */
export function weeklyHours(hours: OpeningHoursDay[]): { day: string; text: string }[] {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map((d) => {
    const h = hours.find((x) => x.dayOfWeek === d);
    return { day: dayName(d), text: !h || h.closed ? 'Closed' : `${h.openTime} – ${h.closeTime}` };
  });
}
