import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { HERO_IMAGES, IDLE_IMAGE, type HeroImage } from '../data/heroImages';
import { useIdle } from '../hooks/useIdle';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { setScenePaused } from '../scenes/sceneState';
import { WebImage } from './WebImage';

export const IDLE_SECONDS = 60;
export const IDLE_ROTATE_MS = 7000;
const FADE_OUT_MS = 350;
const SWALLOW_CLICK_MS = 600;
const MOVE_PX = 12;

/** People type on these pages, so the attract screen never starts there. */
const EXCLUDED = /^\/(checkout|customize|order|account|cart)(\/|$)/;
export const isIdleExcluded = (pathname: string) => EXCLUDED.test(pathname);

/** `?idle=5` overrides the timeout (seconds) for testing. */
export function idleSecondsFromSearch(search: string, fallback: number): number {
  const v = Number(new URLSearchParams(search).get('idle'));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

const modalOpen = () =>
  !!document.querySelector('dialog[open], [aria-modal="true"]:not([data-idle-screen]), [role="dialog"]:not([data-idle-screen]), [role="alertdialog"]');

/** Random hero image that differs from `prev`. */
export function nextRandomHero(prev: string | null, rnd: () => number = Math.random): HeroImage {
  const pool = HERO_IMAGES.filter((h) => h.name !== prev);
  return pool[Math.floor(rnd() * pool.length)]!;
}

/** Eat the click that follows the tap/keypress which dismissed the overlay. */
function swallowClicks(ms: number) {
  const eat = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', eat, true);
  setTimeout(() => window.removeEventListener('click', eat, true), ms);
}

interface Slide { key: number; img: HeroImage }

export function IdleScreen({ timeoutSeconds = IDLE_SECONDS, rotateMs = IDLE_ROTATE_MS, badge }: { timeoutSeconds?: number; rotateMs?: number; badge?: ReactNode }) {
  const { pathname } = useLocation();
  const reduced = useReducedMotion();
  const [seconds] = useState(() => idleSecondsFromSearch(typeof window === 'undefined' ? '' : window.location.search, timeoutSeconds));
  const enabled = !isIdleExcluded(pathname);
  const { idle, wake } = useIdle({ timeoutMs: seconds * 1000, enabled, canIdle: () => !modalOpen() });
  const [closing, setClosing] = useState(false);
  const [slides, setSlides] = useState<Slide[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const visible = idle || closing;

  const dismiss = useRef(() => {});
  dismiss.current = () => {
    if (!idle) return;
    swallowClicks(SWALLOW_CLICK_MS);
    wake();
    setClosing(true);
  };

  // Entering: remember focus, pause the 3D loop, start with the cinematic idle frame, then rotate heroes.
  useEffect(() => {
    if (!idle) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setScenePaused(true);
    setClosing(false);
    setSlides([{ key: 0, img: IDLE_IMAGE }]);
    let key = 0;
    let last: string | null = IDLE_IMAGE.name;
    const t = setInterval(() => {
      const img = nextRandomHero(last);
      last = img.name;
      key += 1;
      setSlides((s) => [...s.slice(-1), { key, img }]);
    }, rotateMs);
    return () => clearInterval(t);
  }, [idle, rotateMs]);

  useEffect(() => {
    if (idle) root.current?.focus({ preventScroll: true });
  }, [idle]);

  // Leaving: fade out, then restore focus and the 3D loop.
  useEffect(() => {
    if (!closing) return;
    setScenePaused(false);
    const f = returnFocus.current;
    returnFocus.current = null;
    if (f && document.contains(f)) f.focus({ preventScroll: true });
    const t = setTimeout(() => {
      setClosing(false);
      setSlides([]);
    }, FADE_OUT_MS);
    return () => clearTimeout(t);
  }, [closing]);

  useEffect(() => () => setScenePaused(false), []);

  // While showing, any input dismisses it and is kept away from the page underneath.
  useEffect(() => {
    if (!idle) return;
    let lastX = -1;
    let lastY = -1;
    const stop = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      stop(e);
      dismiss.current();
    };
    const onPointerDown = (e: Event) => {
      stop(e);
      dismiss.current();
    };
    const onOther = () => dismiss.current();
    const onMove = (e: PointerEvent) => {
      if (lastX < 0) {
        lastX = e.clientX;
        lastY = e.clientY;
        return;
      }
      if (Math.hypot(e.clientX - lastX, e.clientY - lastY) > MOVE_PX) dismiss.current();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('mousedown', stop, true);
    window.addEventListener('touchstart', onOther, { capture: true, passive: true });
    window.addEventListener('wheel', onOther, { capture: true, passive: true });
    window.addEventListener('pointermove', onMove, { capture: true, passive: true });
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('mousedown', stop, true);
      window.removeEventListener('touchstart', onOther, { capture: true });
      window.removeEventListener('wheel', onOther, { capture: true });
      window.removeEventListener('pointermove', onMove, { capture: true });
    };
  }, [idle]);

  if (!visible) return null;
  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label="Dante's Pizza showcase"
      data-idle-screen
      tabIndex={-1}
      className={`idle-screen ${closing ? 'is-closing' : ''} ${reduced ? 'is-reduced' : ''}`}
    >
      <div className="idle-slides" aria-hidden="true">
        {slides.map((s, i) => (
          <div key={s.key} className={`idle-slide kb-${s.img.kb} ${i === slides.length - 1 ? 'is-top' : ''}`}>
            <WebImage name={s.img.name} alt="" fill sizes="100vw" imgClassName="idle-kb" priority={s.key === 0} />
          </div>
        ))}
      </div>
      <div className="idle-shade" aria-hidden="true" />
      <div className="idle-content">
        <div className="idle-wordmark">
          <span className="wm-top wm-large">DANTE'S</span>
          <span className="wm-bottom wm-large">PIZZA</span>
        </div>
        <p className="idle-tag">FRESHLY MADE. BOLDLY DIFFERENT.</p>
        {badge}
        <p className="idle-cta">Tap anywhere to order</p>
      </div>
    </div>
  );
}
