import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm, smoothstep, vnoise } from './pizzaNoise';

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

function addShade(geo: THREE.BufferGeometry, fn: (x: number, y: number, z: number) => number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = Math.min(1, Math.max(0.05, fn(pos.getX(i), pos.getY(i), pos.getZ(i))));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** Push vertices along their normals with noise, then rebuild normals. */
function roughen(input: THREE.BufferGeometry, amp: number, freq: number, seed = 0, weld = true): THREE.BufferGeometry {
  // Weld split vertices (faceted primitives, UV seams) so displaced shapes shade smoothly.
  let geo = input;
  if (weld) {
    input.deleteAttribute('uv');
    input.deleteAttribute('normal');
    geo = mergeVertices(input, 1e-4);
    geo.computeVertexNormals();
  }
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  for (let i = 0; i < pos.count; i++) {
    const d = (fbm(pos.getX(i) * freq + seed, pos.getY(i) * freq, pos.getZ(i) * freq + seed * 0.5, 3) - 0.5) * 2 * amp;
    pos.setXYZ(i, pos.getX(i) + nor.getX(i) * d, pos.getY(i) + nor.getY(i) * d, pos.getZ(i) + nor.getZ(i) * d);
  }
  if (weld) geo.computeVertexNormals();
  return geo;
}

const rimShade = (rMax: number, dark: number, speck = 0.18) => (x: number, y: number, z: number) => {
  const r = Math.hypot(x, z) / rMax;
  return 1 - dark * smoothstep(0.72, 1, r) + (vnoise(x * 90, z * 90, y * 90) - 0.5) * speck;
};

/** Pepperoni: a cupped slice, thicker and darker/charred at the curled rim. */
function pepperoni(): THREE.BufferGeometry {
  const pts = [
    [0, 0.004], [0.05, 0.001], [0.105, 0.002], [0.13, 0.008], [0.137, 0.02], [0.131, 0.03],
    [0.115, 0.0285], [0.085, 0.022], [0.045, 0.0175], [0, 0.016],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const curve = new THREE.SplineCurve(pts);
  const geo = new THREE.LatheGeometry(curve.getPoints(26), 36);
  return addShade(roughen(geo, 0.0016, 38, 1, false), rimShade(0.137, 0.62, 0.3));
}

/** Olive: a slice ring with an off-round outline and a dark glossy skin. */
function olive(): THREE.BufferGeometry {
  const geo = new THREE.TorusGeometry(0.05, 0.022, 10, 24).rotateX(Math.PI / 2).scale(1.08, 0.72, 0.9).translate(0, 0.016, 0);
  return addShade(roughen(geo, 0.003, 30, 3), (x, y, z) => 0.8 + (Math.hypot(x, z) < 0.05 ? -0.25 : 0.1) + (vnoise(x * 70, z * 70, y * 70) - 0.5) * 0.25);
}

/** Basil: a folded, slightly curled leaf with a lighter midrib. */
function leaf(): THREE.BufferGeometry {
  const L = 0.27;
  const W = 0.1;
  const ns = 12;
  const nt = 6;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= ns; i++) {
    const s = i / ns;
    const width = Math.pow(Math.sin(Math.PI * Math.pow(s, 0.75)), 0.8) * W;
    for (let j = 0; j <= nt; j++) {
      const t = (j / nt) * 2 - 1;
      const x = (s - 0.5) * L;
      const z = t * width;
      const y = 0.012 + Math.abs(t) * width * 0.55 + s * s * 0.03 + Math.sin(s * 9 + t) * 0.003;
      pos.push(x, y, z);
    }
  }
  for (let i = 0; i < ns; i++) {
    for (let j = 0; j < nt; j++) {
      const a = i * (nt + 1) + j;
      const b = a + 1;
      const c = a + nt + 1;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return addShade(geo, (x, _y, z) => 0.7 + 0.5 * Math.exp(-Math.pow(z / 0.012, 2)) + (vnoise(x * 60, z * 60) - 0.5) * 0.15);
}

function mushroom(): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  sh.moveTo(-0.028, 0);
  sh.lineTo(-0.03, 0.05);
  sh.bezierCurveTo(-0.14, 0.055, -0.14, 0.12, 0, 0.125);
  sh.bezierCurveTo(0.14, 0.12, 0.14, 0.055, 0.03, 0.05);
  sh.lineTo(0.028, 0);
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 10 });
  geo.rotateX(Math.PI / 2).translate(0, 0.02, -0.06);
  return addShade(roughen(geo, 0.002, 25, 5), (x, _y, z) => 0.85 + (z < -0.01 ? -0.1 : 0.05) + (vnoise(x * 50, z * 50) - 0.5) * 0.2);
}

function pepperStrip(): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(0.26, 0.018, 0.046, 12, 1, 2);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setY(i, pos.getY(i) + 0.025 * (1 - Math.pow(x / 0.13, 2)) + 0.012 + Math.sin(x * 22) * 0.003);
    pos.setZ(i, pos.getZ(i) + Math.sin(x * 14) * 0.012);
  }
  geo.computeVertexNormals();
  return addShade(roughen(geo, 0.0015, 40, 8), (x, y, z) => 0.85 + (y > 0.03 ? 0.15 : 0) + (vnoise(x * 40, z * 40) - 0.5) * 0.2);
}

function onionRing(): THREE.BufferGeometry {
  const geo = new THREE.TorusGeometry(0.1, 0.012, 6, 32, Math.PI * 1.55).rotateX(Math.PI / 2).translate(0, 0.014, 0);
  return addShade(roughen(geo, 0.003, 20, 2), (x, y, z) => 0.9 + (vnoise(x * 50, z * 50, y * 50) - 0.5) * 0.3);
}

function crumb(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(0.055, 2).scale(1, 0.55, 1).translate(0, 0.02, 0);
  return addShade(roughen(geo, 0.02, 24, 4), (x, y, z) => 0.7 + 0.5 * vnoise(x * 60, z * 60, y * 60));
}

function chunk(): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(0.11, 0.05, 0.11, 4, 2, 4).translate(0, 0.025, 0);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3(pos.getX(i), pos.getY(i) - 0.025, pos.getZ(i));
    const len = v.length();
    v.multiplyScalar(0.0).add(new THREE.Vector3(pos.getX(i), pos.getY(i) - 0.025, pos.getZ(i)).normalize().multiplyScalar(len * 0.18));
    pos.setXYZ(i, pos.getX(i) * 0.82 + v.x, pos.getY(i) * 0.82 + v.y + 0.0045, pos.getZ(i) * 0.82 + v.z);
  }
  geo.computeVertexNormals();
  return addShade(roughen(geo, 0.004, 26, 6), (x, y, z) => 0.85 + (vnoise(x * 50, z * 50, y * 50) - 0.5) * 0.35);
}

/** Procedural toppings. Geometries sit on y = 0 and are lying flat (Y up); a per-vertex `color` attribute shades them. */
export function makeToppingGeometry(modelKey: string): THREE.BufferGeometry {
  switch (toppingKind(modelKey)) {
    case 'pepperoni':
      return pepperoni();
    case 'olive':
      return olive();
    case 'mushroom':
      return mushroom();
    case 'pepper':
      return pepperStrip();
    case 'onion':
      return onionRing();
    case 'leaf':
      return leaf();
    case 'meat':
      return crumb();
    case 'chunk':
      return chunk();
    case 'corn':
      return addShade(roughen(new THREE.SphereGeometry(0.035, 10, 8).scale(1, 0.85, 1).translate(0, 0.03, 0), 0.002, 30), (x, y, z) => 0.9 + (vnoise(x * 80, z * 80, y * 80) - 0.5) * 0.2);
    case 'tomato':
      return addShade(roughen(new THREE.CylinderGeometry(0.1, 0.095, 0.022, 32, 2).translate(0, 0.011, 0), 0.0025, 20, 7), (x, y, z) => 0.85 + 0.2 * Math.cos(Math.atan2(z, x) * 3) * smoothstep(0.02, 0.09, Math.hypot(x, z)) - 0.25 * smoothstep(0.085, 0.1, Math.hypot(x, z)) + (vnoise(x * 60, z * 60, y * 60) - 0.5) * 0.12);
    default:
      return addShade(roughen(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 16).translate(0, 0.015, 0), 0.003, 28), rimShade(0.07, 0.3));
  }
}

export interface ToppingLook {
  roughness: number;
  clearcoat: number;
  doubleSide: boolean;
  /** Instance tilt (radians) so slices do not all lie perfectly flat. */
  tilt: number;
  sink: number;
}

export function toppingLook(modelKey: string): ToppingLook {
  switch (toppingKind(modelKey)) {
    case 'pepperoni':
      return { roughness: 0.42, clearcoat: 0.25, doubleSide: true, tilt: 0.1, sink: 0.004 };
    case 'olive':
      return { roughness: 0.3, clearcoat: 0.6, doubleSide: false, tilt: 0.08, sink: 0.006 };
    case 'leaf':
      return { roughness: 0.55, clearcoat: 0.15, doubleSide: true, tilt: 0.22, sink: 0.004 };
    case 'pepper':
      return { roughness: 0.4, clearcoat: 0.3, doubleSide: true, tilt: 0.12, sink: 0.005 };
    case 'tomato':
      return { roughness: 0.35, clearcoat: 0.4, doubleSide: false, tilt: 0.06, sink: 0.004 };
    case 'meat':
      return { roughness: 0.75, clearcoat: 0.1, doubleSide: false, tilt: 0.15, sink: 0.01 };
    default:
      return { roughness: 0.6, clearcoat: 0.12, doubleSide: true, tilt: 0.08, sink: 0.005 };
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
