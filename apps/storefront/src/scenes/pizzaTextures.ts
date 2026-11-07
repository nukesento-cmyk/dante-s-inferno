import * as THREE from 'three';
import { mulberry32 } from './toppingGeo';
import { vnoise } from './pizzaNoise';

export interface PizzaTextures {
  crustMap: THREE.CanvasTexture;
  /** Grayscale bumps + roughness for the crust. */
  crustBump: THREE.CanvasTexture;
  doughMap: THREE.CanvasTexture;
  sauceMap: THREE.CanvasTexture;
  sauceBump: THREE.CanvasTexture;
  sauceRough: THREE.CanvasTexture;
  cheeseMap: THREE.CanvasTexture;
  cheeseBump: THREE.CanvasTexture;
}

type Ctx = CanvasRenderingContext2D;

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement, srgb: boolean, wrapS = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  if (wrapS) t.wrapS = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

function blob(g: Ctx, x: number, y: number, rx: number, ry: number, stops: [number, string][]) {
  g.save();
  g.translate(x, y);
  g.scale(1, ry / rx);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  stops.forEach(([o, c]) => grad.addColorStop(o, c));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, rx, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** Seamless-in-x wrapped drawing: repeats a draw at x and x +- width so wrap-around has no seam. */
function wrapX(w: number, x: number, r: number, draw: (x: number) => void) {
  draw(x);
  if (x < r) draw(x + w);
  if (x > w - r) draw(x - w);
}

function grain(g: Ctx, w: number, h: number, rnd: () => number, count: number, light: string, dark: string, maxR = 1.6) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = rnd() < 0.5 ? light : dark;
    g.beginPath();
    g.arc(rnd() * w, rnd() * h, 0.4 + rnd() * maxR, 0, Math.PI * 2);
    g.fill();
  }
}


/** Fast grayscale noise layer: computed at half resolution with ImageData, then smoothly upscaled. */
function noiseLayer(g: Ctx, w: number, h: number, fn: (x: number, y: number) => number) {
  const hw = w >> 1;
  const hh = h >> 1;
  const [tmp, tg] = canvas(hw, hh);
  const img = tg.createImageData(hw, hh);
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < hw; x++) {
      const v = fn(x * 2, y * 2);
      const i = (y * hw + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  tg.putImageData(img, 0, 0);
  g.drawImage(tmp, 0, 0, w, h);
}

/** Crust rim: texture u wraps around the pizza, v wraps around the tube (top at canvas y = 0.75 h). */
function paintCrust(): [HTMLCanvasElement, HTMLCanvasElement] {
  const W = 2048;
  const H = 256;
  const rnd = mulberry32(1337);
  const [c, g] = canvas(W, H);
  // base dough, golden on top, paler underneath
  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#d2a56a');
  base.addColorStop(0.3, '#c99455');
  base.addColorStop(0.5, '#e3bf86');
  base.addColorStop(0.75, '#cf9348');
  base.addColorStop(1, '#e3bf86');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  // baked browning in broad patches
  for (let i = 0; i < 140; i++) {
    const y = H * (0.5 + rnd() * 0.5);
    const r = 24 + rnd() * 70;
    wrapX(W, rnd() * W, r, (x) => blob(g, x, y, r * 1.6, r * 0.7, [[0, 'rgba(160,88,34,.42)'], [1, 'rgba(160,88,34,0)']]));
  }
  // mottling
  for (let i = 0; i < 1800; i++) {
    const r = 3 + rnd() * 12;
    const a = 0.04 + rnd() * 0.07;
    const col = rnd() < 0.5 ? `rgba(120,70,30,${a})` : `rgba(250,225,175,${a})`;
    wrapX(W, rnd() * W, r, (x) => blob(g, x, rnd() * H, r, r, [[0, col], [1, 'rgba(0,0,0,0)']]));
  }
  // leopard-spot char, concentrated on the upper face
  for (let i = 0; i < 300; i++) {
    const y = H * (0.75 + (rnd() - 0.5) * 0.46 * (0.4 + rnd()));
    const r = 4 + rnd() * 15;
    const halo = r * (1.8 + rnd());
    wrapX(W, rnd() * W, halo, (x) => {
      blob(g, x, y, halo * 1.3, halo * 0.8, [[0, 'rgba(110,52,18,.55)'], [1, 'rgba(110,52,18,0)']]);
      blob(g, x, y, r * 1.35, r, [[0, 'rgba(30,14,6,.95)'], [0.55, 'rgba(48,22,8,.8)'], [1, 'rgba(48,22,8,0)']]);
    });
  }
  // flour dusting
  for (let i = 0; i < 2600; i++) {
    const r = 0.5 + rnd() * 2.2;
    g.fillStyle = `rgba(255,250,238,${0.12 + rnd() * 0.4})`;
    g.beginPath();
    g.arc(rnd() * W, rnd() * H, r, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 70; i++) {
    const cx = rnd() * W;
    const cy = rnd() * H;
    for (let k = 0; k < 28; k++) {
      g.fillStyle = `rgba(255,250,238,${0.1 + rnd() * 0.3})`;
      g.beginPath();
      g.arc(cx + (rnd() - 0.5) * 36, cy + (rnd() - 0.5) * 14, 0.6 + rnd() * 1.8, 0, Math.PI * 2);
      g.fill();
    }
  }

  // bump / roughness: blistered air bubbles over fine grain
  const [b, bg] = canvas(W, H);
  bg.fillStyle = '#b4b4b4';
  bg.fillRect(0, 0, W, H);
  noiseLayer(bg, W, H, (x, y) => 150 + (vnoise(x * 0.045, y * 0.045, 3) * 0.7 + vnoise(x * 0.19, y * 0.19, 9) * 0.3) * 80);
  for (let i = 0; i < 220; i++) {
    const r = 6 + rnd() * 20;
    const y = H * (0.75 + (rnd() - 0.5) * 0.7);
    wrapX(W, rnd() * W, r, (x) => {
      blob(bg, x, y, r * 1.3, r, [[0, 'rgba(255,255,255,.7)'], [0.7, 'rgba(255,255,255,.25)'], [0.88, 'rgba(0,0,0,.35)'], [1, 'rgba(0,0,0,0)']]);
    });
  }
  grain(bg, W, H, rnd, 3000, 'rgba(255,255,255,.35)', 'rgba(0,0,0,.3)');
  return [c, b];
}

function paintDough(): HTMLCanvasElement {
  const S = 512;
  const rnd = mulberry32(77);
  const [c, g] = canvas(S, S);
  g.fillStyle = '#e8cb93';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 300; i++) {
    const r = 8 + rnd() * 30;
    blob(g, rnd() * S, rnd() * S, r, r, [[0, rnd() < 0.5 ? 'rgba(190,140,80,.14)' : 'rgba(255,240,205,.14)'], [1, 'rgba(0,0,0,0)']]);
  }
  grain(g, S, S, rnd, 1600, 'rgba(255,252,240,.5)', 'rgba(140,90,40,.25)');
  return c;
}

function paintSauce(): [HTMLCanvasElement, HTMLCanvasElement, HTMLCanvasElement] {
  const S = 1024;
  const rnd = mulberry32(2024);
  const [c, g] = canvas(S, S);
  g.fillStyle = '#a81d0e';
  g.fillRect(0, 0, S, S);
  // reduced, darker patches and brighter fresh patches
  for (let i = 0; i < 260; i++) {
    const r = 25 + rnd() * 95;
    blob(g, rnd() * S, rnd() * S, r, r * (0.6 + rnd() * 0.5), [[0, 'rgba(72,8,4,.2)'], [1, 'rgba(72,8,4,0)']]);
  }
  for (let i = 0; i < 160; i++) {
    const r = 15 + rnd() * 60;
    blob(g, rnd() * S, rnd() * S, r, r, [[0, 'rgba(222,70,32,.16)'], [1, 'rgba(222,70,32,0)']]);
  }
  // seeds and herb flecks
  for (let i = 0; i < 1100; i++) {
    const t = rnd();
    g.fillStyle = t < 0.4 ? 'rgba(74,92,30,.6)' : t < 0.7 ? 'rgba(40,14,8,.55)' : 'rgba(214,160,60,.45)';
    g.beginPath();
    g.ellipse(rnd() * S, rnd() * S, 0.8 + rnd() * 2.6, 0.6 + rnd() * 1.6, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // oil droplets
  const [r, rg] = canvas(S / 2, S / 2);
  rg.fillStyle = '#a0a0a0';
  rg.fillRect(0, 0, S / 2, S / 2);
  for (let i = 0; i < 170; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const rad = 5 + rnd() * 22;
    blob(g, x, y, rad, rad * 0.85, [[0, 'rgba(255,150,40,.3)'], [0.8, 'rgba(255,120,30,.2)'], [1, 'rgba(255,120,30,0)']]);
    blob(g, x - rad * 0.25, y - rad * 0.3, rad * 0.35, rad * 0.25, [[0, 'rgba(255,230,170,.5)'], [1, 'rgba(255,230,170,0)']]);
    blob(rg, x / 2, y / 2, rad / 2, rad * 0.42, [[0, 'rgba(10,10,10,1)'], [0.85, 'rgba(10,10,10,.9)'], [1, 'rgba(10,10,10,0)']]);
  }
  const [b, bg] = canvas(S / 2, S / 2);
  bg.fillStyle = '#808080';
  bg.fillRect(0, 0, S / 2, S / 2);
  noiseLayer(bg, S / 2, S / 2, (x, y) => 90 + (vnoise(x * 0.05, y * 0.05, 5) * 0.65 + vnoise(x * 0.2, y * 0.2, 1) * 0.35) * 90);
  return [c, b, r];
}

/** Irregular melted cheese: coverage lives in the alpha channel, bump holds the domed blobs. */
function paintCheese(): [HTMLCanvasElement, HTMLCanvasElement] {
  const S = 1024;
  const rnd = mulberry32(555);
  const [c, g] = canvas(S, S);
  const [b, bg] = canvas(S, S);
  bg.fillStyle = '#000';
  bg.fillRect(0, 0, S, S);
  bg.globalCompositeOperation = 'lighten';
  const half = S / 2;
  const blobs: { x: number; y: number; r: number }[] = [];
  // solid core so the middle never shows sauce, then melted blobs thinning toward the rim
  for (let i = 0; i < 60; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * half * 0.62;
    blobs.push({ x: half + Math.cos(a) * d, y: half + Math.sin(a) * d, r: 55 + rnd() * 50 });
  }
  for (let i = 0; i < 190; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * half * 0.93;
    blobs.push({ x: half + Math.cos(a) * d, y: half + Math.sin(a) * d, r: 32 + rnd() * 48 });
  }
  const tints = [
    ['#fcecbd', '#f4dc94', '#e8c26e'],
    ['#f8e3a8', '#f0cf7d', '#dfb35c'],
    ['#fff2cd', '#f7e2a4', '#ecca7b'],
  ];
  for (const bl of blobs) {
    const t = tints[Math.floor(rnd() * tints.length)]!;
    const sq = 0.7 + rnd() * 0.5;
    blob(g, bl.x, bl.y, bl.r, bl.r * sq, [[0, t[0]!], [0.62, t[1]!], [0.92, t[2]!], [1, 'rgba(228,184,100,0)']]);
    blob(bg, bl.x, bl.y, bl.r, bl.r * sq, [[0, 'rgba(255,255,255,1)'], [0.55, 'rgba(190,190,190,1)'], [0.95, 'rgba(60,60,60,1)'], [1, 'rgba(0,0,0,1)']]);
  }
  // browned, blistered spots (only where cheese exists)
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 110; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * half * 0.9;
    const r = 7 + rnd() * 30;
    const x = half + Math.cos(a) * d;
    const y = half + Math.sin(a) * d;
    blob(g, x, y, r, r * (0.6 + rnd() * 0.6), [[0, 'rgba(120,58,18,.85)'], [0.5, 'rgba(176,100,36,.55)'], [1, 'rgba(200,130,50,0)']]);
  }
  // pale oily sheen spots
  for (let i = 0; i < 70; i++) {
    const r = 6 + rnd() * 16;
    blob(g, rnd() * S, rnd() * S, r, r * 0.8, [[0, 'rgba(255,238,170,.5)'], [1, 'rgba(255,238,170,0)']]);
  }
  g.globalCompositeOperation = 'source-over';
  // small bubbles in the bump map
  bg.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 160; i++) {
    const r = 3 + rnd() * 9;
    blob(bg, rnd() * S, rnd() * S, r, r, [[0, 'rgba(255,255,255,.35)'], [0.8, 'rgba(255,255,255,.18)'], [1, 'rgba(0,0,0,0)']]);
  }
  return [c, b];
}

let cache: PizzaTextures | undefined;

/** Textures are painted once and shared by every pizza on the page (they are intentionally never disposed). */
export function getPizzaTextures(): PizzaTextures {
  if (cache) return cache;
  const [crust, crustBump] = paintCrust();
  const [sauce, sauceBump, sauceRough] = paintSauce();
  const [cheese, cheeseBump] = paintCheese();
  cache = {
    crustMap: toTexture(crust, true, true),
    crustBump: toTexture(crustBump, false, true),
    doughMap: toTexture(paintDough(), true),
    sauceMap: toTexture(sauce, true),
    sauceBump: toTexture(sauceBump, false),
    sauceRough: toTexture(sauceRough, false),
    cheeseMap: toTexture(cheese, true),
    cheeseBump: toTexture(cheeseBump, false),
  };
  return cache;
}
