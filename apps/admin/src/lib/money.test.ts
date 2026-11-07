import { describe, expect, it } from 'vitest';
import { bpsToPercent, centsToKes, kesToCents, percentToBps } from './money';

describe('KES input conversion', () => {
  it('converts typed shillings to integer cents', () => {
    expect(kesToCents('1250')).toBe(125000);
    expect(kesToCents('1,250')).toBe(125000);
    expect(kesToCents('KES 650.5')).toBe(65050);
    expect(kesToCents('0')).toBe(0);
  });
  it('rejects blank and invalid input', () => {
    expect(kesToCents('')).toBeNull();
    expect(kesToCents('abc')).toBeNull();
    expect(kesToCents('-5')).toBeNull();
    expect(kesToCents('1.234')).toBeNull();
  });
  it('formats cents back to editable shillings', () => {
    expect(centsToKes(125000)).toBe('1250');
    expect(centsToKes(65050)).toBe('650.50');
    expect(centsToKes(null)).toBe('');
  });
  it('round-trips and avoids float drift', () => {
    expect(kesToCents(centsToKes(1999))).toBe(1999);
    expect(kesToCents('19.99')).toBe(1999);
  });
  it('converts VAT percent and basis points', () => {
    expect(percentToBps('16')).toBe(1600);
    expect(percentToBps('16.5')).toBe(1650);
    expect(percentToBps('x')).toBeNull();
    expect(bpsToPercent(1600)).toBe('16');
  });
});
