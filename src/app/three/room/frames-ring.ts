import * as THREE from 'three';

/**
 * Mitred rectangular sweep of a 2D profile (o = outward offset from the opening edge, z = height above the wall).
 * Used for frame mouldings, passe-partout bevels, brass fillets, wall drop shadows and glow halos.
 * Positions + UVs are rewritten in place by `update`, so resizing never allocates.
 */
export interface ProfilePt {
  o: number;
  z: number;
  /** Vertex brightness (baked AO / bevel highlight). */
  c?: number;
  /** Vertex alpha (only with `alpha: true`). */
  a?: number;
}

interface Side {
  dx: number;
  dy: number;
  tx: number;
  ty: number;
}

// top, right, bottom, left (clockwise) - each satisfies tangent x outward = +Z so winding faces the room
const SIDES: Side[] = [
  { dx: 0, dy: 1, tx: 1, ty: 0 },
  { dx: 1, dy: 0, tx: 0, ty: -1 },
  { dx: 0, dy: -1, tx: -1, ty: 0 },
  { dx: -1, dy: 0, tx: 0, ty: 1 },
];

// quad corners as [profile offset, isEnd]: A_j, B_j, B_j+1 | A_j, B_j+1, A_j+1
const ORDER: Array<[number, number]> = [
  [0, 0],
  [0, 1],
  [1, 1],
  [0, 0],
  [1, 1],
  [1, 0],
];

export class RingGeo {
  readonly geometry = new THREE.BufferGeometry();
  private readonly pos: Float32Array;
  private readonly uv: Float32Array;
  private readonly vLen: number[] = [0];
  private readonly n: number;
  private lw = -1;
  private lh = -1;
  private lx = 0;
  private ly = 0;

  constructor(
    private readonly profile: ProfilePt[],
    private readonly opts: { alpha?: boolean; uvU?: number; uvV?: number } = {}
  ) {
    const n = profile.length - 1;
    this.n = n;
    const verts = n * 4 * 6;
    this.pos = new Float32Array(verts * 3);
    this.uv = new Float32Array(verts * 2);
    const nor = new Float32Array(verts * 3);
    const cs = opts.alpha ? 4 : 3;
    const col = new Float32Array(verts * cs);
    let acc = 0;
    for (let j = 0; j < n; j++) {
      acc += Math.hypot(profile[j + 1].o - profile[j].o, profile[j + 1].z - profile[j].z);
      this.vLen.push(acc);
    }
    let vi = 0;
    for (let s = 0; s < 4; s++) {
      const sd = SIDES[s];
      for (let j = 0; j < n; j++) {
        const p0 = profile[j];
        const p1 = profile[j + 1];
        let no = -(p1.z - p0.z);
        let nz = p1.o - p0.o;
        const l = Math.hypot(no, nz);
        if (l > 1e-9) {
          no /= l;
          nz /= l;
        } else {
          no = 0;
          nz = 1;
        }
        for (const [dj] of ORDER) {
          const p = profile[j + dj];
          nor[vi * 3] = sd.dx * no;
          nor[vi * 3 + 1] = sd.dy * no;
          nor[vi * 3 + 2] = nz;
          const c = p.c === undefined ? 1 : p.c;
          col[vi * cs] = c;
          col[vi * cs + 1] = c;
          col[vi * cs + 2] = c;
          if (cs === 4) {
            col[vi * cs + 3] = p.a === undefined ? 1 : p.a;
          }
          vi++;
        }
      }
    }
    const g = this.geometry;
    const posAttr = new THREE.BufferAttribute(this.pos, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    const uvAttr = new THREE.BufferAttribute(this.uv, 2);
    uvAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', posAttr);
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', uvAttr);
    g.setAttribute('color', new THREE.BufferAttribute(col, cs));
  }

  /** Rewrite the sweep for an opening of iw x ih centred on (cx, cy). Cheap no-op when nothing changed. */
  update(iw: number, ih: number, cx = 0, cy = 0): this {
    if (Math.abs(iw - this.lw) < 1e-6 && Math.abs(ih - this.lh) < 1e-6 && cx === this.lx && cy === this.ly) {
      return this;
    }
    this.lw = iw;
    this.lh = ih;
    this.lx = cx;
    this.ly = cy;
    const hw = iw / 2;
    const hh = ih / 2;
    const uu = this.opts.uvU === undefined ? 1.6 : this.opts.uvU;
    const uv = this.opts.uvV === undefined ? 30 : this.opts.uvV;
    const prof = this.profile;
    let pi = 0;
    let ui = 0;
    for (let s = 0; s < 4; s++) {
      const sd = SIDES[s];
      const hd = s & 1 ? hw : hh;
      const ht = s & 1 ? hh : hw;
      for (let j = 0; j < this.n; j++) {
        for (const [dj, isB] of ORDER) {
          const p = prof[j + dj];
          const e = hd + p.o;
          const t = (ht + p.o) * (isB ? 1 : -1);
          this.pos[pi++] = cx + sd.dx * e + sd.tx * t;
          this.pos[pi++] = cy + sd.dy * e + sd.ty * t;
          this.pos[pi++] = p.z;
          this.uv[ui++] = t * uu + s * 0.37;
          this.uv[ui++] = this.vLen[j + dj] * uv;
        }
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.uv.needsUpdate = true;
    // rebuilt lazily by the raycaster: a stale sphere would make the resized frame un-hoverable
    this.geometry.boundingSphere = null;
    this.geometry.boundingBox = null;
    return this;
  }
}

/** Concatenate non-indexed copies of geometries sharing the same attribute set (position / normal / uv / color). */
export function mergeAttr(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const src = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const names = Object.keys(src[0].attributes);
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = src[0].getAttribute(name).itemSize;
    let total = 0;
    for (const g of src) {
      total += g.getAttribute(name).count;
    }
    const arr = new Float32Array(total * size);
    let o = 0;
    for (const g of src) {
      const a = g.getAttribute(name) as THREE.BufferAttribute;
      arr.set(a.array as ArrayLike<number>, o);
      o += a.count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}
