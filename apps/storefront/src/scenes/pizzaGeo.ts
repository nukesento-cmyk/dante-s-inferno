import * as THREE from 'three';
import { fbm, smoothstep } from './pizzaNoise';

interface DiscOptions {
  radius: number;
  rings?: number;
  segs?: number;
  /** Surface height at a point. r01 is 0 at the centre and 1 at the nominal edge. */
  height: (r01: number, theta: number, x: number, z: number) => number;
  /** Multiplier on the radius at a given angle (irregular melted edge). */
  edge?: (theta: number) => number;
}

/** Polar-grid disc facing +Y with planar UVs (the texture is a top-down picture of the disc). */
export function makeDiscGeometry({ radius, rings = 28, segs = 96, height, edge }: DiscOptions): THREE.BufferGeometry {
  const count = 1 + rings * segs;
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  pos[1] = height(0, 0, 0, 0);
  uv[0] = uv[1] = 0.5;
  let k = 1;
  for (let i = 1; i <= rings; i++) {
    const r01 = i / rings;
    for (let j = 0; j < segs; j++) {
      const th = (j / segs) * Math.PI * 2;
      const rr = radius * r01 * (edge ? 1 + (edge(th) - 1) * r01 * r01 : 1);
      const x = Math.cos(th) * rr;
      const z = Math.sin(th) * rr;
      pos[k * 3] = x;
      pos[k * 3 + 1] = height(r01, th, x, z);
      pos[k * 3 + 2] = z;
      // UVs follow the nominal (round) disc so painted blobs line up with the geometry.
      uv[k * 2] = 0.5 + 0.5 * r01 * Math.cos(th);
      uv[k * 2 + 1] = 0.5 - 0.5 * r01 * Math.sin(th);
      k++;
    }
  }
  const idx: number[] = [];
  const at = (ring: number, j: number) => 1 + (ring - 1) * segs + (j % segs);
  for (let j = 0; j < segs; j++) idx.push(0, at(1, j + 1), at(1, j));
  for (let i = 1; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = at(i, j);
      const b = at(i, j + 1);
      const c = at(i + 1, j);
      const d = at(i + 1, j + 1);
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Crust rim: a torus whose radius, tube thickness and cross-section are displaced by noise, so it looks hand-stretched.
 * UV: u runs around the pizza, v around the tube with v = 0.25 at the top.
 */
export function makeCrustGeometry(R = 0.93, r = 0.125, segs = 192, tube = 32): THREE.BufferGeometry {
  const w = segs + 1;
  const h = tube + 1;
  const pos = new Float32Array(w * h * 3);
  const uv = new Float32Array(w * h * 2);
  let k = 0;
  for (let i = 0; i <= segs; i++) {
    const th = ((i % segs) / segs) * Math.PI * 2;
    const ct = Math.cos(th);
    const st = Math.sin(th);
    const wobble = (fbm(ct * 1.6 + 7, st * 1.6 + 3, 0.5, 3) - 0.5) * 0.07;
    for (let j = 0; j <= tube; j++) {
      const ph = ((j % tube) / tube) * Math.PI * 2;
      const cp = Math.cos(ph);
      const sp = Math.sin(ph);
      const lump = fbm(ct * 3.4 + cp * 0.7, st * 3.4 + sp * 0.7, sp * 0.7 + 2.1, 4) - 0.5;
      const fine = fbm(ct * 11 + cp, st * 11 + sp, 4.2, 2) - 0.5;
      const rr = r * (1 + lump * 0.55 + fine * 0.12);
      const rad = R + wobble + rr * cp;
      pos[k * 3] = ct * rad;
      pos[k * 3 + 1] = rr * 0.9 * sp;
      pos[k * 3 + 2] = st * rad;
      uv[k * 2] = i / segs;
      uv[k * 2 + 1] = j / tube;
      k++;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < tube; j++) {
      const a = i * h + j;
      const b = (i + 1) * h + j;
      const c = i * h + j + 1;
      const d = (i + 1) * h + j + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Smooth the normals across both seams (first and last row/column share positions).
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const merge = (a: number, b: number) => {
    const x = n.getX(a) + n.getX(b);
    const y = n.getY(a) + n.getY(b);
    const z = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l);
    n.setXYZ(b, x / l, y / l, z / l);
  };
  for (let j = 0; j <= tube; j++) merge(j, segs * h + j);
  for (let i = 0; i <= segs; i++) merge(i * h, i * h + tube);
  return g;
}

export const cheeseHeight = (r01: number, _t: number, x: number, z: number) =>
  0.012 + 0.024 * fbm(x * 3.2 + 4, z * 3.2 + 9, 1.3, 4) - 0.02 * smoothstep(0.78, 1, r01);
export const cheeseEdge = (th: number) => 1 + (fbm(Math.cos(th) * 2.6 + 11, Math.sin(th) * 2.6 + 5, 2, 3) - 0.5) * 0.12;
export const sauceHeight = (_r: number, _t: number, x: number, z: number) => 0.006 * fbm(x * 4 + 2, z * 4 + 6, 0.4, 3);
