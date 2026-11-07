/** Mutable scene state shared by the DOM (GSAP/ScrollTrigger) and the R3F frame loop. Not React state on purpose. */
export type SceneSection = 'portal' | 'anatomy' | 'universe' | 'fire' | 'final' | 'off';

export const sceneState = {
  section: 'portal' as SceneSection,
  /** 0..1, scrubbed by the pinned Anatomy section */
  explode: 0,
  /** 0..1, scrubbed through the Fire Dimension section */
  fire: 0,
  /** ingredient slug highlighted in the Ingredient Universe */
  highlight: null as string | null,
  mouseX: 0,
  mouseY: 0,
  /** true while the idle/attract overlay covers the page: the 3D render loop stops. */
  paused: false,
};

const listeners = new Set<() => void>();

export function setScenePaused(paused: boolean) {
  if (sceneState.paused === paused) return;
  sceneState.paused = paused;
  listeners.forEach((l) => l());
}

export function subscribeScenePaused(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export const getScenePaused = () => sceneState.paused;
