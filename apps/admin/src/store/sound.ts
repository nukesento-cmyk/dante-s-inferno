import { create } from 'zustand';

const KEY = 'dp-admin-muted';
function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
interface SoundState {
  muted: boolean;
  toggle: () => void;
}
export const useSound = create<SoundState>((set, get) => ({
  muted: read(),
  toggle: () => {
    const muted = !get().muted;
    try {
      localStorage.setItem(KEY, muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    set({ muted });
  },
}));

let ctx: AudioContext | null = null;
/** Two-tone chime generated with WebAudio (no asset needed). Browsers may block it until the first user gesture. */
export function playNewOrderSound() {
  if (useSound.getState().muted) return;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = ctx ?? new AC();
    const t0 = ctx.currentTime;
    [880, 1175, 880, 1175].forEach((f, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + i * 0.22);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.22 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.22 + 0.2);
      o.connect(g).connect(ctx!.destination);
      o.start(t0 + i * 0.22);
      o.stop(t0 + i * 0.22 + 0.21);
    });
  } catch {
    /* audio unavailable */
  }
}
