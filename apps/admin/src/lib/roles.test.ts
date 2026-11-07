import { describe, expect, it } from 'vitest';
import { canAccess, homeFor, navForRole, nextStatuses } from './roles';

const paths = (r: Parameters<typeof navForRole>[0]) => navForRole(r).map((n) => n.to);

describe('role-based navigation', () => {
  it('OWNER sees everything including staff', () => {
    expect(paths('OWNER')).toContain('/staff');
    expect(paths('OWNER')).toContain('/settings');
  });
  it('MANAGER sees all but staff', () => {
    expect(paths('MANAGER')).not.toContain('/staff');
    expect(paths('MANAGER')).toContain('/settings');
    expect(paths('MANAGER')).toContain('/products');
  });
  it('ORDER_STAFF sees orders and payments only', () => {
    expect(paths('ORDER_STAFF')).toEqual(['/orders', '/payments']);
  });
  it('KITCHEN sees orders only and lands there', () => {
    expect(paths('KITCHEN')).toEqual(['/orders']);
    expect(homeFor('KITCHEN')).toBe('/orders');
    expect(homeFor('OWNER')).toBe('/');
  });
  it('guards direct URL access', () => {
    expect(canAccess('KITCHEN', '/settings')).toBe(false);
    expect(canAccess('MANAGER', '/staff')).toBe(false);
    expect(canAccess('OWNER', '/staff')).toBe(true);
    expect(canAccess('ORDER_STAFF', '/payments')).toBe(true);
  });
});

describe('nextStatuses', () => {
  it('follows ORDER_TRANSITIONS', () => {
    expect(nextStatuses('PAID', 'OWNER')).toEqual(['ACCEPTED', 'CANCELLED']);
    expect(nextStatuses('COMPLETED', 'OWNER')).toEqual([]);
  });
  it('limits KITCHEN to PREPARING/READY', () => {
    expect(nextStatuses('ACCEPTED', 'KITCHEN')).toEqual(['PREPARING']);
    expect(nextStatuses('PREPARING', 'KITCHEN')).toEqual(['READY']);
    expect(nextStatuses('PAID', 'KITCHEN')).toEqual([]);
  });
});
