import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { validatePhoneInput } from './phone';
import { PhoneField } from '../components/PhoneField';

describe('phone input', () => {
  it('accepts 07… and normalises to E.164', () => {
    expect(validatePhoneInput('0712 345 678')).toEqual({ value: '+254712345678', error: null });
    expect(validatePhoneInput('+254 712-345-678').value).toBe('+254712345678');
  });
  it('rejects invalid numbers and empty required input', () => {
    expect(validatePhoneInput('12345').error).toBeTruthy();
    expect(validatePhoneInput('').error).toBeTruthy();
    expect(validatePhoneInput('', { required: false }).error).toBeNull();
  });

  it('PhoneField shows an error after blur', () => {
    function Harness() {
      const [v, setV] = useState('');
      return <PhoneField label="Phone" value={v} onChange={setV} />;
    }
    render(<Harness />);
    const input = screen.getByLabelText('Phone');
    fireEvent.change(input, { target: { value: '0712' } });
    fireEvent.blur(input);
    expect(screen.getByRole('alert').textContent).toMatch(/Kenyan number/);
    fireEvent.change(input, { target: { value: '0712345678' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
