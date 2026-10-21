import * as THREE from 'three';
import { headMatrix } from './mannequin-pose';
import { gauss, lerp, prof, sstep, surface, tube, V3 } from './mannequin-surf';

/**
 * Abstract fashion-mannequin head (egg-shaped, softly sculpted face, no painted features), the copper bob
 * wig and the neck. Head-local frame: origin at the skull centre, +Y up, +Z forward.
 */

const DEG = Math.PI / 180;
const Y_TOP = 0.104;
const Y_CHIN = 0.108;
const W_MAX = 0.0735;
const F_DEP = 0.074;
const B_DEP = 0.092;

const wFac = prof([[0, 1], [30, 1.04], [60, 1.05], [90, 1.0], [110, 0.94], [130, 0.85], [150, 0.78], [180, 0.74]].map((p): [number, number] => [p[0] * DEG, p[1]]));
const fFac = prof([[0, 1], [20, 1.1], [40, 1.12], [50, 1.06], [60, 1.02], [70, 0.98], [80, 0.93], [90, 0.9], [100, 0.92], [110, 0.96], [120, 1.0], [130, 1.05], [140, 1.12], [150, 1.2], [160, 1.28], [180, 1.3]].map((p): [number, number] => [p[0] * DEG, p[1]]));
const bFac = prof([[0, 1], [90, 1], [120, 0.86], [150, 0.7], [180, 0.64]].map((p): [number, number] => [p[0] * DEG, p[1]]));

interface Ring {
  y: number;
  w: number;
  f: number;
  b: number;
}

/** Head ring (half width, front depth, back depth) at polar angle theta (0 = crown, PI = chin). */
function ring(theta: number): Ring {
  const s = Math.sin(theta);
  const R = lerp(Y_TOP, Y_CHIN, sstep(80 * DEG, 100 * DEG, theta));
  return { y: R * Math.cos(theta), w: W_MAX * wFac(theta) * s, f: F_DEP * fFac(theta) * s, b: B_DEP * bFac(theta) * s };
}

function thetaOfY(y: number): number {
  const R = y >= 0 ? Y_TOP : Y_CHIN;
  return Math.acos(Math.max(-1, Math.min(1, y / R)));
}

const bump = (x: number, y: number, cx: number, cy: number, sx: number, sy: number, a: number) => a * Math.exp(-(((x - cx) / sx) ** 2) - ((y - cy) / sy) ** 2);

/** Relief of the face in metres along +Z: nose, brow, soft eye sockets, cheekbones, subtle lips, chin. */
function faceRelief(x: number, y: number): number {
  const ax = Math.abs(x);
  let dz = 0;
  const noseH = 0.026 * sstep(0.03, -0.027, y) * (1 - sstep(-0.029, -0.041, y));
  const noseW = 0.0052 + 0.0078 * sstep(0.01, -0.026, y);
  dz += noseH * Math.exp(-((ax / noseW) ** 2));
  dz += bump(ax, y, 0.0125, -0.031, 0.0055, 0.0055, 0.004); // alae
  dz -= bump(ax, y, 0.007, -0.0385, 0.0032, 0.0028, 0.0028); // nostrils
  dz += bump(ax, y, 0.022, 0.034, 0.03, 0.0095, 0.0066); // brow ridge
  dz -= bump(ax, y, 0.031, 0.013, 0.017, 0.0085, 0.0064); // eye sockets
  dz += bump(ax, y, 0.047, -0.019, 0.02, 0.0145, 0.0048); // cheekbones
  dz -= bump(ax, y, 0.043, -0.053, 0.017, 0.019, 0.0036); // hollow under the cheekbone
  dz += bump(ax, y, 0, -0.0615, 0.0145, 0.0045, 0.0032); // upper lip
  dz += bump(ax, y, 0, -0.0745, 0.013, 0.005, 0.0034); // lower lip
  dz -= bump(ax, y, 0, -0.0675, 0.0135, 0.0013, 0.0024); // mouth line
  dz -= bump(ax, y, 0, -0.0845, 0.012, 0.003, 0.0018); // chin groove
  dz += bump(ax, y, 0, -0.0985, 0.013, 0.011, 0.0035); // chin
  return dz;
}

export function headGeo(hi: boolean): THREE.BufferGeometry {
  const nu = hi ? 96 : 48;
  const nv = hi ? 64 : 36;
  return surface(nu, nv, (u, v, out) => {
    const theta = v * Math.PI;
    const r = ring(theta);
    // columns packed around the face (phi = 0)
    const phi = Math.PI * 2 * u - 0.55 * Math.sin(Math.PI * 2 * u);
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    const pw = 2 + 0.25 * sstep(90 * DEG, 130 * DEG, theta);
    const e = 2 / pw;
    const cx = Math.sign(c) * Math.pow(Math.abs(c), e);
    const sx = Math.sign(s) * Math.pow(Math.abs(s), e);
    const x = r.w * sx;
    let z = (c >= 0 ? r.f : r.b) * cx;
    if (c > 0) {
      z += faceRelief(x, r.y) * sstep(0.12, 0.55, cx) * sstep(0.0, 0.02, r.f);
    }
    out.set(x, r.y, z);
  });
}

/** Neck: slender, leaning slightly forward, flaring into the trapezius at the base. */
export function neckGeo(hi: boolean): THREE.BufferGeometry {
  const top = V3(0, -0.088, -0.034).applyMatrix4(headMatrix());
  const path = [V3(0, 1.235, -0.036), V3(0, 1.29, -0.03), V3(top.x * 0.5, (1.3 + top.y) * 0.5, (-0.02 + top.z) * 0.5), top];
  return tube(path, {
    nu: hi ? 28 : 14,
    nv: hi ? 18 : 10,
    hint: V3(1, 0, 0),
    a: prof([[0, 0.062], [0.2, 0.048], [0.5, 0.0385], [0.8, 0.0375], [1, 0.04]]),
    b: prof([[0, 0.066], [0.2, 0.052], [0.5, 0.0405], [0.8, 0.039], [1, 0.0415]]),
  });
}

/** Glossy copper bob: sleek shell, side-swept fringe, chin-length locks curving inwards. */
export function wigGeo(hi: boolean, inner = false): THREE.BufferGeometry {
  const nu = inner ? (hi ? 64 : 32) : hi ? 112 : 56;
  const nv = inner ? (hi ? 24 : 14) : hi ? 48 : 26;
  const yTop = 0.114;
  const wigTheta = (yy: number) => (yy >= 0 ? Math.acos(Math.min(1, yy / 0.114)) : thetaOfY(Math.max(yy, -0.108)));
  return surface(
    nu,
    nv,
    (u, v, out) => {
      const psi = Math.PI * 2 * (u - 0.5);
      const a = Math.abs(psi);
      // hem: side-swept fringe sliding into a chin-length lock on her left, shorter on her right, nape shorter
      const fringe = 0.062 - 0.03 * sstep(-0.6, 0.5, psi) + 0.0007 * Math.sin(psi * 31);
      const lock = -0.09 - 0.008 * gauss(a, 1.22, 0.2) + 0.011 * sstep(1.5, 2.1, a) + 0.04 * sstep(2.1, 3.0, a);
      const hem = fringe + (lock - fringe) * sstep(psi >= 0 ? 0.4 : 0.52, 1.18, a);
      const rv = Math.min(1, v / 0.9);
      const curl = sstep(0.9, 1, v);
      const y = yTop + (hem - yTop) * rv + 0.004 * curl;
      const hr = ring(wigTheta(Math.max(y, -0.03)));
      const sw = Math.sin(wigTheta(y));
      // shell thickness: tight on the forehead, fuller at the sides / back
      const tF = 0.0052 + 0.0085 * sstep(0.02, 0.09, y) + 0.0035 * sstep(0.1, 1.0, psi) * sstep(0.04, 0.0, y);
      const tS = 0.0072 + 0.0045 * sstep(0.04, -0.02, y);
      const tB = 0.011 + 0.006 * sstep(0.04, -0.03, y);
      const t = lerp(tF, lerp(tS, tB, sstep(1.8, 2.6, a)), sstep(0.5, 1.2, a)) * Math.min(1, sw * 1.6);
      const bell = 0.0045 * gauss(y, -0.045, 0.045);
      const hook = sstep(0.8, 1.4, a) * (1 - sstep(2.4, 3.0, a));
      const tuck = (0.019 * Math.pow(sstep(-0.05, -0.108, y), 1.2) + 0.012 * curl) * (0.4 + 0.6 * hook);
      // the inner shell sits just inside and meets the outer one at the hem: a thick rounded edge, no see-through
      const ins = inner ? 0.0042 * (1 - sstep(0.93, 1, v)) * Math.min(1, sw * 3) : 0;
      const w = Math.max(0.001, hr.w + t + bell - tuck - ins);
      const fz = Math.max(0.001, hr.f + t * 0.9 + bell - tuck * 1.3 - ins);
      const bz = Math.max(0.001, hr.b + t + bell - tuck - ins);
      const c = Math.cos(psi);
      const s = Math.sin(psi);
      out.set(w * s, y, (c >= 0 ? fz : bz) * c);
    },
    { uv: (u, v) => [u * 3, v], flip: inner }
  );
}
