import * as THREE from 'three';

/**
 * Canvas-generated textures for the studio room (no external assets).
 * Everything is deterministic (seeded PRNG) so the room looks the same on every load.
 *
 * Several generators also produce a tangent-space normal map; it is exposed on
 * `texture.userData.normal` (and `userData.rough` when relevant) so the existing call sites keep working.
 */

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d') as CanvasRenderingContext2D];
}

export interface TexOpts {
  srgb?: boolean;
  aniso?: number;
  repeat?: boolean;
}

export function toTexture(c: HTMLCanvasElement, o: TexOpts = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (o.srgb !== false) {
    t.encoding = THREE.sRGBEncoding;
  }
  t.anisotropy = o.aniso || 1;
  if (o.repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  return t;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------ */
/* Noise helpers                                                       */
/* ------------------------------------------------------------------ */

/** Seeded smooth value noise with optional wrap-around (for seamless tiles). Values in [0, 1]. */
export class Noise {
  private lat = new Float32Array(256 * 256);

  constructor(seed: number) {
    const r = rng(seed);
    for (let i = 0; i < this.lat.length; i++) {
      this.lat[i] = r();
    }
  }

  /** x, y in lattice units; px, py = wrap periods in lattice units (0 = no wrap). */
  at(x: number, y: number, px = 0, py = 0): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    let x0 = ix;
    let y0 = iy;
    let x1 = ix + 1;
    let y1 = iy + 1;
    if (px) {
      x0 = ((ix % px) + px) % px;
      x1 = (x0 + 1) % px;
    }
    if (py) {
      y0 = ((iy % py) + py) % py;
      y1 = (y0 + 1) % py;
    }
    const L = this.lat;
    const r0 = (y0 & 255) << 8;
    const r1 = (y1 & 255) << 8;
    const a = L[r0 | (x0 & 255)];
    const b = L[r0 | (x1 & 255)];
    const c = L[r1 | (x0 & 255)];
    const d = L[r1 | (x1 & 255)];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  fbm(x: number, y: number, oct: number, gain = 0.5, px = 0, py = 0): number {
    let amp = 1;
    let f = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += amp * this.at(x * f, y * f, px * f, py * f);
      norm += amp;
      amp *= gain;
      f *= 2;
    }
    return sum / norm;
  }
}

/** Piecewise-linear colour ramp baked into 256 RGB entries. Stops: [t, r, g, b]. */
export function makeLut(stops: Array<[number, number, number, number]>): Uint8Array {
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) {
      k++;
    }
    const a = stops[k];
    const b = stops[k + 1];
    const f = clamp01((t - a[0]) / Math.max(1e-6, b[0] - a[0]));
    lut[i * 3] = a[1] + (b[1] - a[1]) * f;
    lut[i * 3 + 1] = a[2] + (b[2] - a[2]) * f;
    lut[i * 3 + 2] = a[3] + (b[3] - a[3]) * f;
  }
  return lut;
}

/** Tangent-space (OpenGL, +Y up) normal map from a height field. */
export function normalFromHeight(
  h: Float32Array,
  w: number,
  hh: number,
  strength: number,
  wrap = true
): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(w, hh);
  const img = ctx.createImageData(w, hh);
  const d = img.data;
  for (let y = 0; y < hh; y++) {
    const ym = wrap ? (y - 1 + hh) % hh : Math.max(0, y - 1);
    const yp = wrap ? (y + 1) % hh : Math.min(hh - 1, y + 1);
    for (let x = 0; x < w; x++) {
      const xm = wrap ? (x - 1 + w) % w : Math.max(0, x - 1);
      const xp = wrap ? (x + 1) % w : Math.min(w - 1, x + 1);
      const dx = (h[y * w + xp] - h[y * w + xm]) * strength;
      const dy = (h[yp * w + x] - h[ym * w + x]) * strength;
      const l = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * w + x) * 4;
      d[i] = (-dx * l * 0.5 + 0.5) * 255;
      d[i + 1] = (dy * l * 0.5 + 0.5) * 255;
      d[i + 2] = (l * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Luminance (0..1) of a canvas, resampled to w x h. */
function lumField(src: HTMLCanvasElement, w: number, h: number): Float32Array {
  const [c, ctx] = makeCanvas(w, h);
  ctx.drawImage(src, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) {
    out[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
  }
  return out;
}

/** Tileable fbm drawn as a grey canvas (cells = lattice cells across the canvas). */
function tilingNoiseCanvas(n: Noise, size: number, cx: number, cy: number, oct: number, contrast = 1, gain = 0.5): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = clamp01((n.fbm((x / size) * cx, (y / size) * cy, oct, gain, cx, cy) - 0.5) * contrast + 0.5) * 255;
      const i = (y * size + x) * 4;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Random grey canvas of cx x cy cells stretched over the rectangle (anisotropic soft noise). */
function noiseRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rand: () => number,
  cx: number,
  cy: number,
  alpha: number,
  mode: string,
  contrast = 1
) {
  const cw = Math.max(2, Math.round(cx));
  const ch = Math.max(2, Math.round(cy));
  const [small, sctx] = makeCanvas(cw, ch);
  const img = sctx.createImageData(cw, ch);
  for (let i = 0; i < cw * ch; i++) {
    const v = Math.max(0, Math.min(255, 128 + (rand() - 0.5) * 255 * contrast));
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  sctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalCompositeOperation = mode as CanvasRenderingContext2D['globalCompositeOperation'];
  ctx.globalAlpha = alpha;
  ctx.drawImage(small, x, y, w, h);
  ctx.restore();
}

/** Soft blotchy noise: tiny random canvases upscaled with bilinear smoothing, stacked as octaves. */
function blotches(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rand: () => number,
  octaves: Array<[number, number]>,
  mode: string,
  contrast = 1
) {
  for (const [cells, alpha] of octaves) {
    noiseRect(ctx, 0, 0, w, h, rand, cells, (cells * h) / w, alpha, mode, contrast);
  }
}

/* ------------------------------------------------------------------ */
/* Floor: dark weathered planks                                        */
/* ------------------------------------------------------------------ */

export interface FloorTextures {
  map: THREE.CanvasTexture;
  /** Grayscale roughness (also usable as bump). Same object as `rough`. */
  detail: THREE.CanvasTexture;
  /** Tangent-space normal map (planks bevels, grain relief). */
  normal: THREE.CanvasTexture;
  /** Grayscale roughness map. */
  rough: THREE.CanvasTexture;
  /** World size covered by one texture tile (u, v), meters. */
  tile: [number, number];
}

export function makeFloorTextures(aniso: number): FloorTextures {
  const S = 2048;
  const TW = 2.4; // tile width (m), across the planks
  const TL = 3.6; // tile length (m), along the planks
  const pxX = S / TW;
  const pxY = S / TL;
  const [c, ctx] = makeCanvas(S, S);
  const rand = rng(1337);
  const noise = new Noise(4242);
  ctx.fillStyle = '#0c0b0a';
  ctx.fillRect(0, 0, S, S);

  /** One plank painted in local coordinates (deterministic per seed so wrap copies match). */
  const plank = (x: number, y: number, w: number, len: number, seed: number) => {
    const r = rng(seed);
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.rect(0, 0, w, len);
    ctx.clip();

    // base tone: mostly dark brown-grey, some pale weathered planks, some warm ones
    const kind = r();
    let hue = 20 + r() * 20;
    let sat = 4 + r() * 10;
    let light = 11 + r() * 11;
    if (kind > 0.82) {
      hue = 30 + r() * 15;
      sat = 3 + r() * 5;
      light = 22 + r() * 8; // weathered, pale
    } else if (kind < 0.12) {
      hue = 14 + r() * 10;
      sat = 12 + r() * 8;
      light = 11 + r() * 6; // warm dark
    }
    ctx.fillStyle = `hsl(${hue},${sat}%,${light}%)`;
    ctx.fillRect(0, 0, w, len);

    // grain: stacked stretched noises (fine -> coarse)
    noiseRect(ctx, 0, 0, w, len, r, w / 2.6, len / 60, 0.3, 'overlay', 0.65);
    noiseRect(ctx, 0, 0, w, len, r, w / 8, len / 170, 0.34, 'overlay', 0.8);
    noiseRect(ctx, 0, 0, w, len, r, 3, len / 380, 0.5, 'soft-light', 1.0);

    // cathedral / ring figure: wavy long lines
    const lines = 9 + Math.floor(r() * 9);
    for (let k = 0; k < lines; k++) {
      const x0 = r() * w;
      const amp = 2 + r() * 8;
      const fr = 0.004 + r() * 0.01;
      const ph = r() * 6.28;
      ctx.strokeStyle = r() < 0.6 ? 'rgba(0,0,0,0.10)' : 'rgba(200,190,175,0.05)';
      ctx.lineWidth = 0.6 + r() * 1.8;
      ctx.beginPath();
      for (let yy = 0; yy <= len; yy += 12) {
        const xx = x0 + Math.sin(yy * fr + ph) * amp;
        if (yy === 0) {
          ctx.moveTo(xx, yy);
        } else {
          ctx.lineTo(xx, yy);
        }
      }
      ctx.stroke();
    }

    // weathered / worn paint: long pale streaks and soft patches
    const wear = kind > 0.82 ? 1.6 : 1;
    for (let k = 0; k < 6 * wear; k++) {
      const bx = r() * w;
      const by = r() * len;
      const rx = 10 + r() * w * 0.5;
      const ry = 60 + r() * 320;
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, ry);
      const pale = r() < 0.7;
      g.addColorStop(0, pale ? `rgba(168,162,152,${0.06 + r() * 0.12})` : `rgba(6,5,4,${0.12 + r() * 0.2})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.translate(bx, by);
      ctx.scale(rx / ry, 1);
      ctx.translate(-bx, -by);
      ctx.fillStyle = g;
      ctx.fillRect(bx - ry, by - ry, ry * 2, ry * 2);
      ctx.restore();
    }
    for (let k = 0; k < 8 * wear; k++) {
      const sx = r() * w;
      const sy = r() * len;
      const sl = 80 + r() * 420;
      ctx.strokeStyle = r() < 0.75 ? `rgba(176,170,160,${0.03 + r() * 0.06})` : `rgba(4,3,3,${0.1 + r() * 0.15})`;
      ctx.lineWidth = 3 + r() * 16;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (r() - 0.5) * 10, sy + sl);
      ctx.stroke();
    }

    // fine grain hairlines
    const hair = Math.floor((w * len) / 2600);
    for (let k = 0; k < hair; k++) {
      const gx = r() * w;
      const gy = r() * len;
      const gl = 30 + r() * 240;
      ctx.strokeStyle = r() < 0.55 ? 'rgba(0,0,0,0.14)' : 'rgba(215,208,196,0.07)';
      ctx.lineWidth = 0.5 + r() * 1.6;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + (r() - 0.5) * 5, gy + gl);
      ctx.stroke();
    }

    // knots with rings
    if (r() < 0.32) {
      const kx = w * (0.2 + r() * 0.6);
      const ky = len * (0.15 + r() * 0.7);
      const kw = 5 + r() * 9;
      const kh = kw * (1.8 + r() * 1.2);
      for (let q = 4; q >= 1; q--) {
        ctx.fillStyle = `rgba(10,8,6,${0.14 + (4 - q) * 0.16})`;
        ctx.beginPath();
        ctx.ellipse(kx, ky, kw * (q / 4 + 0.2), kh * (q / 4 + 0.2), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
      for (let q = 1; q < 5; q++) {
        ctx.beginPath();
        ctx.ellipse(kx, ky, kw * (1 + q * 0.7), kh * (1 + q * 0.75), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // scratches
    for (let k = 0; k < 3; k++) {
      const sx = r() * w;
      const sy = r() * len;
      const a = Math.PI / 2 + (r() - 0.5) * 0.9;
      const sl = 20 + r() * 110;
      ctx.strokeStyle = r() < 0.7 ? 'rgba(206,200,190,0.16)' : 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 0.6 + r();
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(a) * sl, sy + Math.sin(a) * sl);
      ctx.stroke();
    }

    // ambient occlusion in the joints, micro-bevel gap + highlight
    const ao = ctx.createLinearGradient(0, 0, 0, 22);
    ao.addColorStop(0, 'rgba(0,0,0,0.38)');
    ao.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ao;
    ctx.fillRect(0, 0, w, 22);
    const aoL = ctx.createLinearGradient(0, 0, 14, 0);
    aoL.addColorStop(0, 'rgba(0,0,0,0.5)');
    aoL.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = aoL;
    ctx.fillRect(0, 0, 14, len);
    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    ctx.fillRect(0, 0, 4, len);
    ctx.fillRect(0, 0, w, 5);
    ctx.fillStyle = 'rgba(196,188,174,0.14)';
    ctx.fillRect(4, 5, 2, len);
    ctx.fillRect(4, 5, w, 2);
    ctx.restore();
  };

  // plank widths 0.15..0.23 m summing exactly to the tile width
  const widths: number[] = [];
  let sum = 0;
  while (sum < TW - 0.1) {
    const w = 0.15 + rand() * 0.08;
    widths.push(w);
    sum += w;
  }
  const wk = TW / sum;
  let cum = 0;
  let seed = 100;
  for (const wm of widths) {
    const x0 = Math.round(cum * pxX);
    cum += wm * wk;
    const x1 = Math.round(cum * pxX);
    // lengths 0.8..1.9 m, rescaled so the column tiles vertically
    const lens: number[] = [];
    let ls = 0;
    while (ls < TL - 0.4) {
      const l = 0.8 + rand() * 1.1;
      lens.push(l);
      ls += l;
    }
    const lk = TL / ls;
    let y = rand() * S;
    for (const lm of lens) {
      const lp = lm * lk * pxY;
      const yy = y % S;
      seed++;
      plank(x0, yy, x1 - x0, lp, seed);
      if (yy + lp > S) {
        plank(x0, yy - S, x1 - x0, lp, seed); // wrap copy keeps the tile seamless
      }
      y += lp;
    }
  }

  // large-scale tonal variation (seamless) so the tile does not read as a repeat
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.4;
  ctx.drawImage(tilingNoiseCanvas(noise, 256, 4, 6, 4, 1.7), 0, 0, S, S);
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.2;
  ctx.drawImage(tilingNoiseCanvas(noise, 256, 14, 20, 3, 1.6), 0, 0, S, S);
  ctx.restore();

  // dust + scuffs across planks
  for (let k = 0; k < 520; k++) {
    const sx = rand() * S;
    const sy = rand() * S;
    const a = (rand() - 0.5) * 0.7 + Math.PI / 2;
    const l = 14 + rand() * 90;
    ctx.strokeStyle = rand() < 0.7 ? 'rgba(210,205,196,0.09)' : 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 0.6 + rand() * 1.2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l);
    ctx.stroke();
  }

  // derived maps at 1024 px: roughness (dark = lacquered, pale worn = rough) + normal from luminance relief
  const D = 1024;
  const lum = lumField(c, D, D);
  const [rc, rctx] = makeCanvas(D, D);
  const rimg = rctx.createImageData(D, D);
  const height = new Float32Array(D * D);
  for (let i = 0; i < D * D; i++) {
    const l = lum[i];
    const rough = Math.max(0.5, Math.min(0.95, 0.46 + 1.1 * l));
    const v = rough * 255;
    rimg.data[i * 4] = v;
    rimg.data[i * 4 + 1] = v;
    rimg.data[i * 4 + 2] = v;
    rimg.data[i * 4 + 3] = 255;
    // grooves (very dark) are carved deep, grain relief is mild
    height[i] = l < 0.06 ? l * 0.2 : 0.012 + Math.min(0.5, l) * 0.9;
  }
  rctx.putImageData(rimg, 0, 0);

  const map = toTexture(c, { aniso, repeat: true });
  const rough = toTexture(rc, { aniso, repeat: true, srgb: false });
  const normal = toTexture(normalFromHeight(height, D, D, 1.3), { aniso, repeat: true, srgb: false });
  map.userData.normal = normal;
  map.userData.rough = rough;
  return { map, detail: rough, normal, rough, tile: [TW, TL] };
}

/* ------------------------------------------------------------------ */
/* Painted canvas backdrops                                            */
/* ------------------------------------------------------------------ */

export type BackdropKind = 'grey' | 'ochre' | 'light';

export interface BackdropOpts {
  width?: number;
  height?: number;
  seed?: number;
}

const GREY_LUT = makeLut([
  [0, 50, 53, 58],
  [0.3, 82, 86, 91],
  [0.6, 118, 122, 127],
  [0.82, 150, 153, 156],
  [1, 178, 180, 181],
]);
const LIGHT_LUT = makeLut([
  [0, 142, 146, 150],
  [0.45, 178, 181, 183],
  [0.8, 205, 207, 207],
  [1, 226, 227, 225],
]);
const CHARCOAL_LUT = makeLut([
  [0, 16, 15, 14],
  [0.45, 32, 30, 28],
  [0.78, 56, 52, 48],
  [1, 88, 82, 74],
]);
const GLOW_LUT = makeLut([
  [0, 44, 31, 20],
  [0.4, 92, 66, 36],
  [0.72, 140, 103, 58],
  [1, 192, 156, 100],
]);
const BAND_LUT = makeLut([
  [0, 30, 31, 34],
  [0.5, 62, 63, 66],
  [0.85, 98, 99, 101],
  [1, 128, 129, 130],
]);

/**
 * Hand-painted muslin backdrop: warped fbm clouds + vertical brush streaks + basket weave + vignette.
 * kind 'grey' = mid-grey mottled, 'ochre' = charcoal with warm glow and a grey side panel, 'light' = pale grey.
 */
export function makeBackdropTexture(kind: BackdropKind, aniso: number, opts: BackdropOpts = {}): THREE.CanvasTexture {
  const W = opts.width || 1024;
  const H = opts.height || 1536;
  const seedBase = opts.seed || (kind === 'grey' ? 77 : kind === 'ochre' ? 311 : 555);
  const rand = rng(seedBase);
  const n = new Noise(seedBase * 7 + 3);
  const [c, ctx] = makeCanvas(W, H);

  // low-res field (cheap), smoothly upscaled
  const fw = 384;
  const fh = 576;
  const [fc, fctx] = makeCanvas(fw, fh);
  const img = fctx.createImageData(fw, fh);
  const d = img.data;
  const ochre = kind === 'ochre';
  const band = 0.27;
  const cloudScale = ochre ? 1.15 : 1;
  for (let j = 0; j < fh; j++) {
    const v = j / fh;
    for (let i = 0; i < fw; i++) {
      const u = i / fw;
      const wx = n.fbm(u * 2.2 + 5.3, v * 3.3 + 1.7, 2) - 0.5;
      const wy = n.fbm(u * 2.2 + 9.1, v * 3.3 + 7.7, 2) - 0.5;
      const cloud = n.fbm((u * 5 + wx * 1.9) * cloudScale, (v * 6.5 + wy * 1.9) * cloudScale, 5, 0.52);
      const streak = n.fbm(u * 30 + wx * 3, v * 3.2 + wy * 1.2, 3, 0.55);
      const fine = n.at(u * 110, v * 165);
      let t = (cloud - 0.5) * 2.5 + 0.5 + (streak - 0.5) * 0.34 + (fine - 0.5) * 0.1;
      t = clamp01(t);
      let lut = kind === 'grey' ? GREY_LUT : LIGHT_LUT;
      let ti = Math.round(t * 255);
      if (ochre) {
        if (u < band) {
          lut = BAND_LUT;
          ti = Math.round(clamp01(t * 0.9 + (streak - 0.5) * 0.5) * 255);
        } else {
          const bu = (u - band) / (1 - band);
          const dx = (bu - 0.55) / 0.36;
          const dy = (v - 0.5) / 0.4;
          const g = clamp01(Math.exp(-(dx * dx + dy * dy)) * 1.35 + (cloud - 0.5) * 0.9);
          const gi = Math.round(g * 255);
          const k = (i + j * fw) * 4;
          const cr = CHARCOAL_LUT[ti * 3];
          const cg = CHARCOAL_LUT[ti * 3 + 1];
          const cb = CHARCOAL_LUT[ti * 3 + 2];
          const gr = GLOW_LUT[ti * 3];
          const gg = GLOW_LUT[ti * 3 + 1];
          const gb = GLOW_LUT[ti * 3 + 2];
          const m = g * g * (3 - 2 * g);
          void gi;
          d[k] = cr + (gr - cr) * m;
          d[k + 1] = cg + (gg - cg) * m;
          d[k + 2] = cb + (gb - cb) * m;
          d[k + 3] = 255;
          continue;
        }
      }
      const k = (i + j * fw) * 4;
      d[k] = lut[ti * 3];
      d[k + 1] = lut[ti * 3 + 1];
      d[k + 2] = lut[ti * 3 + 2];
      d[k + 3] = 255;
    }
  }
  fctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fc, 0, 0, W, H);

  // broad brush strokes (near vertical, slightly diagonal)
  ctx.lineCap = 'round';
  for (let k = 0; k < 90; k++) {
    const x = rand() * W;
    const y = rand() * H;
    const l = 160 + rand() * 520;
    const a = Math.PI / 2 + (rand() - 0.5) * 0.35;
    ctx.strokeStyle = rand() < 0.5 ? `rgba(255,255,255,${0.02 + rand() * 0.04})` : `rgba(0,0,0,${0.03 + rand() * 0.05})`;
    ctx.lineWidth = 14 + rand() * 60;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  // fine paint grain
  blotches(ctx, W, H, rand, [[200, 0.14], [420, 0.1]], 'overlay', 1);

  // basket weave of the canvas
  const [pc, pctx] = makeCanvas(4, 4);
  pctx.fillStyle = '#808080';
  pctx.fillRect(0, 0, 4, 4);
  pctx.fillStyle = '#b4b4b4';
  pctx.fillRect(0, 0, 2, 2);
  pctx.fillRect(2, 2, 2, 2);
  pctx.fillStyle = '#585858';
  pctx.fillRect(2, 0, 2, 2);
  pctx.fillRect(0, 2, 2, 2);
  const weave = ctx.createPattern(pc, 'repeat');
  if (weave) {
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = weave;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  if (ochre) {
    // stitched seam between the grey side panel and the dark body
    const sx = Math.round(W * band);
    ctx.fillStyle = 'rgba(214,214,208,0.55)';
    ctx.fillRect(sx - 1, 0, 3, H);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(sx + 2, 0, 5, H);
    ctx.strokeStyle = 'rgba(230,230,224,0.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([9, 6]);
    ctx.beginPath();
    ctx.moveTo(sx + 9, 0);
    ctx.lineTo(sx + 9, H);
    ctx.stroke();
    ctx.setLineDash([]);
    // white binding at the far left edge
    ctx.fillStyle = 'rgba(224,224,220,0.5)';
    ctx.fillRect(0, 0, 3, H);
  }

  // vignette: darker rod pocket / top, hem at the bottom, rolled edges
  const vg = ctx.createLinearGradient(0, 0, 0, H);
  vg.addColorStop(0, ochre ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.34)');
  vg.addColorStop(0.28, 'rgba(0,0,0,0)');
  vg.addColorStop(0.84, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  const hg = ctx.createLinearGradient(0, 0, W, 0);
  hg.addColorStop(0, 'rgba(0,0,0,0.3)');
  hg.addColorStop(0.05, 'rgba(0,0,0,0)');
  hg.addColorStop(0.95, 'rgba(0,0,0,0)');
  hg.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = ochre ? 'rgba(200,200,196,0.4)' : 'rgba(215,215,212,0.5)';
  ctx.fillRect(0, H - 6, W, 2);
  return toTexture(c, { aniso });
}

/* ------------------------------------------------------------------ */
/* Plaster, ceiling, accent wall                                       */
/* ------------------------------------------------------------------ */

/** Lime plaster: trowel marks + fine grain. Normal map on `userData.normal`. */
export function makePlasterTexture(aniso: number): THREE.CanvasTexture {
  const S = 1024;
  const [c, ctx] = makeCanvas(S, S);
  const rand = rng(9);
  const noise = new Noise(909);
  ctx.fillStyle = '#faf8f4';
  ctx.fillRect(0, 0, S, S);
  // seamless low-frequency tone clouds (warm / cool) + trowel sweeps
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.07;
  ctx.drawImage(tilingNoiseCanvas(noise, 256, 3, 3, 4, 1.6), 0, 0, S, S);
  ctx.globalAlpha = 0.045;
  ctx.drawImage(tilingNoiseCanvas(noise, 256, 9, 9, 3, 1.4), 0, 0, S, S);
  ctx.restore();
  for (let k = 0; k < 70; k++) {
    const x = rand() * S;
    const y = rand() * S;
    const l = 90 + rand() * 260;
    const a = (rand() - 0.5) * 1.6;
    ctx.strokeStyle = rand() < 0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(120,112,100,0.028)';
    ctx.lineWidth = 20 + rand() * 50;
    ctx.lineCap = 'round';
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        const sx = x + ox;
        const sy = y + oy;
        if (sx < -l - 80 || sx > S + l + 80 || sy < -l - 80 || sy > S + l + 80) {
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(sx + Math.cos(a) * l * 0.5, sy + Math.sin(a) * l * 0.5 + 12, sx + Math.cos(a) * l, sy + Math.sin(a) * l);
        ctx.stroke();
      }
    }
  }
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.18;
  ctx.drawImage(tilingNoiseCanvas(noise, 512, 150, 150, 2, 1.8, 0.6), 0, 0, S, S);
  ctx.restore();

  // height field for the normal map: fine grit + soft trowel undulation
  const H = 512;
  const h = new Float32Array(H * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < H; x++) {
      const u = x / H;
      const v = y / H;
      h[y * H + x] = noise.fbm(u * 6, v * 6, 3, 0.5, 6, 6) * 0.9 + noise.fbm(u * 96, v * 96, 3, 0.62, 96, 96) * 0.35;
    }
  }
  const map = toTexture(c, { aniso, repeat: true });
  map.userData.normal = toTexture(normalFromHeight(h, H, H, 5.5), { aniso, repeat: true, srgb: false });
  return map;
}

/** White painted ceiling boards (long soft seams along the slope) with a faint plaster grit normal. */
export function makeCeilingTexture(aniso: number): THREE.CanvasTexture {
  const S = 1024;
  const [c, ctx] = makeCanvas(S, S);
  const rand = rng(404);
  const noise = new Noise(77);
  ctx.fillStyle = '#f5f2ec';
  ctx.fillRect(0, 0, S, S);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.13;
  ctx.drawImage(tilingNoiseCanvas(noise, 256, 3, 3, 4, 1.7), 0, 0, S, S);
  ctx.restore();
  // tongue-and-groove style seams: 4 boards per tile, running along v
  const bw = S / 4;
  for (let i = 0; i < 4; i++) {
    const x = i * bw;
    ctx.fillStyle = 'rgba(70,62,52,0.22)';
    ctx.fillRect(x, 0, 2, S);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(x + 2, 0, 1.5, S);
    const g = ctx.createLinearGradient(x, 0, x + bw, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.035)');
    g.addColorStop(0.5, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.02)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, bw, S);
  }
  blotches(ctx, S, S, rand, [[180, 0.12]], 'overlay', 1);
  const map = toTexture(c, { aniso, repeat: true });
  const H = 256;
  const h = new Float32Array(H * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < H; x++) {
      const seam = Math.abs(((x / H) * 4) % 1);
      h[y * H + x] = noise.fbm((x / H) * 64, (y / H) * 64, 3, 0.6, 64, 64) * 0.5 + (seam < 0.02 ? -0.7 : 0);
    }
  }
  map.userData.normal = toTexture(normalFromHeight(h, H, H, 3.5), { aniso, repeat: true, srgb: false });
  return map;
}

/**
 * Dark grey painted accent wall (roller mottle) with the faint hexagon relief seen next to the strip softbox.
 * One non-repeating image covering `widthM` x `heightM` metres. Normal map on `userData.normal`.
 */
export function makeAccentWallTexture(aniso: number, widthM = 2.4, heightM = 2.7): THREE.CanvasTexture {
  const W = 1024;
  const H = Math.round((W * heightM) / widthM);
  const [c, ctx] = makeCanvas(W, H);
  const rand = rng(612);
  const noise = new Noise(2024);
  ctx.fillStyle = '#4c4f55';
  ctx.fillRect(0, 0, W, H);
  // roller mottle
  noiseRect(ctx, 0, 0, W, H, rand, 4, 5, 0.5, 'overlay', 1);
  noiseRect(ctx, 0, 0, W, H, rand, 12, 14, 0.35, 'overlay', 1);
  noiseRect(ctx, 0, 0, W, H, rand, 90, 100, 0.12, 'overlay', 1);
  // vertical roller bands
  for (let k = 0; k < 14; k++) {
    const x = rand() * W;
    ctx.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)';
    ctx.fillRect(x, 0, 30 + rand() * 60, H);
  }

  // hexagon relief (height canvas) masked to a soft region
  const HW = 512;
  const HH = Math.round((HW * heightM) / widthM);
  const [hc, hctx] = makeCanvas(HW, HH);
  hctx.fillStyle = '#000';
  hctx.fillRect(0, 0, HW, HH);
  const R = 22;
  const dx = Math.sqrt(3) * R;
  const dy = 1.5 * R;
  hctx.strokeStyle = '#fff';
  hctx.lineWidth = 3.2;
  hctx.shadowColor = '#fff';
  hctx.shadowBlur = 3;
  for (let row = -1; row * dy < HH + R; row++) {
    for (let col = -1; col * dx < HW + dx; col++) {
      const cx = col * dx + (row % 2 ? dx / 2 : 0);
      const cy = row * dy;
      hctx.beginPath();
      for (let q = 0; q < 6; q++) {
        const a = Math.PI / 6 + (q * Math.PI) / 3;
        const px = cx + Math.cos(a) * R * 0.92;
        const py = cy + Math.sin(a) * R * 0.92;
        if (q === 0) {
          hctx.moveTo(px, py);
        } else {
          hctx.lineTo(px, py);
        }
      }
      hctx.closePath();
      hctx.stroke();
    }
  }
  hctx.shadowBlur = 0;
  hctx.globalCompositeOperation = 'destination-in';
  const mask = hctx.createRadialGradient(HW * 0.5, HH * 0.52, 20, HW * 0.5, HH * 0.52, HH * 0.46);
  mask.addColorStop(0, 'rgba(255,255,255,1)');
  mask.addColorStop(0.55, 'rgba(255,255,255,0.7)');
  mask.addColorStop(1, 'rgba(255,255,255,0)');
  hctx.fillStyle = mask;
  hctx.fillRect(0, 0, HW, HH);
  hctx.globalCompositeOperation = 'source-over';
  // flatten onto black
  const [hc2, hctx2] = makeCanvas(HW, HH);
  hctx2.fillStyle = '#000';
  hctx2.fillRect(0, 0, HW, HH);
  hctx2.drawImage(hc, 0, 0);
  const hf = lumField(hc2, HW, HH);
  for (let i = 0; i < hf.length; i++) {
    hf[i] = hf[i] * 0.12 + noise.at((i % HW) / 3, Math.floor(i / HW) / 3) * 0.02;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.07;
  ctx.drawImage(hc2, 0, 0, W, H);
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.5;
  ctx.drawImage(
    (() => {
      // dark inner shadow offset of the ridges to give the cells some relief
      const [sc, sctx] = makeCanvas(HW, HH);
      sctx.fillStyle = '#fff';
      sctx.fillRect(0, 0, HW, HH);
      sctx.globalAlpha = 0.08;
      sctx.globalCompositeOperation = 'difference';
      sctx.drawImage(hc2, 2, 2);
      return sc;
    })(),
    0,
    0,
    W,
    H
  );
  ctx.restore();
  // top / bottom soft light falloff painted in
  const vg = ctx.createLinearGradient(0, 0, 0, H);
  vg.addColorStop(0, 'rgba(0,0,0,0.18)');
  vg.addColorStop(0.4, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  const map = toTexture(c, { aniso });
  map.userData.normal = toTexture(normalFromHeight(hf, HW, HH, 7, false), { aniso, srgb: false });
  return map;
}

/** White center fading to transparent (additive glows, dust sprites). */
export function makeGlowTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return toTexture(c, { srgb: false });
}

/** Opaque white -> black radial, meant for `alphaMap` (soft contact shadows). */
export function makeBlobTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.18, '#ececec');
  g.addColorStop(0.38, '#b0b0b0');
  g.addColorStop(0.58, '#5e5e5e');
  g.addColorStop(0.78, '#1c1c1c');
  g.addColorStop(1, '#000000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return toTexture(c, { srgb: false });
}

/** Vertical black->white ramp for `alphaMap` (wall/floor contact darkening strips). */
export function makeRampTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(4, 128);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#000000');
  g.addColorStop(0.3, '#0c0c0c');
  g.addColorStop(0.55, '#3e3e3e');
  g.addColorStop(0.8, '#9a9a9a');
  g.addColorStop(1, '#ffffff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  return toTexture(c, { srgb: false });
}

/**
 * Bright blurred garden seen through the windows: sky, bare tree, tall conifer, rounded hedges,
 * fence and gravel, mixed with a defocused copy for depth of field. Stretches fine on any window aspect.
 */
export function makeGardenTexture(aniso: number): THREE.CanvasTexture {
  const W = 1024;
  const H = 1024;
  const [c, ctx] = makeCanvas(W, H);
  const rand = rng(21);
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, '#8fbbe6');
  sky.addColorStop(0.55, '#cfe3f1');
  sky.addColorStop(1, '#f3f1df');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  // soft clouds
  noiseRect(ctx, 0, 0, W, H * 0.55, rand, 5, 3, 0.35, 'screen', 1.4);

  // far tree line (hazy)
  ctx.fillStyle = 'rgba(120,150,120,0.55)';
  for (let i = 0; i < 26; i++) {
    const x = rand() * W;
    const y = H * (0.42 + rand() * 0.06);
    ctx.beginPath();
    ctx.ellipse(x, y, 40 + rand() * 60, 26 + rand() * 40, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // bare tree: recursive branches
  const branch = (x: number, y: number, a: number, len: number, wd: number, depth: number) => {
    if (depth <= 0 || len < 6) {
      return;
    }
    const x2 = x + Math.cos(a) * len;
    const y2 = y + Math.sin(a) * len;
    ctx.strokeStyle = 'rgba(70,62,52,0.72)';
    ctx.lineWidth = wd;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    branch(x2, y2, a - 0.35 - rand() * 0.3, len * (0.72 + rand() * 0.08), wd * 0.68, depth - 1);
    branch(x2, y2, a + 0.3 + rand() * 0.3, len * (0.7 + rand() * 0.08), wd * 0.68, depth - 1);
    if (rand() < 0.5) {
      branch(x2, y2, a + (rand() - 0.5) * 0.3, len * 0.6, wd * 0.6, depth - 1);
    }
  };
  branch(W * 0.17, H * 0.72, -Math.PI / 2 - 0.05, 190, 11, 7);
  branch(W * 0.86, H * 0.7, -Math.PI / 2 + 0.1, 150, 8, 6);

  // tall dark conifer
  const cx = W * 0.58;
  const cg = ctx.createLinearGradient(cx - 90, 0, cx + 90, 0);
  cg.addColorStop(0, '#2c4a2a');
  cg.addColorStop(0.5, '#3d6234');
  cg.addColorStop(1, '#27422a');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.moveTo(cx, H * 0.18);
  ctx.bezierCurveTo(cx + 110, H * 0.36, cx + 120, H * 0.62, cx + 100, H * 0.82);
  ctx.lineTo(cx - 100, H * 0.82);
  ctx.bezierCurveTo(cx - 120, H * 0.62, cx - 110, H * 0.36, cx, H * 0.18);
  ctx.fill();

  // rounded hedges in two layers
  const hedge = (yBase: number, count: number, light: number, size: number) => {
    for (let i = 0; i < count; i++) {
      const x = (i + rand() * 0.6) * (W / count);
      const rx = size * (0.8 + rand() * 0.6);
      const ry = rx * (0.7 + rand() * 0.35);
      const y = yBase - ry * 0.5;
      const g = ctx.createRadialGradient(x - rx * 0.2, y - ry * 0.45, 4, x, y, rx);
      const hue = 98 + rand() * 24;
      g.addColorStop(0, `hsl(${hue},38%,${light + 16}%)`);
      g.addColorStop(0.6, `hsl(${hue},36%,${light}%)`);
      g.addColorStop(1, `hsl(${hue},32%,${light - 9}%)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  hedge(H * 0.68, 7, 26, 120);
  hedge(H * 0.8, 6, 33, 150);

  // fence: rails + pickets, then gravel / lawn
  ctx.fillStyle = 'rgba(88,92,96,0.8)';
  ctx.fillRect(0, H * 0.745, W, 5);
  ctx.fillRect(0, H * 0.82, W, 5);
  for (let x = 6; x < W; x += 34) {
    ctx.fillRect(x, H * 0.72, 4, H * 0.12);
  }
  const grass = ctx.createLinearGradient(0, H * 0.84, 0, H);
  grass.addColorStop(0, '#8a9a58');
  grass.addColorStop(0.5, '#a3ab74');
  grass.addColorStop(1, '#c9c4a2');
  ctx.fillStyle = grass;
  ctx.fillRect(0, H * 0.84, W, H * 0.16);
  noiseRect(ctx, 0, H * 0.84, W, H * 0.16, rand, 60, 6, 0.4, 'overlay', 1);

  // defocus: blend a heavily downscaled copy, then a bright haze
  const [bc, bctx] = makeCanvas(96, 96);
  bctx.imageSmoothingEnabled = true;
  bctx.drawImage(c, 0, 0, 96, 96);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = 0.5;
  ctx.drawImage(bc, 0, 0, W, H);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,248,0.16)';
  ctx.fillRect(0, 0, W, H);
  return toTexture(c, { aniso });
}

/** Bright blurred garden seen through the windows (kept for the existing call site). */
export function makeExteriorTexture(aniso: number): THREE.CanvasTexture {
  return makeGardenTexture(aniso);
}

/**
 * Wide, bright, defocused garden for the bay window (backdrop plane 10 m x 4.8 m: x in [-5, 5], y in [0, 4.8]).
 * Sky, hazy tree line, two leafy trees, clipped hedge with topiary balls, flower border and a striped lawn.
 */
export function makeGardenWideTexture(aniso: number): THREE.CanvasTexture {
  const W = 2048;
  const H = 1024;
  const [c, ctx] = makeCanvas(W, H);
  const rand = rng(77);
  const px = W / 10;
  const X = (m: number) => (m + 5) * px;
  const Y = (m: number) => H * (1 - m / 4.8);

  const sky = ctx.createLinearGradient(0, 0, 0, Y(1.5));
  sky.addColorStop(0, '#5e9ae0');
  sky.addColorStop(0.5, '#a9cfee');
  sky.addColorStop(1, '#f1f0dc');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  noiseRect(ctx, 0, 0, W, Y(2.2), rand, 9, 3, 0.45, 'screen', 1.5);

  // hazy far tree line
  ctx.fillStyle = 'rgba(128,160,132,0.5)';
  for (let i = 0; i < 40; i++) {
    ctx.beginPath();
    ctx.ellipse(rand() * W, Y(1.7 + rand() * 0.5), 50 + rand() * 90, 30 + rand() * 50, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // leafy trees: trunk + a cloud of overlapping green blobs
  const tree = (cx: number, base: number, r: number, hue: number) => {
    ctx.fillStyle = 'rgba(78,64,50,0.85)';
    ctx.fillRect(X(cx) - r * px * 0.07, Y(base + r * 1.4), r * px * 0.14, r * 1.4 * px);
    const n = 90;
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * r;
      const bx = X(cx + Math.cos(a) * d * 1.15);
      const by = Y(base + r * 2.1 + Math.sin(a) * d * 0.85);
      const br = (0.16 + rand() * 0.22) * r * px;
      const lift = 0.5 + 0.5 * Math.sin(a + 0.8);
      const g = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.35, 2, bx, by, br);
      g.addColorStop(0, `hsl(${hue + rand() * 16},42%,${44 + lift * 16}%)`);
      g.addColorStop(0.7, `hsl(${hue + rand() * 16},38%,${28 + lift * 12}%)`);
      g.addColorStop(1, `hsla(${hue},34%,22%,0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  tree(-3.5, 0.9, 1.05, 92);
  tree(1.9, 0.9, 1.2, 100);
  tree(4.4, 0.9, 0.9, 88);

  // clipped hedge band + two topiary balls
  const hedgeY = 0.95;
  const hg = ctx.createLinearGradient(0, Y(hedgeY + 0.95), 0, Y(hedgeY));
  hg.addColorStop(0, '#5a8a3a');
  hg.addColorStop(1, '#223d1f');
  ctx.fillStyle = hg;
  for (let i = 0; i < 26; i++) {
    const x = (i / 26) * W;
    ctx.beginPath();
    ctx.ellipse(x + 40, Y(hedgeY + 0.38), 70 + rand() * 30, 0.42 * px + rand() * 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(0, Y(hedgeY + 0.42), W, 0.42 * px);
  for (const bx of [-1.1, 3.0]) {
    const r = 0.62 * px;
    const g = ctx.createRadialGradient(X(bx) - r * 0.3, Y(1.9) - r * 0.35, 6, X(bx), Y(1.65), r);
    g.addColorStop(0, '#8dbb57');
    g.addColorStop(0.55, '#4b7a35');
    g.addColorStop(1, '#2a4724');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(X(bx), Y(1.55), r, 0, Math.PI * 2);
    ctx.fill();
  }

  // striped lawn with sunlit patches
  const lawnTop = Y(1.0);
  const grass = ctx.createLinearGradient(0, lawnTop, 0, H);
  grass.addColorStop(0, '#5f8a38');
  grass.addColorStop(1, '#93b25a');
  ctx.fillStyle = grass;
  ctx.fillRect(0, lawnTop, W, H - lawnTop);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, lawnTop, W, H - lawnTop);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,200,0.07)';
  for (let i = -6; i < 24; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 120, H);
    ctx.lineTo(i * 120 + 60, H);
    ctx.lineTo(i * 120 + 260, lawnTop);
    ctx.lineTo(i * 120 + 200, lawnTop);
    ctx.fill();
  }
  ctx.restore();
  noiseRect(ctx, 0, lawnTop, W, H - lawnTop, rand, 70, 8, 0.4, 'overlay', 1);

  // flower border
  for (let i = 0; i < 170; i++) {
    const hue = [338, 48, 12, 0, 285][Math.floor(rand() * 5)];
    ctx.fillStyle = `hsla(${hue},${hue === 0 ? 0 : 55}%,${hue === 0 ? 92 : 60}%,0.7)`;
    ctx.beginPath();
    ctx.arc(rand() * W, Y(0.66 + rand() * 0.3), 2 + rand() * 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // bokeh highlights in the foliage
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 46; i++) {
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 1);
    g.addColorStop(0, 'rgba(255,250,200,0.4)');
    g.addColorStop(1, 'rgba(255,250,200,0)');
    const r = 6 + rand() * 14;
    ctx.save();
    ctx.translate(rand() * W, Y(1.0 + rand() * 2.6));
    ctx.scale(r, r);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // defocus: blend a heavily downscaled copy, then a bright haze
  const [bc, bctx] = makeCanvas(160, 80);
  bctx.imageSmoothingEnabled = true;
  bctx.drawImage(c, 0, 0, 160, 80);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = 0.42;
  ctx.drawImage(bc, 0, 0, W, H);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,246,0.05)';
  ctx.fillRect(0, 0, W, H);
  return toTexture(c, { aniso });
}

/** Diagonal soft streaks of reflected light for the window glass (additive overlay, 4.3 : 1.5 aspect). */
export function makeGlassGlareTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 352;
  const [c, ctx] = makeCanvas(W, H);
  ctx.translate(W / 2, H / 2);
  ctx.rotate(0.62);
  const band = (x: number, half: number, a: number) => {
    const g = ctx.createLinearGradient(x - half, 0, x + half, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - half, -W, 2 * half, 2 * W);
  };
  band(-330, 70, 0.55);
  band(-230, 14, 0.4);
  band(40, 90, 0.4);
  band(150, 18, 0.45);
  band(380, 60, 0.5);
  const t = toTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Softbox diffuser face. */
export function makeDiffuserTexture(grid: boolean): THREE.CanvasTexture {
  const W = 128;
  const H = 384;
  const [c, ctx] = makeCanvas(W, H);
  const g = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, H * 0.62);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#d9dde3');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (grid) {
    ctx.strokeStyle = 'rgba(70,72,78,0.65)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= W; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }
  return toTexture(c);
}

/** Monitor / laptop screen showing a photo editor, warm and dark. */
export function makeScreenTexture(): THREE.CanvasTexture {
  const W = 320;
  const H = 200;
  const [c, ctx] = makeCanvas(W, H);
  ctx.fillStyle = '#15171b';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1f2228';
  ctx.fillRect(0, 0, W, 14);
  ctx.fillRect(0, 14, 44, H);
  ctx.fillRect(W - 62, 14, 62, H);
  const g = ctx.createRadialGradient(150, 100, 6, 150, 100, 90);
  g.addColorStop(0, '#d9a066');
  g.addColorStop(0.5, '#4a3322');
  g.addColorStop(1, '#0d0b0a');
  ctx.fillStyle = g;
  ctx.fillRect(52, 22, W - 122, H - 34);
  ctx.fillStyle = '#2b2f37';
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(W - 56, 24 + i * 20, 50, 10);
  }
  return toTexture(c);
}

export function makeClockTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = '#f4f0e6';
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 18, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 30px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const nums = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];
  nums.forEach((n, i) => {
    const a = (i / 12) * Math.PI * 2;
    ctx.fillText(n, S / 2 + Math.sin(a) * 86, S / 2 - Math.cos(a) * 86);
  });
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const r0 = i % 5 === 0 ? 104 : 110;
    ctx.lineWidth = i % 5 === 0 ? 3 : 1;
    ctx.beginPath();
    ctx.moveTo(S / 2 + Math.sin(a) * r0, S / 2 - Math.cos(a) * r0);
    ctx.lineTo(S / 2 + Math.sin(a) * 116, S / 2 - Math.cos(a) * 116);
    ctx.stroke();
  }
  return toTexture(c);
}

/** Tiny fabric weave used as bump on the sofa. */
export function makeFabricTexture(aniso: number): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 4) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(i, 0, 2, S);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, i, S, 2);
  }
  return toTexture(c, { aniso, repeat: true, srgb: false });
}
