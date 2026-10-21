import * as THREE from 'three';
import { makeCanvas, rng, toTexture } from '../procedural-textures';
import { sstep, vnoise } from './garden-kit';

/** Canvas-painted layers of the garden: ground map (lawn, terrace, beds, path), sky, soft foliage and cloud cards. */

/** World rectangle covered by the ground mesh and its painted map (z runs away from the window). */
export const TERRAIN = { x0: -44, x1: 44, z0: -4.7, z1: -52 };
export const TERRACE = { x: 7, z: -7.45, y: 0.5 };
/** Width of the gravel path (core stroke, metres); its soft verge is a little wider. */
export const PATH_WIDTH = 2.1;

const gauss = (x: number) => Math.exp(-x * x);

/** Height of the ground: flat stone terrace, gently rising lawn, then layered hills. */
export function groundY(x: number, z: number): number {
  const d = Math.max(0, -z - 7.4);
  const ridge = (c: number, w: number, a: number) => a * gauss((d - c) / w) * (0.65 + 0.7 * vnoise(x * 0.07 + c, 4.2, 9));
  const lawn =
    0.44 +
    0.0011 * d * d +
    0.07 * Math.sin(x * 0.31 + z * 0.17) * Math.min(1, d / 6) +
    ridge(33, 5, 1.8) +
    ridge(40, 4, 3.4) +
    ridge(46, 4, 5.2);
  const t = (1 - sstep(7.0, 7.8, -z)) * (1 - sstep(TERRACE.x - 0.6, TERRACE.x + 0.4, Math.abs(x)));
  return lawn + (TERRACE.y - lawn) * t;
}

export interface GroundPlan {
  /** Contact shadows: x, z, rx, rz, alpha. */
  ao: Array<[number, number, number, number, number]>;
  beds: Array<{ x: number; z: number; rx: number; rz: number }>;
  /** Centre line of the gravel path (x, z), near to far. */
  path: Array<[number, number]>;
}

const FLOWERS = ['#f48fb1', '#ffd45c', '#b79bf0', '#ffffff', '#ff9a6b', '#f7c1d6'];

export function makeGroundTexture(W: number, H: number, plan: GroundPlan, aniso: number): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(W, H);
  const rand = rng(404);
  const { x0, x1, z0, z1 } = TERRAIN;
  const sx = W / (x1 - x0);
  const sz = H / (z0 - z1);
  // draw in world metres: canvas x = world x, canvas y = world z (running away from the viewer = up)
  ctx.setTransform(sx, 0, 0, -sz, -x0 * sx, z0 * sz);

  const soft = (x: number, z: number, r: number, rgb: string, a: number, ry = 1) => {
    ctx.save();
    ctx.translate(x, z);
    ctx.scale(1, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(0.55, `rgba(${rgb},${a * 0.55})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.restore();
  };

  // lawn base, fresher near and bluer / softer far away
  const base = ctx.createLinearGradient(0, -6, 0, z1);
  base.addColorStop(0, '#a9d062');
  base.addColorStop(0.35, '#9cc662');
  base.addColorStop(0.7, '#87b46a');
  base.addColorStop(1, '#79a572');
  ctx.fillStyle = base;
  ctx.fillRect(x0, z1, x1 - x0, z0 - z1);

  // large soft mottling; far hills get tree-line clumps and pale fields
  for (let i = 0; i < 520; i++) {
    const z = z0 - 3 - rand() * (z0 - z1 - 3);
    const far = Math.min(1, (-z - 7) / 40);
    const x = x0 + rand() * (x1 - x0);
    const r = 1.2 + rand() * (2.5 + far * 7);
    const dark = rand() < 0.55;
    soft(x, z, r, dark ? '92,150,70' : '196,214,110', 0.12 + 0.12 * rand(), 0.7);
  }
  for (let i = 0; i < 380; i++) {
    const z = -30 - rand() * (-z1 - 30);
    const x = x0 + rand() * (x1 - x0);
    const r = 1.5 + rand() * 4.5;
    soft(x, z, r, rand() < 0.7 ? '66,118,70' : '206,198,128', 0.3 + 0.2 * rand(), 0.55);
  }

  // mowing stripes receding along z
  for (let zb = -7.6; zb > -38; zb -= 0.8) {
    const a = 0.1 * (1 - sstep(8, 30, -zb - 7.6));
    for (let k = -18; k < 18; k += 2) {
      const g = ctx.createLinearGradient(k, 0, k + 1.2, 0);
      g.addColorStop(0, 'rgba(30,90,20,0)');
      g.addColorStop(0.2, `rgba(30,90,20,${a})`);
      g.addColorStop(0.8, `rgba(30,90,20,${a})`);
      g.addColorStop(1, 'rgba(30,90,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(k, zb - 0.82, 1.2, 0.84);
    }
  }

  // flower beds
  for (const b of plan.beds) {
    ctx.save();
    ctx.translate(b.x, b.z);
    ctx.scale(b.rx, b.rz);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(104,80,58,1)');
    g.addColorStop(0.78, 'rgba(112,88,64,1)');
    g.addColorStop(1, 'rgba(112,88,64,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
    for (let i = 0; i < 46; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * 0.9;
      soft(b.x + Math.cos(a) * d * b.rx, b.z + Math.sin(a) * d * b.rz, 0.16 + rand() * 0.2, '84,140,58', 0.7);
    }
    for (let i = 0; i < 110; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * 0.88;
      const col = FLOWERS[Math.floor(rand() * FLOWERS.length)];
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(b.x + Math.cos(a) * d * b.rx, b.z + Math.sin(a) * d * b.rz, 0.045 + rand() * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // gravel path
  const pts = plan.path;
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2;
      const mz = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, mz);
    }
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const strokes: Array<[number, string]> = [
    [PATH_WIDTH * 1.33, 'rgba(120,130,70,0.16)'],
    [PATH_WIDTH * 1.17, 'rgba(214,202,168,0.5)'],
    [PATH_WIDTH, 'rgba(228,218,186,0.95)'],
  ];
  for (const s of strokes) {
    trace();
    ctx.lineWidth = s[0];
    ctx.strokeStyle = s[1];
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(150,134,104,0.35)';
  for (let i = 0; i < 700; i++) {
    const t = rand() * (pts.length - 1.001);
    const k = Math.floor(t);
    const f = t - k;
    const px = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f + (rand() - 0.5) * PATH_WIDTH * 0.87;
    const pz = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f + (rand() - 0.5) * 0.9;
    ctx.fillRect(px, pz, 0.05, 0.04);
  }

  // stone terrace: grout colour, then individual slabs, a pale coping strip along the glass and a soft front edge
  const T = { x: TERRACE.x, z: TERRACE.z };
  ctx.save();
  ctx.beginPath();
  ctx.rect(-T.x, T.z, 2 * T.x, z0 - T.z);
  ctx.clip();
  ctx.fillStyle = '#b6a98f';
  ctx.fillRect(-T.x, T.z, 2 * T.x, z0 - T.z);
  let row = 0;
  for (let z = z0 - 0.4; z > T.z - 0.6; z -= 0.62, row++) {
    let x = -T.x - 0.2 - (row % 2) * 0.55 - rand() * 0.3;
    while (x < T.x) {
      const w = 0.9 + rand() * 0.7;
      const l = 74 + rand() * 7;
      ctx.fillStyle = `hsl(${36 + rand() * 6},${22 + rand() * 8}%,${l}%)`;
      ctx.fillRect(Math.max(-T.x, x + 0.025), z - 0.6, Math.min(T.x, x + w - 0.025) - Math.max(-T.x, x + 0.025), 0.58);
      x += w;
    }
  }
  ctx.fillStyle = '#eee7d6';
  ctx.fillRect(-T.x, z0 - 0.4, 2 * T.x, 0.4);
  ctx.restore();
  ctx.fillStyle = 'rgba(40,64,24,0.22)';
  ctx.fillRect(-T.x, T.z - 0.28, 2 * T.x, 0.28);
  ctx.fillStyle = '#9d9179';
  ctx.fillRect(-T.x, T.z - 0.02, 2 * T.x, 0.06);
  ctx.fillStyle = 'rgba(40,64,24,0.2)';
  ctx.fillRect(-T.x - 0.3, T.z, 0.3, z0 - T.z);
  ctx.fillRect(T.x, T.z, 0.3, z0 - T.z);

  // contact shadows (light comes from the upper left: they fall a little to the right / away)
  for (const a of plan.ao) {
    soft(a[0] + a[2] * 0.18, a[1] - a[3] * 0.14, Math.max(a[2], a[3]), '24,52,22', a[4], a[3] / Math.max(a[2], a[3]));
  }

  // defocus: blend a heavily downsampled copy (the garden is slightly out of focus)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const [bc, bctx] = makeCanvas(Math.max(8, W >> 3), Math.max(8, H >> 3));
  bctx.imageSmoothingEnabled = true;
  bctx.drawImage(c, 0, 0, bc.width, bc.height);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = 0.3;
  ctx.drawImage(bc, 0, 0, W, H);
  ctx.restore();

  const t = toTexture(c, { aniso });
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Vertical sky gradient for the dome (row 0 = zenith, last rows below the horizon). */
export function makeSkyTexture(thetaLen: number): THREE.CanvasTexture {
  const H = 256;
  const [c, ctx] = makeCanvas(4, H);
  const horizon = [226, 238, 243];
  const mid = [168, 205, 238];
  const top = [92, 152, 224];
  for (let r = 0; r < H; r++) {
    const theta = (r / (H - 1)) * thetaLen;
    const elev = 90 - (theta * 180) / Math.PI;
    const a = sstep(0, 13, elev);
    const b = sstep(10, 62, elev);
    const col = [0, 1, 2].map((i) => {
      const m = horizon[i] + (mid[i] - horizon[i]) * a;
      return Math.round(m + (top[i] - m) * b);
    });
    ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.fillRect(0, r, 4, 1);
  }
  const t = toTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Soft clusters of foliage (alpha card for the distant tree line), vertically shaded. */
export function makeFoliageCardTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128, 128);
  const rand = rng(31);
  for (let i = 0; i < 16; i++) {
    const x = 64 + (rand() - 0.5) * 78;
    const y = 66 + (rand() - 0.5) * 48 - Math.abs(x - 64) * 0.18;
    const r = 20 + rand() * 18;
    const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.3, 1, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.6, 'rgba(226,234,226,0.8)');
    g.addColorStop(1, 'rgba(200,212,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  ctx.globalCompositeOperation = 'source-atop';
  const sh = ctx.createLinearGradient(0, 20, 0, 118);
  sh.addColorStop(0, 'rgba(255,255,255,0)');
  sh.addColorStop(1, 'rgba(96,118,100,0.55)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, 128, 128);
  return toTexture(c, { aniso: 1 });
}

/** Flat-bottomed cumulus puff with a bluish underside. */
export function makeCloudTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 128);
  const rand = rng(8);
  for (let i = 0; i < 22; i++) {
    const t = rand();
    const x = 36 + t * 184;
    const hump = Math.sin(t * Math.PI);
    const r = 16 + hump * 26 * (0.6 + 0.6 * rand());
    const y = 92 - r * 0.62 - hump * 8 * rand();
    const g = ctx.createRadialGradient(x, y - r * 0.25, 1, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.65)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  ctx.globalCompositeOperation = 'source-atop';
  const sh = ctx.createLinearGradient(0, 40, 0, 96);
  sh.addColorStop(0, 'rgba(255,255,255,0)');
  sh.addColorStop(1, 'rgba(150,176,208,0.5)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, 256, 128);
  return toTexture(c, { aniso: 1 });
}
