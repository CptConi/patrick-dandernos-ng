import * as THREE from 'three';
import { rng } from '../procedural-textures';

/** Procedural canvas textures for the lighting set and the mannequin (<= 1024 px). */

function cv(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d') as CanvasRenderingContext2D];
}

function toTex(c: HTMLCanvasElement, o: { srgb?: boolean; repeat?: boolean; aniso?: number } = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (o.srgb !== false) {
    t.encoding = THREE.sRGBEncoding;
  }
  if (o.repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = o.aniso || 4;
  return t;
}

/** Copper-red bob wig: vertical strands, a soft highlight ring, darker ends. u wraps around the head. */
export function makeHairMap(): THREE.CanvasTexture {
  const W = 512;
  const H = 512;
  const [c, ctx] = cv(W, H);
  const r = rng(404);
  ctx.fillStyle = '#8e1f0c';
  ctx.fillRect(0, 0, W, H);
  const palette = ['#5c1007', '#751709', '#8c1d0c', '#a8240e', '#c0331a', '#d6491c', '#ea6a2c'];
  for (let i = 0; i < 1500; i++) {
    const x = r() * W;
    const w = 0.7 + r() * 2.2;
    const y0 = r() * H * 0.25;
    ctx.strokeStyle = palette[Math.floor(r() * palette.length)];
    ctx.globalAlpha = 0.25 + r() * 0.5;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.bezierCurveTo(x + (r() - 0.5) * 10, H * 0.35, x + (r() - 0.5) * 14, H * 0.7, x + (r() - 0.5) * 8, H);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // glossy highlight ring (the "halo" of a bob wig) and dark roots / ends
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(60,8,2,0.55)');
  g.addColorStop(0.16, 'rgba(255,170,90,0.0)');
  g.addColorStop(0.3, 'rgba(255,150,90,0.26)');
  g.addColorStop(0.46, 'rgba(255,140,70,0.0)');
  g.addColorStop(0.85, 'rgba(70,10,4,0.18)');
  g.addColorStop(1, 'rgba(40,6,2,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  return toTex(c, { repeat: true });
}

/** Knit sweater. With `motifs`, small black embroidered butterflies sit around the middle (front of a lathe torso). */
export function makeKnitMap(motifs: boolean): THREE.CanvasTexture {
  const W = motifs ? 1008 : 480;
  const H = 512;
  const [c, ctx] = cv(W, H);
  const r = rng(motifs ? 909 : 910);
  ctx.fillStyle = '#e6dfd0';
  ctx.fillRect(0, 0, W, H);
  const sw = motifs ? 18 : 16;
  const sh = 22;
  for (let row = 0; row * sh < H + sh; row++) {
    for (let col = 0; col * sw < W + sw; col++) {
      const x = col * sw + (row % 2) * 0;
      const y = row * sh;
      const v = (r() - 0.5) * 14;
      ctx.lineCap = 'round';
      ctx.lineWidth = 3.6;
      ctx.strokeStyle = `rgb(${214 + v},${206 + v},${190 + v})`;
      ctx.beginPath();
      ctx.moveTo(x + 1, y + 1);
      ctx.lineTo(x + sw / 2, y + sh - 2);
      ctx.moveTo(x + sw - 1, y + 1);
      ctx.lineTo(x + sw / 2, y + sh - 2);
      ctx.stroke();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = `rgba(255,252,243,0.7)`;
      ctx.beginPath();
      ctx.moveTo(x + 2.4, y + 1);
      ctx.lineTo(x + sw / 2 + 0.6, y + sh - 3);
      ctx.moveTo(x + sw - 2.4, y + 1);
      ctx.lineTo(x + sw / 2 - 0.6, y + sh - 3);
      ctx.stroke();
    }
  }
  // fuzz
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = `rgba(255,255,250,${0.05 + r() * 0.12})`;
    ctx.fillRect(r() * W, r() * H, 1 + r() * 2, 1);
  }
  if (motifs) {
    const butterfly = (x: number, y: number, s: number, rot: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(s, s);
      ctx.fillStyle = '#17161a';
      ctx.strokeStyle = '#17161a';
      ctx.lineWidth = 1.4;
      for (const m of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(m * 9, -5, 9, 6.5, m * -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(m * 7, 6, 6, 4.5, m * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(m * 1, -9);
        ctx.quadraticCurveTo(m * 7, -20, m * 11, -22);
        ctx.stroke();
      }
      ctx.fillRect(-1.4, -9, 2.8, 20);
      // stitched highlights
      ctx.strokeStyle = 'rgba(230,226,215,0.5)';
      ctx.lineWidth = 0.9;
      for (const m of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(m * 5, -6);
        ctx.lineTo(m * 14, -8);
        ctx.moveTo(m * 5, 5);
        ctx.lineTo(m * 10, 8);
        ctx.stroke();
      }
      ctx.restore();
    };
    // front of the torso is at u = 0.5 (texture offset applied by the material)
    const cx = W * 0.5;
    butterfly(cx - 70, 215, 1.25, -0.5);
    butterfly(cx + 40, 150, 1.0, 0.45);
    butterfly(cx - 10, 310, 0.8, 0.1);
    butterfly(cx + 95, 290, 0.9, 0.9);
    butterfly(cx - 135, 120, 0.85, -0.9);
    butterfly(cx + 170, 205, 0.75, 0.2);
    // tiny stars
    ctx.fillStyle = '#17161a';
    for (let i = 0; i < 9; i++) {
      const sx = cx + (r() - 0.5) * 360;
      const sy = 90 + r() * 330;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.6 + r() * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return toTex(c, { repeat: true });
}

/**
 * Painted mannequin face for a SphereGeometry head (u = 0.25 is the front).
 * Feature positions are given as horizontal angle `d` and head height `y` (head centre 1.465, vertical radius 0.11).
 */
export const HEAD_YC = 1.44;
export const HEAD_RY = 0.11;
export function makeFaceMap(): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  const [c, ctx] = cv(W, H);
  const P = (d: number, y: number): [number, number] => {
    // features are authored for a head centred at 1.465 m
    const th = Math.acos(Math.max(-1, Math.min(1, (y - 1.465) / HEAD_RY)));
    return [(0.25 + d / (Math.PI * 2)) * W, (th / Math.PI) * H];
  };
  ctx.fillStyle = '#e8cfba';
  ctx.fillRect(0, 0, W, H);
  // subtle sculpt shading + blush
  const blob = (d: number, y: number, rx: number, ry: number, col: string) => {
    const [x, yy] = P(d, y);
    const g = ctx.createRadialGradient(x, yy, 1, x, yy, rx);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(x, yy);
    ctx.scale(1, ry / rx);
    ctx.translate(-x, -yy);
    ctx.fillStyle = g;
    ctx.fillRect(x - rx, yy - rx, rx * 2, rx * 2);
    ctx.restore();
  };
  blob(-0.55, 1.42, 38, 30, 'rgba(226,150,140,0.28)');
  blob(0.55, 1.42, 38, 30, 'rgba(226,150,140,0.28)');
  blob(0, 1.5, 55, 25, 'rgba(255,255,255,0.18)');
  blob(0, 1.43, 14, 22, 'rgba(120,80,70,0.1)');
  for (const m of [-1, 1]) {
    // eye socket shadow
    blob(m * 0.42, 1.485, 34, 16, 'rgba(150,110,100,0.32)');
    // eye
    const [ex, ey] = P(m * 0.42, 1.478);
    ctx.fillStyle = '#f4efe9';
    ctx.beginPath();
    ctx.ellipse(ex, ey, 25, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5e4a3a';
    ctx.beginPath();
    ctx.arc(ex, ey, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#17110f';
    ctx.beginPath();
    ctx.arc(ex, ey, 4.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(ex - 4, ey - 4.5, 2.4, 2.4);
    // lash line
    ctx.strokeStyle = '#1d1514';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.ellipse(ex, ey + 1, 26, 12, 0, Math.PI * 1.04, Math.PI * 1.96);
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(ex + m * 20, ey - 2);
    ctx.lineTo(ex + m * 28, ey - 8);
    ctx.stroke();
    // brow
    const [bx, by] = P(m * 0.42, 1.52);
    ctx.strokeStyle = 'rgba(120,36,16,0.9)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx - 24, by + 5);
    ctx.quadraticCurveTo(bx, by - 8, bx + 26, by + 3);
    ctx.stroke();
    // nostril
    const [nx, ny] = P(m * 0.085, 1.427);
    ctx.fillStyle = 'rgba(110,70,60,0.5)';
    ctx.beginPath();
    ctx.ellipse(nx, ny, 3.2, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // lips
  const [lx, ly] = P(0, 1.4);
  ctx.fillStyle = '#b03a38';
  ctx.beginPath();
  ctx.moveTo(lx - 24, ly);
  ctx.quadraticCurveTo(lx - 10, ly - 12, lx, ly - 7);
  ctx.quadraticCurveTo(lx + 10, ly - 12, lx + 24, ly);
  ctx.quadraticCurveTo(lx, ly + 15, lx - 24, ly);
  ctx.fill();
  ctx.strokeStyle = '#6e2a26';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(lx - 24, ly);
  ctx.quadraticCurveTo(lx, ly + 3, lx + 24, ly);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(lx - 7, ly + 3, 14, 2.5);
  return toTex(c, { repeat: true });
}

/** Black ripstop / nylon softbox fabric (tileable). */
export function makeFabricWeave(): THREE.CanvasTexture {
  const [c, ctx] = cv(128, 128);
  ctx.fillStyle = '#1b1c1f';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 2) {
    ctx.fillStyle = i % 4 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(i, 0, 1, 128);
    ctx.fillStyle = i % 4 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.1)';
    ctx.fillRect(0, i, 128, 1);
  }
  // ripstop square grid
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 128; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i + 0.5, 0);
    ctx.lineTo(i + 0.5, 128);
    ctx.moveTo(0, i + 0.5);
    ctx.lineTo(128, i + 0.5);
    ctx.stroke();
  }
  return toTex(c, { repeat: true });
}

/** Transparent honeycomb grid (dark cell walls, see-through cells). */
export function makeHoneycomb(w: number, h: number, cell: number): THREE.CanvasTexture {
  const W = Math.round(w * 800);
  const H = Math.round(h * 800);
  const [c, ctx] = cv(W, H);
  ctx.clearRect(0, 0, W, H);
  const s = (cell * 800) / Math.sqrt(3);
  const dx = Math.sqrt(3) * s;
  const dy = 1.5 * s;
  ctx.strokeStyle = '#0d0e10';
  ctx.lineWidth = 2.4;
  for (let row = -1; row * dy < H + dy; row++) {
    for (let col = -1; col * dx < W + dx; col++) {
      const cx = col * dx + (row % 2 ? dx / 2 : 0);
      const cy = row * dy;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        const px = cx + Math.cos(a) * s;
        const py = cy + Math.sin(a) * s;
        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  return toTex(c, { srgb: false });
}

/** White vertical "Godox" wordmark on transparent. */
export function makeLogoDecal(): THREE.CanvasTexture {
  const [c, ctx] = cv(256, 64);
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = '#f2f2f2';
  ctx.font = '700 34px "Helvetica Neue", Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('Godox', 8, 26);
  ctx.font = '500 9px Arial, sans-serif';
  ctx.fillStyle = 'rgba(240,240,240,0.8)';
  ctx.fillText('P R O F E S S I O N A L   L I G H T I N G', 9, 52);
  return toTex(c, { srgb: true });
}

/** Strobe control panel LCD with glowing digits. */
export function makeLcd(): THREE.CanvasTexture {
  const [c, ctx] = cv(128, 64);
  ctx.fillStyle = '#06161c';
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = '#7fe7ff';
  ctx.font = '700 34px "Courier New", monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText('1/4', 8, 28);
  ctx.font = '700 14px "Courier New", monospace';
  ctx.fillText('M', 92, 14);
  ctx.fillText('5600K', 70, 48);
  ctx.fillRect(8, 52, 40, 3);
  ctx.fillStyle = 'rgba(127,231,255,0.18)';
  ctx.fillRect(0, 0, 128, 64);
  return toTex(c);
}

/** Dark stained wood (stool). Tileable stripes along v. */
export function makeDarkWood(): THREE.CanvasTexture {
  const [c, ctx] = cv(256, 256);
  const r = rng(61);
  ctx.fillStyle = '#4a3324';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const x = r() * 256;
    ctx.strokeStyle = `rgba(${r() > 0.5 ? '20,12,7' : '110,78,50'},${0.1 + r() * 0.22})`;
    ctx.lineWidth = 0.6 + r() * 2.4;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + (r() - 0.5) * 18, 80, x + (r() - 0.5) * 18, 170, x + (r() - 0.5) * 8, 256);
    ctx.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const kx = r() * 256;
    const ky = r() * 256;
    const g = ctx.createRadialGradient(kx, ky, 1, kx, ky, 14);
    g.addColorStop(0, 'rgba(20,10,5,0.6)');
    g.addColorStop(1, 'rgba(20,10,5,0)');
    ctx.fillStyle = g;
    ctx.fillRect(kx - 14, ky - 14, 28, 28);
  }
  return toTex(c, { repeat: true });
}

/** Fine twill for the black trousers (used as colour map only). */
export function makeTwill(): THREE.CanvasTexture {
  const [c, ctx] = cv(128, 128);
  ctx.fillStyle = '#1b1c20';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = -128; i < 256; i += 3) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 128, 128);
    ctx.stroke();
  }
  return toTex(c, { repeat: true });
}
