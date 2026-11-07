const NAIROBI_OFFSET = '+03:00';

export function nairobiDate(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(d);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dayStart(date: string): Date {
  return new Date(`${date}T00:00:00${NAIROBI_OFFSET}`);
}

/** [start, end) in restaurant time; `to` is inclusive. */
export function dateRange(from?: string, to?: string, defaultDays = 30) {
  const today = nairobiDate();
  const toDate = to ?? today;
  const fromDate = from ?? addDays(toDate, -(defaultDays - 1));
  return { fromDate, toDate, start: dayStart(fromDate), end: dayStart(addDays(toDate, 1)) };
}

export const dateQuery = /^\d{4}-\d{2}-\d{2}$/;
