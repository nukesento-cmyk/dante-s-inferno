import { describe, expect, it } from 'vitest';
import { formatKes, getOrderingState, normalizeKenyanPhone, priceLine, priceOrder, renderTemplate } from './index';

describe('pricing', () => {
  it('prices a line with crust and extras', () => {
    expect(priceLine({ sizePriceCents: 125000, crustAdjustmentCents: 25000, extraToppingSurchargesCents: [10000, 20000], quantity: 2 }))
      .toEqual({ unitPriceCents: 180000, lineTotalCents: 360000 });
  });
  const zone = { feeCents: 15000, minOrderCents: 60000, freeDeliveryFromCents: 250000, active: true };
  it('adds delivery fee and extracts inclusive VAT', () => {
    const p = priceOrder({ lineTotalsCents: [125000], fulfilment: 'DELIVERY', zone, packagingFeeCents: 0, vatRateBps: 1600, pricesIncludeVat: true });
    expect(p.totalCents).toBe(140000);
    expect(p.vatCents).toBe(19310);
    expect(p.remainingForFreeDeliveryCents).toBe(125000);
    expect(p.problems).toEqual([]);
  });
  it('gives free delivery over threshold and flags minimums', () => {
    expect(priceOrder({ lineTotalsCents: [260000], fulfilment: 'DELIVERY', zone, packagingFeeCents: 0, vatRateBps: 1600, pricesIncludeVat: true }).deliveryFeeCents).toBe(0);
    expect(priceOrder({ lineTotalsCents: [50000], fulfilment: 'DELIVERY', zone, packagingFeeCents: 0, vatRateBps: 1600, pricesIncludeVat: true }).problems).toContain('BELOW_MINIMUM');
  });
  it('collection has no delivery fee', () => {
    expect(priceOrder({ lineTotalsCents: [50000], fulfilment: 'COLLECTION', zone: null, packagingFeeCents: 2000, vatRateBps: 1600, pricesIncludeVat: false }).totalCents).toBe(60320);
  });
});

describe('phone', () => {
  it.each(['0712345678', '712 345 678', '254712345678', '+254-712-345-678', '0110345678'])('normalizes %s', (v) => {
    expect(normalizeKenyanPhone(v)).toMatch(/^\+254[17]\d{8}$/);
  });
  it('rejects bad numbers', () => {
    expect(normalizeKenyanPhone('0812345678')).toBeNull();
    expect(normalizeKenyanPhone('12345')).toBeNull();
  });
});

describe('hours', () => {
  const hours = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, openTime: '10:00', closeTime: '22:00', closed: d === 1 }));
  const base = { hours, closures: [], lastOrderMinutesBeforeClose: 30, orderingPaused: false };
  // 2026-11-07 is a Saturday. 12:00 Nairobi = 09:00 UTC
  it('open at midday', () => {
    expect(getOrderingState({ ...base, now: new Date('2026-11-07T09:00:00Z') }).open).toBe(true);
  });
  it('closed after last order', () => {
    const s = getOrderingState({ ...base, now: new Date('2026-11-07T18:40:00Z') });
    expect(s).toMatchObject({ open: false, reason: 'AFTER_LAST_ORDER', nextOpening: { date: '2026-11-08', time: '10:00' } });
  });
  it('skips closed Monday', () => {
    const s = getOrderingState({ ...base, now: new Date('2026-11-08T20:00:00Z') });
    expect(s).toMatchObject({ open: false, nextOpening: { date: '2026-11-10' } });
  });
  it('special closure wins', () => {
    const s = getOrderingState({ ...base, closures: [{ date: '2026-11-07', closed: true, openTime: null, closeTime: null, label: 'Staff day' }], now: new Date('2026-11-07T09:00:00Z') });
    expect(s).toMatchObject({ open: false, reason: 'SPECIAL_CLOSURE' });
  });
});

describe('misc', () => {
  it('formats KES', () => expect(formatKes(125000)).toBe('KES 1,250'));
  it('renders templates', () => expect(renderTemplate('Hi {customerName}, {x}', { customerName: 'Wanjiku' })).toBe('Hi Wanjiku, {x}'));
});
