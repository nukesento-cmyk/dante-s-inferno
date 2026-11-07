import * as THREE from 'three';

export interface ToppingSpec {
  modelKey: string;
  color: string;
}

export type ToppingKind = 'pepperoni' | 'olive' | 'mushroom' | 'pepper' | 'onion' | 'leaf' | 'meat' | 'chunk' | 'corn' | 'tomato' | 'default';

export function toppingKind(modelKey: string): ToppingKind {
  const k = modelKey.toLowerCase();
  if (/pepperoni|salami|chorizo/.test(k)) return 'pepperoni';
  if (/olive/.test(k)) return 'olive';
  if (/mushroom/.test(k)) return 'mushroom';
  if (/jalape|pepper|capsicum|chili|chilli/.test(k)) return 'pepper';
  if (/onion/.test(k)) return 'onion';
  if (/basil|herb|spinach|leaf|rocket|oregano/.test(k)) return 'leaf';
  if (/sausage|chicken|beef|ham|bacon|meat|steak/.test(k)) return 'meat';
  if (/pineapple|cheese|feta|paneer/.test(k)) return 'chunk';
  if (/corn/.test(k)) return 'corn';
  if (/tomato/.test(k)) return 'tomato';
  return 'default';
}

/** Procedural stand-ins for the future GLB models. Geometries are lying flat (Y up). */
export function makeToppingGeometry(modelKey: string): THREE.BufferGeometry {
  switch (toppingKind(modelKey)) {
    case 'pepperoni':
      return new THREE.CylinderGeometry(0.13, 0.13, 0.03, 20);
    case 'olive':
      return new THREE.TorusGeometry(0.055, 0.022, 8, 16).rotateX(Math.PI / 2);
    case 'mushroom':
      return new THREE.SphereGeometry(0.1, 12, 8).scale(1.1, 0.35, 0.8);
    case 'pepper':
      return new THREE.BoxGeometry(0.24, 0.025, 0.05);
    case 'onion':
      return new THREE.TorusGeometry(0.1, 0.013, 6, 20).rotateX(Math.PI / 2);
    case 'leaf':
      return new THREE.SphereGeometry(0.09, 10, 6).scale(1.2, 0.15, 0.7);
    case 'meat':
      return new THREE.SphereGeometry(0.07, 10, 8).scale(1, 0.6, 1);
    case 'chunk':
      return new THREE.BoxGeometry(0.11, 0.05, 0.11);
    case 'corn':
      return new THREE.SphereGeometry(0.035, 8, 6);
    case 'tomato':
      return new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16);
    default:
      return new THREE.CylinderGeometry(0.07, 0.07, 0.03, 12);
  }
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
