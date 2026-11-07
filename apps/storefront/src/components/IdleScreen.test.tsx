import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sceneState } from '../scenes/sceneState';
import { IdleScreen, idleSecondsFromSearch, isIdleExcluded, nextRandomHero } from './IdleScreen';

const NAME = "Dante's Pizza showcase";
const show = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <IdleScreen timeoutSeconds={5} />
    </MemoryRouter>,
  );
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe('IdleScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    act(() => void vi.advanceTimersByTime(1000)); // let the click shield expire
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('appears after the timeout with no activity', () => {
    show();
    tick(4900);
    expect(screen.queryByRole('dialog', { name: NAME })).toBeNull();
    tick(200);
    expect(screen.getByRole('dialog', { name: NAME })).toBeTruthy();
    expect(screen.getByText('FRESHLY MADE. BOLDLY DIFFERENT.')).toBeTruthy();
    expect(screen.getByText('Tap anywhere to order')).toBeTruthy();
    expect(sceneState.paused).toBe(true);
  });

  it('activity postpones it', () => {
    show();
    tick(4000);
    fireEvent.pointerMove(window, { clientX: 5, clientY: 5 });
    tick(4000);
    expect(screen.queryByRole('dialog')).toBeNull();
    tick(1500);
    expect(screen.getByRole('dialog', { name: NAME })).toBeTruthy();
  });

  it('dismisses on keydown and resumes the 3D loop', () => {
    show();
    tick(5100);
    fireEvent.keyDown(window, { key: 'a' });
    tick(500);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sceneState.paused).toBe(false);
  });

  it('closes on Escape and on pointerdown', () => {
    show();
    tick(5100);
    fireEvent.keyDown(window, { key: 'Escape' });
    tick(500);
    expect(screen.queryByRole('dialog')).toBeNull();
    tick(5100);
    expect(screen.getByRole('dialog', { name: NAME })).toBeTruthy();
    fireEvent.pointerDown(window);
    tick(500);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('swallows the click that follows the dismissing tap', () => {
    const onClick = vi.fn();
    render(
      <MemoryRouter>
        <button onClick={onClick}>under</button>
        <IdleScreen timeoutSeconds={5} />
      </MemoryRouter>,
    );
    tick(5100);
    fireEvent.pointerDown(window);
    fireEvent.click(screen.getByText('under'));
    expect(onClick).not.toHaveBeenCalled();
    tick(800);
    fireEvent.click(screen.getByText('under'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it.each(['/checkout', '/customize/abc', '/order/DP-1', '/account', '/account/orders', '/cart'])('never shows on %s', (path) => {
    show(path);
    tick(60_000);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not show while another dialog is open', () => {
    render(
      <MemoryRouter>
        <div role="dialog" aria-label="Pick a size">modal</div>
        <IdleScreen timeoutSeconds={5} />
      </MemoryRouter>,
    );
    tick(20_000);
    expect(screen.queryByRole('dialog', { name: NAME })).toBeNull();
  });

  it('helpers', () => {
    expect(isIdleExcluded('/')).toBe(false);
    expect(isIdleExcluded('/menu')).toBe(false);
    expect(isIdleExcluded('/cart')).toBe(true);
    expect(idleSecondsFromSearch('?idle=5', 60)).toBe(5);
    expect(idleSecondsFromSearch('?idle=abc', 60)).toBe(60);
    expect(idleSecondsFromSearch('', 60)).toBe(60);
    let prev: string | null = null;
    for (let i = 0; i < 200; i++) {
      const n: string = nextRandomHero(prev).name;
      expect(n).not.toBe(prev);
      prev = n;
    }
  });
});
