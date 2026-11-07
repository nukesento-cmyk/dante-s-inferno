/** All money is integer KES cents. KES 1,250 === 125000. Never use floats for stored amounts. */
export type Cents = number;

export const CURRENCY = 'KES' as const;

export function kes(shillings: number): Cents {
  return Math.round(shillings * 100);
}

export function assertCents(value: number, label = 'amount'): asserts value is Cents {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer number of cents, got ${value}`);
  }
}

/** "KES 1,250" (whole shillings) or "KES 1,250.50" when there are cents. */
export function formatKes(cents: Cents): string {
  const whole = cents % 100 === 0;
  return (
    'KES ' +
    (cents / 100).toLocaleString('en-KE', {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
}

/** Parse a user-entered shilling amount ("1,250", "1250.5") into cents. Returns null if invalid. */
export function parseKes(input: string): Cents | null {
  const cleaned = input.replace(/kes|ksh|,|\s/gi, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}
