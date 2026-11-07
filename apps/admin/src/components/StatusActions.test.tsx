// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusActions } from './StatusActions';

afterEach(cleanup);

describe('StatusActions', () => {
  it('shows only the valid transitions for PAID', () => {
    render(<StatusActions status="PAID" role="OWNER" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /mark accepted/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /cancel order/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /mark completed/i })).toBeNull();
  });
  it('sends the chosen status with the note', () => {
    const onChange = vi.fn();
    render(<StatusActions status="ACCEPTED" role="MANAGER" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/note/i), { target: { value: 'Busy oven' } });
    fireEvent.click(screen.getByRole('button', { name: /mark preparing/i }));
    expect(onChange).toHaveBeenCalledWith('PREPARING', 'Busy oven');
  });
  it('offers nothing for terminal states', () => {
    render(<StatusActions status="COMPLETED" role="OWNER" onChange={() => {}} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
  it('restricts KITCHEN', () => {
    render(<StatusActions status="PREPARING" role="KITCHEN" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /mark ready/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /out for delivery/i })).toBeNull();
  });
});
