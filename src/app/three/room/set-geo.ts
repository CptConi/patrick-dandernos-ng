import * as THREE from 'three';

/**
 * Geometry helpers for the lighting set: a vertex-colour "baker" that merges many parts
 * (stands, strobes, mannequin limbs...) into one draw call per material, plus a few shape tools.
 */

export interface Xf {
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const _o = new THREE.Object3D();
const _m = new THREE.Matrix4();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _x = new THREE.Vector3();
const _z = new THREE.Vector3();
const _col = new THREE.Color();

const shared = new Map<string, THREE.BufferGeometry>();
/** Process-wide cache of unit primitives (never mutated, cloned by the baker). */
function unit(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = shared.get(key);
  if (!g) {
    g = make();
    shared.set(key, g);
  }
  return g;
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Matrix whose +Y runs from a to b, origin at a, +Z as close as possible to `hint`. */
export function orient(a: THREE.Vector3, b: THREE.Vector3, hint = new THREE.Vector3(0, 0, 1), out = new THREE.Matrix4()): THREE.Matrix4 {
  const y = _b.copy(b).sub(a).normalize();
  let z = _z.copy(hint).addScaledVector(y, -hint.dot(y));
  if (z.lengthSq() < 1e-6) {
    z = _z.set(1, 0, 0).addScaledVector(y, -y.x);
  }
  z.normalize();
  const x = _x.crossVectors(y, z).normalize();
  const yy = y.clone();
  const zz = z.clone();
  const xx = x.clone();
  out.makeBasis(xx, yy, zz);
  out.setPosition(a);
  return out;
}

export class Bake {
  private list: THREE.BufferGeometry[] = [];
  /** Optional parent transform (local frame -> world) applied to everything added afterwards. */
  base: THREE.Matrix4 | null = null;

  geo(src: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, o: Xf = {}): this {
    _o.position.set(x, y, z);
    _o.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
    _o.scale.set(o.sx === undefined ? 1 : o.sx, o.sy === undefined ? 1 : o.sy, o.sz === undefined ? 1 : o.sz);
    _o.updateMatrix();
    return this.mat4(src, color, _o.matrix);
  }

  mat4(src: THREE.BufferGeometry, color: number, m: THREE.Matrix4): this {
    const g = src.index ? src.toNonIndexed() : src.clone();
    _m.copy(m);
    if (this.base) {
      _m.premultiply(this.base);
    }
    g.applyMatrix4(_m);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const own = g.attributes.color as THREE.BufferAttribute | undefined;
    // raw hex, same convention as kit.std() materials (r150 legacy colour handling)
    _col.setHex(color);
    for (let i = 0; i < n; i++) {
      const k = own ? own.getX(i) : 1;
      col[i * 3] = _col.r * k;
      col[i * 3 + 1] = _col.g * (own ? own.getY(i) : 1);
      col[i * 3 + 2] = _col.b * (own ? own.getZ(i) : 1);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    this.list.push(g);
    return this;
  }

  /** Tapered cylinder between two points (r0 at a, r1 at b). */
  rod(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r0: number, r1: number, color: number, seg = 8, hint?: THREE.Vector3): this {
    _a.set(ax, ay, az);
    const bb = new THREE.Vector3(bx, by, bz);
    const len = bb.distanceTo(_a);
    if (len < 1e-5) {
      return this;
    }
    const g = unit(`cyl1:${seg}`, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1).translate(0, 0.5, 0));
    // scale radius per end by baking a tapered clone
    const t = g.clone();
    const p = t.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const yy = p.getY(i);
      const r = r0 + (r1 - r0) * yy;
      p.setXYZ(i, p.getX(i) * r, yy * len, p.getZ(i) * r);
    }
    const m = orient(_a, bb, hint, new THREE.Matrix4());
    this.mat4(t, color, m);
    t.dispose();
    return this;
  }

  /** Lathe along the a->b axis; profile = [radius, t] with t in 0..1 of the axis length. */
  lathe(profile: Array<[number, number]>, a: THREE.Vector3, b: THREE.Vector3, color: number, seg = 16, hint?: THREE.Vector3, post?: (g: THREE.BufferGeometry, len: number) => void): this {
    const len = a.distanceTo(b);
    if (len < 1e-5) {
      return this;
    }
    const g = new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(p[0], p[1] * len)), seg);
    if (post) {
      post(g, len);
    }
    this.mat4(g, color, orient(a, b, hint, new THREE.Matrix4()));
    g.dispose();
    return this;
  }

  /** Unit sphere scaled to (rx, ry, rz). */
  ball(x: number, y: number, z: number, rx: number, color: number, ry = rx, rz = rx, o: Xf = {}, seg = 12): this {
    const g = unit(`sph:${seg}`, () => new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.7))));
    return this.geo(g, color, x, y, z, { ...o, sx: rx * (o.sx === undefined ? 1 : o.sx), sy: ry * (o.sy === undefined ? 1 : o.sy), sz: rz * (o.sz === undefined ? 1 : o.sz) });
  }

  box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0, o: Xf = {}): this {
    const g = unit('box1', () => new THREE.BoxGeometry(1, 1, 1));
    return this.geo(g, color, x, y, z, { ...o, sx: w * (o.sx === undefined ? 1 : o.sx), sy: h * (o.sy === undefined ? 1 : o.sy), sz: d * (o.sz === undefined ? 1 : o.sz) });
  }

  /** Cylinder along Y centred on (x, y, z); rotate with Xf to aim it. */
  cyl(r: number, h: number, color: number, x = 0, y = 0, z = 0, o: Xf = {}, seg = 12): this {
    const g = unit(`cyl-u:${seg}`, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1));
    return this.geo(g, color, x, y, z, { ...o, sx: r, sy: h, sz: r });
  }

  tube(pts: Array<[number, number, number]>, r: number, color: number, seg = 40, radial = 5): this {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    const g = new THREE.TubeGeometry(curve, seg, r, radial, false);
    this.geo(g, color);
    g.dispose();
    return this;
  }

  /** Merge into one mesh. `ao` darkens vertices close to the floor (baked contact occlusion). */
  flush(parent: THREE.Object3D, mat: THREE.Material, o: { cast?: boolean; receive?: boolean; name?: string; ao?: boolean } = {}): THREE.Mesh | null {
    if (!this.list.length) {
      return null;
    }
    const g = mergeColored(this.list, o.ao !== false);
    this.list.length = 0;
    const m = new THREE.Mesh(g, mat);
    m.castShadow = !!o.cast;
    m.receiveShadow = o.receive !== false;
    if (o.name) {
      m.name = o.name;
    }
    parent.add(m);
    return m;
  }
}

export function mergeColored(list: THREE.BufferGeometry[], floorAO: boolean): THREE.BufferGeometry {
  let total = 0;
  for (const g of list) {
    total += g.attributes.position.count;
  }
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    pos.set((g.attributes.position as THREE.BufferAttribute).array as ArrayLike<number>, o * 3);
    if (g.attributes.normal) {
      nor.set((g.attributes.normal as THREE.BufferAttribute).array as ArrayLike<number>, o * 3);
    }
    if (g.attributes.uv) {
      uv.set((g.attributes.uv as THREE.BufferAttribute).array as ArrayLike<number>, o * 2);
    }
    col.set((g.attributes.color as THREE.BufferAttribute).array as ArrayLike<number>, o * 3);
    o += n;
    g.dispose();
  }
  if (floorAO) {
    for (let i = 0; i < total; i++) {
      const y = pos[i * 3 + 1];
      if (y < 0.45) {
        const k = 0.55 + 0.45 * smooth(0, 0.45, y);
        col[i * 3] *= k;
        col[i * 3 + 1] *= k;
        col[i * 3 + 2] *= k;
      }
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

/** Recompute normals and weld them across coincident vertices (hides lathe / sphere seams). */
export function weldNormals(g: THREE.BufferGeometry): void {
  g.computeVertexNormals();
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  const acc = new Map<string, THREE.Vector3>();
  const key = (i: number) => `${Math.round(p.getX(i) * 5000)},${Math.round(p.getY(i) * 5000)},${Math.round(p.getZ(i) * 5000)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i);
    let v = acc.get(k);
    if (!v) {
      v = new THREE.Vector3();
      acc.set(k, v);
    }
    v.x += n.getX(i);
    v.y += n.getY(i);
    v.z += n.getZ(i);
  }
  acc.forEach((v) => v.normalize());
  for (let i = 0; i < p.count; i++) {
    const v = acc.get(key(i)) as THREE.Vector3;
    n.setXYZ(i, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
}

/** Cheap deterministic 2D value-ish noise for cloth folds. */
export function fold(x: number, y: number, seed = 0): number {
  return (
    Math.sin(x * 1.0 + seed) * 0.5 +
    Math.sin(x * 2.3 + y * 0.7 + seed * 1.7) * 0.3 +
    Math.sin(x * 4.9 - y * 1.3 + seed * 2.9) * 0.2
  );
}

export { smooth };
export const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export { Y_AXIS };
