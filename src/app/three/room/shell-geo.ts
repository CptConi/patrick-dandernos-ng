import * as THREE from 'three';

export type V3 = [number, number, number];

/** Rectangular opening in a wall grid (wall-local metres). */
export interface Hole {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

export interface GridOpts {
  /** Origin and unit axes of the surface; the normal is u x v. */
  o: V3;
  u: V3;
  v: V3;
  uLen: number;
  vLen: number;
  holes?: Hole[];
  /** Top edge as a function of u (gable walls): rows are squeezed under it. */
  vMax?: (u: number) => number;
  /** With vMax: rows below this height keep their metric position (only the rows above are squeezed). */
  vFixed?: number;
  /** Baked brightness at a world position (1 = unoccluded). Written to vertex colours. */
  ao?: (x: number, y: number, z: number) => number;
  /** Extra per-vertex scalar (floor gloss) stored in the `aGloss` attribute. */
  gloss?: (x: number, y: number, z: number) => number;
  /** UV = (u, v) * uvScale. Defaults to metres. */
  uvScale?: [number, number];
  /** Added to the UV (after the scale): keeps the texture phase when the surface origin moves. */
  uvOffset?: [number, number];
  /** Grid pitch near the borders / in open areas, metres. */
  fine?: number;
  coarse?: number;
  edge?: number;
  extraU?: number[];
  extraV?: number[];
}

function breaks(len: number, extra: number[], fine: number, coarse: number, edge: number): number[] {
  const out: number[] = [];
  let t = 0;
  while (t < len - 1e-4) {
    out.push(t);
    const d = Math.min(t, len - t);
    t += d < edge ? fine : coarse;
  }
  out.push(len);
  for (const e of extra) {
    if (e > 0 && e < len) {
      out.push(e);
    }
  }
  out.sort((a, b) => a - b);
  const res: number[] = [];
  for (const v of out) {
    if (!res.length || v - res[res.length - 1] > 1e-3) {
      res.push(v);
    }
  }
  return res;
}

/**
 * Subdivided surface with optional rectangular holes, baked ambient occlusion in vertex colours and
 * metre-based UVs. Used for walls, floor and roof so contact shading / reveals need no extra meshes.
 */
export function gridGeo(opt: GridOpts): THREE.BufferGeometry {
  const fine = opt.fine || 0.1;
  const coarse = opt.coarse || 0.45;
  const edge = opt.edge || 0.6;
  const holes = opt.holes || [];
  const eu: number[] = (opt.extraU || []).slice();
  const ev: number[] = (opt.extraV || []).slice();
  for (const h of holes) {
    eu.push(h.u0, h.u1);
    ev.push(h.v0, h.v1);
  }
  const us = breaks(opt.uLen, eu, fine, coarse, edge);
  const vs = breaks(opt.vLen, ev, fine, coarse, edge);
  const nu = us.length;
  const nv = vs.length;
  const nrm = new THREE.Vector3(opt.u[0], opt.u[1], opt.u[2]).cross(new THREE.Vector3(opt.v[0], opt.v[1], opt.v[2])).normalize();
  const sc = opt.uvScale || [1, 1];
  const uo = opt.uvOffset || [0, 0];

  const used = new Int32Array(nu * nv).fill(-1);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const glo: number[] = [];
  const idx: number[] = [];

  const inHole = (uc: number, vc: number) => {
    for (const h of holes) {
      if (uc > h.u0 && uc < h.u1 && vc > h.v0 && vc < h.v1) {
        return true;
      }
    }
    return false;
  };
  const vert = (i: number, j: number): number => {
    const k = j * nu + i;
    if (used[k] >= 0) {
      return used[k];
    }
    const u = us[i];
    let v = vs[j];
    if (opt.vMax) {
      const vf = opt.vFixed || 0;
      v = vs[j] <= vf ? vs[j] : vf + ((vs[j] - vf) / (opt.vLen - vf)) * (opt.vMax(u) - vf);
    }
    const x = opt.o[0] + opt.u[0] * u + opt.v[0] * v;
    const y = opt.o[1] + opt.u[1] * u + opt.v[1] * v;
    const z = opt.o[2] + opt.u[2] * u + opt.v[2] * v;
    const id = pos.length / 3;
    pos.push(x, y, z);
    nor.push(nrm.x, nrm.y, nrm.z);
    uv.push(u * sc[0] + uo[0], v * sc[1] + uo[1]);
    const a = opt.ao ? opt.ao(x, y, z) : 1;
    // occlusion darkens slightly warm
    col.push(a, Math.pow(a, 1.04), Math.pow(a, 1.1));
    if (opt.gloss) {
      glo.push(opt.gloss(x, y, z));
    }
    used[k] = id;
    return id;
  };

  for (let j = 0; j < nv - 1; j++) {
    for (let i = 0; i < nu - 1; i++) {
      if (inHole((us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2)) {
        continue;
      }
      const a = vert(i, j);
      const b = vert(i + 1, j);
      const c = vert(i + 1, j + 1);
      const d = vert(i, j + 1);
      idx.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (opt.gloss) {
    g.setAttribute('aGloss', new THREE.Float32BufferAttribute(glo, 1));
  }
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Skirting-board profile extruded along its length (centred on z = 0); profile x = depth into the room. */
export function skirtingGeo(length: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.019, 0);
  s.lineTo(0.019, 0.082);
  s.lineTo(0.012, 0.094);
  s.lineTo(0.006, 0.1);
  s.lineTo(0, 0.1);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: false, steps: 1, curveSegments: 1 });
  g.translate(0, 0, -length / 2);
  return g;
}
