import * as THREE from 'three';
import { BODY_A, BODY_BF, BODY_BK, BODY_CZ } from './mannequin-body';
import { ArmPose, LegPose, armPath } from './mannequin-pose';
import { gauss, lerp, prof, sstep, surface, tube, V3 } from './mannequin-surf';

/** Oversized cream knit sweater (torso, sleeves, rolled bands) and slim black trousers. Real fold geometry. */

/* ---------- sweater torso ---------- */

const SW_A = prof([[0.6, 0.17], [0.7, 0.176], [0.78, 0.176], [0.84, 0.163], [0.9, 0.143], [0.97, 0.139], [1.05, 0.146], [1.13, 0.152], [1.19, 0.158], [1.222, 0.163], [1.24, 0.158], [1.256, 0.14], [1.27, 0.114], [1.285, 0.09], [1.3, 0.074], [1.32, 0.064]]);
const SW_BF = prof([[0.6, 0.125], [0.7, 0.128], [0.78, 0.126], [0.84, 0.116], [0.9, 0.104], [0.98, 0.103], [1.06, 0.111], [1.13, 0.123], [1.19, 0.105], [1.23, 0.082], [1.255, 0.066], [1.28, 0.058], [1.32, 0.055]]);
const SW_BK = prof([[0.6, 0.125], [0.7, 0.132], [0.78, 0.126], [0.84, 0.108], [0.9, 0.094], [0.98, 0.09], [1.06, 0.092], [1.13, 0.092], [1.19, 0.09], [1.23, 0.082], [1.255, 0.07], [1.28, 0.062], [1.32, 0.058]]);
const SW_CZ = prof([[0.6, -0.045], [0.7, -0.04], [0.8, -0.026], [0.9, -0.014], [0.98, -0.014], [1.08, -0.03], [1.18, -0.046], [1.26, -0.036], [1.32, -0.03]]);

const RIM = prof([[0, 1.236], [0.5, 1.241], [1.0, 1.256], [1.4, 1.268], [1.57, 1.272], [2.0, 1.278], [2.6, 1.293], [3.1416, 1.3]]);

/** Hem and neckline height around the torso; phi = 0 at the front, + toward her left (+X). */
const hemY = (phi: number) => {
  const a = Math.abs(phi);
  return 0.78 - 0.04 * sstep(0.3, 1.6, a) - 0.045 * sstep(1.6, 3.14, a) + 0.004 * Math.sin(phi * 7 + 0.6);
};
const rimY = (phi: number) => RIM(Math.abs(phi)) - 0.026 * sstep(0.3, 1.3, phi) * (1 - sstep(1.9, 2.8, phi));

function drape(phi: number, y: number, x: number): number {
  const low = sstep(1.08, 0.8, y);
  const mid = gauss(y, 0.98, 0.11);
  const f =
    0.55 * Math.sin(5 * phi + 2.2 * y + 1.3) +
    0.4 * Math.sin(8 * phi - 4.5 * y + 0.7) +
    0.3 * Math.sin(12 * phi + 3.0 * y + 2.2) +
    0.22 * Math.sin(3 * phi - 1.0 * y + 0.4);
  const env = 0.5 + 0.5 * Math.sin(phi * 2.0 + 0.4 + y * 2.0) ** 2;
  const amp = 0.016 + 0.05 * low + 0.012 * mid;
  const front = Math.exp(-((phi / 1.25) ** 2));
  // seated: compression wrinkles over the belly
  const belly = 0.03 * gauss(y, 0.89, 0.05) * Math.sin((y - 0.86) * Math.PI * 2 / 0.05 + Math.sin(phi * 4) * 0.8) * front;
  // tension folds pulled by the slipped shoulder, running down across the chest
  const d = (x - 0.12) * 0.734 - (y - 1.21) * 0.678;
  const pull = 0.04 * (Math.exp(-((d / 0.014) ** 2)) - 0.55 * Math.exp(-(((d - 0.034) / 0.02) ** 2)) - 0.55 * Math.exp(-(((d + 0.034) / 0.02) ** 2))) * sstep(0.93, 1.05, y) * (1 - sstep(1.19, 1.23, y)) * front;
  const lap = 0.03 * Math.exp(-((phi / 0.7) ** 2)) * sstep(0.88, 0.78, y);
  return 1 + amp * f * env + belly + pull + lap;
}

function torsoPoint(u: number, v: number, out: THREE.Vector3): void {
  const phi = (u - 0.5) * Math.PI * 2;
  const hem = hemY(phi);
  const rim = rimY(phi);
  const y = hem + (rim - hem) * v;
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const n = 2.3;
  const cx = Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
  const sx = Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
  const f = drape(phi, y, SW_A(y) * sx);
  // blousy above the rib hem
  const blouse = 1 + 0.07 * sstep(hem + 0.075, hem + 0.02, y);
  const a = SW_A(y) * blouse * f;
  const b = (c >= 0 ? SW_BF(y) : SW_BK(y)) * blouse * f;
  let z = SW_CZ(y) + b * cx;
  if (c > 0) {
    z += 0.016 * Math.exp(-(((Math.abs(a * sx) - 0.056) / 0.044) ** 2) - ((y - 1.12) / 0.05) ** 2) * sstep(0.1, 0.5, c);
  }
  out.set(a * sx, y, z);
}

export interface TorsoParts {
  torso: THREE.BufferGeometry;
  decal: THREE.BufferGeometry;
  hem: THREE.Vector3[];
  rim: THREE.Vector3[];
}

export function sweaterTorso(hi: boolean): TorsoParts {
  const nu = hi ? 96 : 48;
  const nv = hi ? 48 : 24;
  const torso = surface(nu, nv, torsoPoint, {
    uv: (u, v, p) => [u * 6, p.y / 0.17],
  });
  // embroidery decal: same surface, motif UVs, only the quads of the front half
  const decal = torso.clone();
  const uv = decal.attributes.uv as THREE.BufferAttribute;
  const cols = nu + 1;
  for (let i = 0; i <= nv; i++) {
    for (let j = 0; j <= nu; j++) {
      uv.setXY(i * cols + j, j / nu, i / nv);
    }
  }
  const src = (decal.index as THREE.BufferAttribute).array;
  const keep: number[] = [];
  for (let q = 0; q < src.length; q += 3) {
    const col = (src[q] % cols) / nu;
    if (col > 0.18 && col < 0.82) {
      keep.push(src[q], src[q + 1], src[q + 2]);
    }
  }
  decal.setIndex(keep);
  const loop = (v: number, n: number) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      pts.push(new THREE.Vector3());
      torsoPoint(i / n, v, pts[i]);
    }
    return pts;
  };
  return { torso, decal, hem: loop(0, 96), rim: loop(1, 96) };
}

/* ---------- bands (rolled rib edges) ---------- */

/** Closed rounded rib band along a loop of points. */
export function bandGeo(pts: THREE.Vector3[], r: number, repeat: number, inward = 0, flat = 1): THREE.BufferGeometry {
  const n = pts.length;
  const c = new THREE.Vector3();
  pts.forEach((p) => c.add(p));
  c.multiplyScalar(1 / n);
  const frames: Array<{ p: THREE.Vector3; u: THREE.Vector3; w: THREE.Vector3 }> = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const T = pts[(i + 1) % n].clone().sub(pts[(i - 1 + n) % n]).normalize();
    const rad = p.clone().sub(c);
    rad.addScaledVector(T, -rad.dot(T)).normalize();
    const w = new THREE.Vector3().crossVectors(T, rad).normalize();
    frames.push({ p: p.clone().addScaledVector(rad, -inward), u: rad, w });
  }
  return surface(
    10,
    n,
    (u, v, out) => {
      const f = frames[Math.round(v * n) % n];
      const th = u * Math.PI * 2;
      out.copy(f.p).addScaledVector(f.u, Math.cos(th) * r).addScaledVector(f.w, Math.sin(th) * r * 0.9 * flat);
    },
    { uv: (u, v) => [v * repeat, u], closedV: true }
  );
}

export function cuffLoop(center: THREE.Vector3, axis: THREE.Vector3, r: number, n = 40): THREE.Vector3[] {
  const a = axis.clone().normalize();
  const ref = Math.abs(a.y) < 0.9 ? V3(0, 1, 0) : V3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(a, ref).normalize();
  const w = new THREE.Vector3().crossVectors(a, u).normalize();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    pts.push(center.clone().addScaledVector(u, Math.cos(th) * r).addScaledVector(w, Math.sin(th) * r));
  }
  return pts;
}

/* ---------- sleeves ---------- */

export interface SleeveParts {
  geo: THREE.BufferGeometry;
  cuff: THREE.Vector3[];
}

export function sleeveGeo(arm: ArmPose, hi: boolean): SleeveParts {
  const { E, W } = arm;
  const dirF = W.clone().sub(E).normalize();
  const Wc = W.clone().addScaledVector(dirF, -0.04);
  const path = armPath(arm);
  const a = prof([[0, 0.046], [0.1, 0.05], [0.2, 0.0522], [0.28, 0.052], [0.4, 0.05], [0.55, 0.047], [0.63, 0.047], [0.78, 0.053], [0.9, 0.05], [0.965, 0.039], [1, 0.033]]);
  const geo = tube(path, {
    nu: hi ? 40 : 20,
    nv: hi ? 56 : 28,
    hint: V3(0, 0, -1),
    a,
    b: (t) => a(t) * 0.97,
    mod: (t, phi) => {
      const wr = sstep(0.62, 0.78, t) * (1 - sstep(0.95, 1.0, t));
      const ripple = 0.13 * wr * Math.sin(t * Math.PI * 2 * 8.5 + 0.9 * Math.sin(phi * 2) + 0.5 * Math.sin(phi * 3 + 1));
      const elbow = gauss(t, 0.575, 0.06);
      const inner = 0.5 - 0.5 * Math.cos(phi);
      const crease = 1 - 0.12 * elbow * inner + 0.06 * elbow * inner * Math.sin(t * Math.PI * 2 * 26);
      const env = 0.45 + 0.55 * sstep(0.08, 0.35, t);
      const long = 0.04 * Math.sin(phi * 3 + t * 9 + 0.8) + 0.024 * Math.sin(phi * 5 - t * 14);
      return crease * (1 + ripple + long * env);
    },
    uv: (u, v) => [u * 2, v * 2.8],
  });
  return { geo, cuff: cuffLoop(Wc, dirF, 0.0335) };
}

/* ---------- trousers ---------- */

export function pelvisGeo(hi: boolean): THREE.BufferGeometry {
  const y0 = 0.58;
  const y1 = 0.81;
  return surface(hi ? 48 : 24, hi ? 14 : 8, (u, v, out) => {
    const y = lerp(y0, y1, v);
    const phi = Math.PI * 2 * u;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    const n = 2.25;
    const cx = Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    const sx = Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    out.set((BODY_A(y) + 0.009) * sx, y, BODY_CZ(y) + (c >= 0 ? BODY_BF(y) + 0.009 : BODY_BK(y) + 0.009) * cx);
  }, { uv: (u, v) => [u * 3, v] });
}

export function trouserLegGeo(leg: LegPose, hi: boolean, seed: number): THREE.BufferGeometry {
  const { K, A } = leg;
  const dir = A.clone().sub(K);
  const path = leg.thigh.slice();
  path.push(K.clone().addScaledVector(dir, 0.3), K.clone().addScaledVector(dir, 0.66), K.clone().addScaledVector(dir, 0.94));
  const curve = new THREE.CatmullRomCurve3(path, false, 'centripetal');
  const total = curve.getLength();
  let thighLen = 0;
  for (let i = 1; i < leg.thigh.length; i++) {
    thighLen += leg.thigh[i].distanceTo(leg.thigh[i - 1]);
  }
  const tK = Math.min(0.7, thighLen / total);
  const a = prof([[0, 0.075], [0.08, 0.081], [0.28, 0.07], [tK - 0.1, 0.057], [tK, 0.051], [tK + 0.1, 0.049], [0.78, 0.045], [0.92, 0.042], [1, 0.041]]);
  return tube(path, {
    nu: hi ? 44 : 22,
    nv: hi ? 72 : 36,
    hint: V3(0, 1, 0),
    a,
    b: (t) => a(t) * 0.94,
    capStart: 0.9,
    mod: (t, phi) => {
      const back = 0.5 - 0.5 * Math.cos(phi);
      const front = 0.5 + 0.5 * Math.cos(phi);
      const pinch = 1 - 0.16 * gauss(t, tK, 0.05) * back;
      const kneeW = 0.07 * Math.sin((t - tK) * 2 * Math.PI / 0.036 + seed) * gauss(t, tK - 0.015, 0.06) * front;
      const hipW = 0.04 * Math.sin((t * 2 * Math.PI) / 0.045 + phi * 2 + seed) * gauss(t, 0.1, 0.07);
      const slack = 0.028 * Math.sin(phi * 3 + t * 13 + seed) * sstep(0.1, 0.5, t) * (1 - sstep(0.5, 0.8, t));
      const brk = 0.05 * gauss(t, 0.925, 0.022) * Math.sin(phi * 4 + seed * 1.7 + t * 90);
      return pinch * (1 + kneeW + hipW + slack + brk);
    },
    uv: (u, v) => [u * 2, v * 5.5],
  });
}

