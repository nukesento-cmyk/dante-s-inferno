import { useCallback, useEffect, useRef, useState } from 'react';

export const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

interface Options {
  timeoutMs: number;
  enabled: boolean;
  /** Last-moment veto (for example, a modal is open). When it returns false the countdown restarts. */
  canIdle?: () => boolean;
}

/** True once there has been no user activity for `timeoutMs`. Call `wake()` to leave the idle state. */
export function useIdle({ timeoutMs, enabled, canIdle }: Options) {
  const [idle, setIdle] = useState(false);
  const idleRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const canRef = useRef(canIdle);
  canRef.current = canIdle;

  const arm = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (canRef.current && !canRef.current()) {
        arm();
        return;
      }
      idleRef.current = true;
      setIdle(true);
    }, timeoutMs);
  }, [timeoutMs]);

  const wake = useCallback(() => {
    idleRef.current = false;
    setIdle(false);
    arm();
  }, [arm]);

  useEffect(() => {
    if (!enabled) {
      clearTimeout(timer.current);
      idleRef.current = false;
      setIdle(false);
      return;
    }
    const onActivity = () => {
      if (!idleRef.current) arm();
    };
    ACTIVITY_EVENTS.forEach((t) => window.addEventListener(t, onActivity, { capture: true, passive: true }));
    arm();
    return () => {
      clearTimeout(timer.current);
      ACTIVITY_EVENTS.forEach((t) => window.removeEventListener(t, onActivity, { capture: true }));
    };
  }, [enabled, arm]);

  return { idle: idle && enabled, wake };
}
