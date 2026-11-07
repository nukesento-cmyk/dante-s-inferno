export const RESTAURANT_TIMEZONE = 'Africa/Nairobi';

export interface OpeningHoursDay {
  /** 0 = Sunday ... 6 = Saturday */
  dayOfWeek: number;
  /** "HH:MM" 24h */
  openTime: string;
  closeTime: string;
  closed: boolean;
}

export interface SpecialClosureRule {
  /** "YYYY-MM-DD" in restaurant time */
  date: string;
  closed: boolean;
  openTime: string | null;
  closeTime: string | null;
  label: string;
}

export interface OrderingWindowInput {
  now: Date;
  hours: OpeningHoursDay[];
  closures: SpecialClosureRule[];
  lastOrderMinutesBeforeClose: number;
  orderingPaused: boolean;
  timezone?: string;
}

export type OrderingState =
  | { open: true; closesAt: string; lastOrderAt: string }
  | { open: false; reason: 'PAUSED' | 'CLOSED_TODAY' | 'BEFORE_OPENING' | 'AFTER_LAST_ORDER' | 'SPECIAL_CLOSURE'; label?: string; nextOpening: { date: string; time: string } | null };

function localParts(now: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
    weekday,
  };
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
}

function fromMinutes(min: number): string {
  const h = Math.floor(min / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

function addDays(date: string, days: number): { date: string; weekday: number } {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return { date: d.toISOString().slice(0, 10), weekday: d.getUTCDay() };
}

/** Effective hours for a date: special closure overrides weekly hours. null = closed. */
function hoursFor(date: string, weekday: number, input: OrderingWindowInput) {
  const special = input.closures.find((c) => c.date === date);
  if (special) {
    if (special.closed || !special.openTime || !special.closeTime) return { closed: true as const, special };
    return { closed: false as const, open: toMinutes(special.openTime), close: toMinutes(special.closeTime), special };
  }
  const day = input.hours.find((h) => h.dayOfWeek === weekday);
  if (!day || day.closed) return { closed: true as const };
  return { closed: false as const, open: toMinutes(day.openTime), close: toMinutes(day.closeTime) };
}

/** Closing times past midnight are not supported in v1: closeTime must be after openTime. */
export function getOrderingState(input: OrderingWindowInput): OrderingState {
  const tz = input.timezone ?? RESTAURANT_TIMEZONE;
  const now = localParts(input.now, tz);

  const nextOpening = (): { date: string; time: string } | null => {
    for (let i = 0; i < 14; i++) {
      const { date, weekday } = addDays(now.date, i);
      const h = hoursFor(date, weekday, input);
      if (h.closed) continue;
      if (i === 0 && now.minutes >= h.open) continue;
      return { date, time: fromMinutes(h.open) };
    }
    return null;
  };

  if (input.orderingPaused) return { open: false, reason: 'PAUSED', nextOpening: null };

  const today = hoursFor(now.date, now.weekday, input);
  if (today.closed) {
    return {
      open: false,
      reason: today.special ? 'SPECIAL_CLOSURE' : 'CLOSED_TODAY',
      label: today.special?.label,
      nextOpening: nextOpening(),
    };
  }
  if (now.minutes < today.open) return { open: false, reason: 'BEFORE_OPENING', nextOpening: nextOpening() };
  const lastOrder = today.close - input.lastOrderMinutesBeforeClose;
  if (now.minutes >= lastOrder) return { open: false, reason: 'AFTER_LAST_ORDER', nextOpening: nextOpening() };
  return { open: true, closesAt: fromMinutes(today.close), lastOrderAt: fromMinutes(lastOrder) };
}
