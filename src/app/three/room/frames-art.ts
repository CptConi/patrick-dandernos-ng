import * as THREE from 'three';

/**
 * Procedural low-key portraits shown in the frames before the real photos arrive (or when the backend is down).
 * Dark, vignetted, rim-lit silhouettes with film grain - seeded so each frame looks different.
 */
export type ArtKind = 'bust' | 'figure' | 'still' | 'eye' | 'smoke' | 'graphic';

interface Palette {
  a: string;
  b: string;
  rim: [number, number, number];
}

const PALETTES: Palette[] = [
  { a: '#5a4130', b: '#0a0806', rim: [255, 205, 150] },
  { a: '#38454f', b: '#06080a', rim: [190, 215, 255] },
  { a: '#46413a', b: '#0a0a09', rim: [240, 230, 214] },
  { a: '#583020', b: '#0b0605', rim: [255, 154, 96] },
  { a: '#2e4443', b: '#060909', rim: [160, 226, 210] },
];

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

type Ctx = CanvasRenderingContext2D;

function bust(ctx: Ctx, w: number, h: number, r: () => number, pal: Palette, side: number) {
  const s = Math.min(w, h);
  const cx = w * (0.5 - 0.05 * side);
  const lean = (r() - 0.5) * 0.3;
  ctx.save();
  ctx.shadowColor = rgba(pal.rim, 0.9);
  ctx.shadowBlur = s * 0.05;
  ctx.shadowOffsetX = side * s * 0.02;
  ctx.fillStyle = '#0c0a09';
  ctx.beginPath();
  ctx.ellipse(cx, h * 1.03, w * 0.44, h * 0.28, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - w * 0.065, h * 0.55, w * 0.13, h * 0.2);
  // hair mass, sometimes long
  ctx.beginPath();
  ctx.ellipse(cx - side * w * 0.02, h * 0.37, w * 0.19, h * 0.24, lean, 0, Math.PI * 2);
  ctx.fill();
  if (r() < 0.6) {
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.18, h * 0.4);
    ctx.quadraticCurveTo(cx - w * 0.26, h * 0.7, cx - w * 0.2, h * 0.86);
    ctx.lineTo(cx + w * 0.2, h * 0.86);
    ctx.quadraticCurveTo(cx + w * 0.26, h * 0.7, cx + w * 0.18, h * 0.4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.43, w * 0.145, h * 0.185, lean, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // lit face
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.43, w * 0.145, h * 0.185, lean, 0, Math.PI * 2);
  ctx.clip();
  const g = ctx.createRadialGradient(cx + side * w * 0.07, h * 0.4, 0, cx + side * w * 0.05, h * 0.43, w * 0.17);
  g.addColorStop(0, rgba(pal.rim, 0.62));
  g.addColorStop(0.55, rgba(pal.rim, 0.18));
  g.addColorStop(1, rgba(pal.rim, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  // features
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.055, h * 0.42, w * 0.03, h * 0.012, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + w * 0.055, h * 0.42, w * 0.03, h * 0.012, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(110,40,34,0.5)';
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.52, w * 0.035, h * 0.009, 0, 0, Math.PI * 2);
  ctx.fill();
  // hair rim strokes
  ctx.strokeStyle = rgba(pal.rim, 0.28);
  ctx.lineWidth = Math.max(0.6, s * 0.004);
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI * (0.15 + r() * 0.7);
    const rr = 0.9 + r() * 0.25;
    ctx.beginPath();
    ctx.ellipse(cx - side * w * 0.02, h * 0.37, w * 0.19 * rr, h * 0.24 * rr, lean, a, a + 0.5 * (r() + 0.4));
    ctx.stroke();
  }
}

function figure(ctx: Ctx, w: number, h: number, r: () => number, pal: Palette, side: number) {
  const cx = w * (0.5 + (r() - 0.5) * 0.1);
  const s = Math.min(w, h);
  ctx.save();
  ctx.shadowColor = rgba(pal.rim, 0.55);
  ctx.shadowBlur = s * 0.06;
  const g = ctx.createLinearGradient(cx - side * w * 0.3, 0, cx + side * w * 0.3, 0);
  g.addColorStop(0, '#15130f');
  g.addColorStop(0.45, '#bdb3a2');
  g.addColorStop(1, '#4a443b');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.06, h * 0.3);
  ctx.quadraticCurveTo(cx - w * 0.1, h * 0.55, cx - w * 0.3, h * 0.94);
  ctx.lineTo(cx + w * 0.3, h * 0.94);
  ctx.quadraticCurveTo(cx + w * 0.1, h * 0.55, cx + w * 0.06, h * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#120f0d';
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.19, w * 0.06, h * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - w * 0.02, h * 0.24, w * 0.04, h * 0.08);
  ctx.restore();
  const l = ctx.createLinearGradient(0, h * 0.3, 0, h);
  l.addColorStop(0, 'rgba(0,0,0,0)');
  l.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = l;
  ctx.fillRect(0, h * 0.3, w, h * 0.7);
}

function still(ctx: Ctx, w: number, h: number, r: () => number, pal: Palette, side: number) {
  const s = Math.min(w, h);
  const cx = w * 0.5;
  const cy = h * 0.48;
  const R = s * 0.26;
  ctx.save();
  ctx.shadowColor = rgba(pal.rim, 0.5);
  ctx.shadowBlur = s * 0.05;
  const g = ctx.createRadialGradient(cx + side * R * 0.5, cy - R * 0.4, R * 0.1, cx, cy, R * 1.1);
  g.addColorStop(0, '#d8cdb6');
  g.addColorStop(0.55, '#6c6455');
  g.addColorStop(1, '#0e0c0a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - R * 0.55, cy + R * 0.6, R * 1.1, R * 0.7);
  ctx.restore();
  ctx.fillStyle = '#050404';
  ctx.beginPath();
  ctx.ellipse(cx - R * 0.38, cy - R * 0.05, R * 0.2, R * 0.24, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + R * 0.38, cy - R * 0.05, R * 0.2, R * 0.24, 0, 0, Math.PI * 2);
  ctx.moveTo(cx, cy + R * 0.12);
  ctx.lineTo(cx - R * 0.09, cy + R * 0.4);
  ctx.lineTo(cx + R * 0.09, cy + R * 0.4);
  ctx.fill();
}

function eye(ctx: Ctx, w: number, h: number, r: () => number, pal: Palette) {
  const s = Math.min(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const R = s * 0.34;
  const g = ctx.createRadialGradient(cx, cy, R * 0.25, cx, cy, R);
  g.addColorStop(0, rgba(pal.rim, 0.85));
  g.addColorStop(0.6, rgba(pal.rim, 0.4));
  g.addColorStop(1, 'rgba(8,6,5,1)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2;
    ctx.strokeStyle = r() < 0.5 ? 'rgba(0,0,0,0.35)' : rgba(pal.rim, 0.22);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * R * 0.38, cy + Math.sin(a) * R * 0.38);
    ctx.lineTo(cx + Math.cos(a) * R * (0.7 + r() * 0.28), cy + Math.sin(a) * R * (0.7 + r() * 0.28));
    ctx.stroke();
  }
  ctx.fillStyle = '#020202';
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(cx - R * 0.3, cy - R * 0.32, R * 0.12, R * 0.08, -0.5, 0, Math.PI * 2);
  ctx.fill();
  // lids
  ctx.fillStyle = '#050403';
  ctx.beginPath();
  ctx.ellipse(cx, cy - R * 1.12, R * 1.5, R * 0.62, 0, 0, Math.PI * 2);
  ctx.ellipse(cx, cy + R * 1.18, R * 1.5, R * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
}

function smoke(ctx: Ctx, w: number, h: number, r: () => number, pal: Palette) {
  const s = Math.min(w, h);
  const ph = r() * 6;
  for (let i = 0; i < 70; i++) {
    const t = i / 69;
    const x = w * (0.5 + Math.sin(t * 5 + ph) * 0.18 * (0.4 + t));
    const y = h * (0.95 - t * 0.9);
    const rad = s * (0.07 + r() * 0.1);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, rgba(pal.rim, 0.1 + r() * 0.08));
    g.addColorStop(1, rgba(pal.rim, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  ctx.fillStyle = '#080706';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.88, w * 0.3, h * 0.12, 0, Math.PI, Math.PI * 2);
  ctx.fill();
}

function graphic(ctx: Ctx, w: number, h: number, r: () => number, pal: Palette, side: number) {
  const s = Math.min(w, h);
  ctx.strokeStyle = rgba(pal.rim, 0.5);
  ctx.lineWidth = Math.max(1, s * 0.012);
  ctx.beginPath();
  ctx.arc(w * (0.5 + side * 0.12), h * 0.42, s * 0.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = Math.max(0.6, s * 0.005);
  for (let i = 0; i < 7; i++) {
    const x = w * (0.1 + r() * 0.8);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + w * 0.35 * side, h);
    ctx.stroke();
  }
  ctx.fillStyle = rgba(pal.rim, 0.65);
  ctx.fillRect(w * 0.12, h * 0.78, s * 0.1, s * 0.1);
  bust(ctx, w, h, r, pal, side);
}

function finish(ctx: Ctx, w: number, h: number, r: () => number) {
  const v = ctx.createRadialGradient(w / 2, h * 0.46, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.78);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.78)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 16;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/** Painted placeholder texture for a picture of the given w/h ratio. */
export function makeArtTexture(aspect: number, seed: number, kind: ArtKind, long = 224): THREE.CanvasTexture {
  const a = Math.max(0.2, Math.min(5, aspect || 1));
  const w = a >= 1 ? long : Math.max(32, Math.round(long * a));
  const h = a >= 1 ? Math.max(32, Math.round(long / a)) : long;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const r = rng(seed);
  const pal = PALETTES[Math.floor(r() * PALETTES.length)];
  const side = r() < 0.5 ? -1 : 1;
  const bg = ctx.createRadialGradient(w * (0.5 - 0.14 * side), h * 0.38, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.85);
  bg.addColorStop(0, pal.a);
  bg.addColorStop(1, pal.b);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  switch (kind) {
    case 'bust':
      bust(ctx, w, h, r, pal, side);
      break;
    case 'figure':
      figure(ctx, w, h, r, pal, side);
      break;
    case 'still':
      still(ctx, w, h, r, pal, side);
      break;
    case 'eye':
      eye(ctx, w, h, r, pal);
      break;
    case 'smoke':
      smoke(ctx, w, h, r, pal);
      break;
    default:
      graphic(ctx, w, h, r, pal, side);
  }
  finish(ctx, w, h, r);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}
