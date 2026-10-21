import * as THREE from 'three';

/**
 * Smooth parametric surfaces for the mannequin: a generic (u around, v along) grid with analytic-ish
 * seam-free normals, a variable-radius tube along a spline, and 1-D profile splines.
 */

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const sstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const gauss = (v: number, c: number, s: number) => Math.exp(-(((v - c) / s) ** 2));
export const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export type Knots = Array<[number, number]>;

/** 1-D cubic Hermite through knots [t, value] (Catmull-Rom tangents), clamped outside the range. */
export function prof(k: Knots): (t: number) => number {
  const n = k.length;
  const m: number[] = [];
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(n - 1, i + 1);
    m.push((k[i1][1] - k[i0][1]) / (k[i1][0] - k[i0][0] || 1));
  }
  return (t: number) => {
    if (t <= k[0][0]) {
      return k[0][1];
    }
    if (t >= k[n - 1][0]) {
      return k[n - 1][1];
    }
    let i = 0;
    while (i < n - 2 && t > k[i + 1][0]) {
      i++;
    }
    const h = k[i + 1][0] - k[i][0];
    const s = (t - k[i][0]) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * k[i][1] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * k[i + 1][1] + (s3 - s2) * h * m[i + 1];
  };
}

export interface SurfOpts {
  /** Replace the default (u, v) texture coordinates. */
  uv?: (u: number, v: number, p: THREE.Vector3) => [number, number];
  /** The last row equals the first (closed loops such as hem bands). */
  closedV?: boolean;
  /** Face inwards (for inner linings). */
  flip?: boolean;
}

/**
 * Grid surface: u runs around a closed ring (wraps), v runs along the rows (open). Normals come from the
 * grid neighbours (so there is no seam), oriented away from each ring's centre.
 */
export function surface(nu: number, nv: number, fn: (u: number, v: number, out: THREE.Vector3) => void, o: SurfOpts = {}): THREE.BufferGeometry {
  const cols = nu + 1;
  const rows = nv + 1;
  const pos = new Float32Array(rows * cols * 3);
  const nor = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2);
  const tmp = new THREE.Vector3();
  const centers: THREE.Vector3[] = [];
  for (let i = 0; i < rows; i++) {
    const c = new THREE.Vector3();
    for (let j = 0; j < cols; j++) {
      fn(j / nu, i / nv, tmp);
      const k = i * cols + j;
      pos[k * 3] = tmp.x;
      pos[k * 3 + 1] = tmp.y;
      pos[k * 3 + 2] = tmp.z;
      if (j < nu) {
        c.add(tmp);
      }
      if (o.uv) {
        const t = o.uv(j / nu, i / nv, tmp);
        uv[k * 2] = t[0];
        uv[k * 2 + 1] = t[1];
      } else {
        uv[k * 2] = j / nu;
        uv[k * 2 + 1] = i / nv;
      }
    }
    centers.push(c.multiplyScalar(1 / nu));
  }
  const P = (i: number, j: number, out: THREE.Vector3) => {
    const jj = ((j % nu) + nu) % nu;
    const k = (i * cols + jj) * 3;
    return out.set(pos[k], pos[k + 1], pos[k + 2]);
  };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const du = new THREE.Vector3();
  const dv = new THREE.Vector3();
  const n = new THREE.Vector3();
  let orient = 0;
  for (let i = 0; i < rows; i++) {
    const ii = o.closedV && i === nv ? 0 : i;
    const i1 = o.closedV ? (ii - 1 + nv) % nv : Math.max(0, i - 1);
    const i2 = o.closedV ? (ii + 1) % nv : Math.min(nv, i + 1);
    for (let j = 0; j < nu; j++) {
      P(i, j + 1, a);
      P(i, j - 1, b);
      du.subVectors(a, b);
      P(i2, j, a);
      P(i1, j, b);
      dv.subVectors(a, b);
      n.crossVectors(dv, du);
      if (n.lengthSq() < 1e-14) {
        // pole / collapsed row: point along the axis away from the neighbouring ring
        const other = i === 0 ? centers[Math.min(nv, 1)] : centers[Math.max(0, nv - 1)];
        n.subVectors(centers[i], other);
        if (n.lengthSq() < 1e-14) {
          n.set(0, 1, 0);
        }
      }
      n.normalize();
      const k = (i * cols + j) * 3;
      nor[k] = n.x;
      nor[k + 1] = n.y;
      nor[k + 2] = n.z;
      orient += n.x * (pos[k] - centers[i].x) + n.y * (pos[k + 1] - centers[i].y) + n.z * (pos[k + 2] - centers[i].z);
    }
    const k0 = (i * cols) * 3;
    const k1 = (i * cols + nu) * 3;
    nor[k1] = nor[k0];
    nor[k1 + 1] = nor[k0 + 1];
    nor[k1 + 2] = nor[k0 + 2];
  }
  const flip = (orient < 0) !== !!o.flip;
  if (flip) {
    for (let i = 0; i < nor.length; i++) {
      nor[i] = -nor[i];
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < nv; i++) {
    for (let j = 0; j < nu; j++) {
      const p0 = i * cols + j;
      const p1 = p0 + 1;
      const p2 = p0 + cols;
      const p3 = p2 + 1;
      if (flip) {
        idx.push(p0, p1, p2, p1, p3, p2);
      } else {
        idx.push(p0, p2, p1, p1, p2, p3);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export interface TubeOpts {
  nu: number;
  nv: number;
  /** Half extent along the hint axis (phi = 0). */
  a: (t: number) => number;
  /** Half extent along the perpendicular axis (defaults to `a`). */
  b?: (t: number) => number;
  /** Approximate direction of phi = 0 (kept perpendicular to the path by parallel transport). */
  hint: THREE.Vector3;
  /** Radial multiplier (folds, creases). */
  mod?: (t: number, phi: number) => number;
  /** Super-ellipse exponent of the cross-section (2 = ellipse). */
  pow?: (t: number) => number;
  /** 0 = open end, 1 = hemispherical cap. */
  capStart?: number;
  capEnd?: number;
  capRows?: number;
  uv?: (u: number, v: number, p: THREE.Vector3) => [number, number];
  /** Rotates phi = 0 around the path as a function of t. */
  twist?: (t: number) => number;
}

interface Row {
  c: THREE.Vector3;
  u: THREE.Vector3;
  w: THREE.Vector3;
  k: number;
  t: number;
}

/** Variable elliptical tube along a Catmull-Rom path (parallel-transport frames). */
export function tube(path: THREE.Vector3[], o: TubeOpts): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(path, false, 'centripetal');
  curve.arcLengthDivisions = 400;
  const nv = o.nv;
  const capRows = o.capRows || 5;
  const bf = o.b || o.a;
  const main: Row[] = [];
  let prevT = curve.getTangentAt(0).normalize();
  let u = o.hint.clone().addScaledVector(prevT, -o.hint.dot(prevT)).normalize();
  const q = new THREE.Quaternion();
  for (let i = 0; i <= nv; i++) {
    const t = i / nv;
    const c = curve.getPointAt(t);
    const T = curve.getTangentAt(t).normalize();
    if (i > 0) {
      q.setFromUnitVectors(prevT, T);
      u.applyQuaternion(q);
    }
    prevT = T;
    const tw = o.twist ? o.twist(t) : 0;
    const uu = u.clone();
    const w = new THREE.Vector3().crossVectors(T, uu).normalize();
    if (tw) {
      uu.applyAxisAngle(T, tw);
      w.applyAxisAngle(T, tw);
    }
    main.push({ c, u: uu, w, k: 1, t });
  }
  const rows: Row[] = [];
  if (o.capStart) {
    const r = Math.max(o.a(0), bf(0)) * o.capStart;
    const T = curve.getTangentAt(0).normalize();
    for (let k = 0; k < capRows; k++) {
      const th = (Math.PI / 2) * (1 - k / capRows);
      rows.push({ c: main[0].c.clone().addScaledVector(T, -r * Math.sin(th)), u: main[0].u, w: main[0].w, k: Math.cos(th), t: 0 });
    }
  }
  for (const m of main) {
    rows.push(m);
  }
  if (o.capEnd) {
    const r = Math.max(o.a(1), bf(1)) * o.capEnd;
    const T = curve.getTangentAt(1).normalize();
    const last = main[main.length - 1];
    for (let k = 1; k <= capRows; k++) {
      const th = (Math.PI / 2) * (k / capRows);
      rows.push({ c: last.c.clone().addScaledVector(T, r * Math.sin(th)), u: last.u, w: last.w, k: Math.cos(th), t: 1 });
    }
  }
  const R = rows.length - 1;
  return surface(
    o.nu,
    R,
    (uu, vv, out) => {
      const row = rows[Math.round(vv * R)];
      const phi = uu * Math.PI * 2;
      let cx = Math.cos(phi);
      let sx = Math.sin(phi);
      if (o.pow) {
        const e = 2 / o.pow(row.t);
        cx = Math.sign(cx) * Math.pow(Math.abs(cx), e);
        sx = Math.sign(sx) * Math.pow(Math.abs(sx), e);
      }
      const m = (o.mod ? o.mod(row.t, phi) : 1) * row.k;
      out.copy(row.c).addScaledVector(row.u, o.a(row.t) * cx * m).addScaledVector(row.w, bf(row.t) * sx * m);
    },
    { uv: o.uv }
  );
}
