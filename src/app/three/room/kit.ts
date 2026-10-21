import * as THREE from 'three';

/** Optional rotation / scale for a placed part. */
export interface Xf {
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

export interface DimEntry {
  color: THREE.Color;
  base: THREE.Color;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Shared geometry / material cache + bookkeeping of "glowing" materials that dim in focus mode. */
export class Kit {
  readonly dimmables: DimEntry[] = [];
  readonly textures: THREE.Texture[] = [];
  private geoCache = new Map<string, THREE.BufferGeometry>();
  private matCache = new Map<string, THREE.Material>();

  constructor(readonly aniso: number) {}

  tex<T extends THREE.Texture>(t: T): T {
    this.textures.push(t);
    return t;
  }

  geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.geoCache.get(key);
    if (!g) {
      g = make();
      this.geoCache.set(key, g);
    }
    return g;
  }

  box(w: number, h: number, d: number): THREE.BufferGeometry {
    return this.geo(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
  }

  cyl(rt: number, rb: number, h: number, seg = 14): THREE.BufferGeometry {
    return this.geo(`cyl:${rt}:${rb}:${h}:${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
  }

  sphere(r: number, ws = 16, hs = 12): THREE.BufferGeometry {
    return this.geo(`sph:${r}:${ws}:${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
  }

  plane(w: number, h: number): THREE.BufferGeometry {
    return this.geo(`pln:${w}:${h}`, () => new THREE.PlaneGeometry(w, h));
  }

  rbox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
    return this.geo(`rbx:${w}:${h}:${d}:${r}`, () => roundedBoxGeo(w, h, d, r));
  }

  capsule(r: number, len: number): THREE.BufferGeometry {
    return this.geo(`cap:${r}:${len}`, () => new THREE.CapsuleGeometry(r, Math.max(0.001, len), 4, 10));
  }

  /** Cached MeshStandardMaterial (only when no extra params are given). */
  std(color: number, rough = 0.8, metal = 0, params?: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
    if (params) {
      return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...params });
    }
    const key = `${color}|${rough}|${metal}`;
    let m = this.matCache.get(key) as THREE.MeshStandardMaterial | undefined;
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
      this.matCache.set(key, m);
    }
    return m;
  }

  /** Unlit glowing material; color is scaled by `gain` (>1 blooms through tone mapping) and dims in focus mode. */
  glow(color: number, gain = 1, params?: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({ color, ...params });
    m.color.multiplyScalar(gain);
    this.dimmables.push({ color: m.color, base: m.color.clone() });
    return m;
  }

  registerDim(mat: { color: THREE.Color }) {
    this.dimmables.push({ color: mat.color, base: mat.color.clone() });
  }
}

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

/** Rounded box built from a bevelled extrusion (core three only). Centered on the origin. */
export function roundedBoxGeo(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const bev = Math.max(0.002, Math.min(r * 0.6, d / 2 - 0.002, w / 2 - 0.004, h / 2 - 0.004));
  const sw = w - 2 * bev;
  const sh = h - 2 * bev;
  const c = Math.max(0.001, Math.min(r - bev, sw / 2 - 0.001, sh / 2 - 0.001));
  const x0 = -sw / 2;
  const x1 = sw / 2;
  const y0 = -sh / 2;
  const y1 = sh / 2;
  const s = new THREE.Shape();
  s.moveTo(x0 + c, y0);
  s.lineTo(x1 - c, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + c);
  s.lineTo(x1, y1 - c);
  s.quadraticCurveTo(x1, y1, x1 - c, y1);
  s.lineTo(x0 + c, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - c);
  s.lineTo(x0, y0 + c);
  s.quadraticCurveTo(x0, y0, x0 + c, y0);
  const bt = Math.min(bev, d / 2 - 0.002);
  const depth = Math.max(0.001, d - 2 * bt);
  const g = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelThickness: bt,
    bevelSize: bev,
    bevelOffset: 0,
    bevelSegments: 3,
    curveSegments: 4,
    steps: 1,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Closed outline from points (mirrored around x = 0), smoothed with a spline, extruded along z. */
export function symmetricOutlineGeo(
  half: Array<[number, number]>,
  depth: number,
  bevel = 0.008
): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (const p of half) {
    pts.push(new THREE.Vector2(p[0], p[1]));
  }
  for (let i = half.length - 2; i >= 1; i--) {
    pts.push(new THREE.Vector2(-half[i][0], half[i][1]));
  }
  pts.push(pts[0].clone());
  const smooth = new THREE.SplineCurve(pts).getPoints(90);
  const shape = new THREE.Shape(smooth);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.002, depth - 2 * bevel),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 4,
  });
  g.translate(0, 0, -(depth - 2 * bevel) / 2);
  return g;
}

/** Rectangular frustum (open ended) pointing +Z: small end at z = 0, big end at z = d. */
export function frustumGeo(bw: number, bh: number, fw: number, fh: number, d: number): THREE.BufferGeometry {
  const v: number[][] = [
    [-bw / 2, -bh / 2, 0],
    [bw / 2, -bh / 2, 0],
    [bw / 2, bh / 2, 0],
    [-bw / 2, bh / 2, 0],
    [-fw / 2, -fh / 2, d],
    [fw / 2, -fh / 2, d],
    [fw / 2, fh / 2, d],
    [-fw / 2, fh / 2, d],
  ];
  const quads = [
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ];
  const pos: number[] = [];
  const uv: number[] = [];
  const push = (i: number, u: number, w: number) => {
    pos.push(v[i][0], v[i][1], v[i][2]);
    uv.push(u, w);
  };
  for (const q of quads) {
    push(q[0], 0, 0);
    push(q[1], 1, 0);
    push(q[2], 1, 1);
    push(q[0], 0, 0);
    push(q[2], 1, 1);
    push(q[3], 0, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/**
 * Collects parts per material and merges them, so a prop with many primitives costs one draw call per material.
 * Parts are baked with their transform; each part is cloned so source geometries stay shareable.
 */
export class Assembly {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private tmp = new THREE.Object3D();
  private q = new THREE.Quaternion();
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();

  add(mat: THREE.Material, geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, o: Xf = {}): this {
    const t = this.tmp;
    t.position.set(x, y, z);
    t.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
    t.scale.set(o.sx === undefined ? 1 : o.sx, o.sy === undefined ? 1 : o.sy, o.sz === undefined ? 1 : o.sz);
    t.updateMatrix();
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(t.matrix);
    let list = this.parts.get(mat);
    if (!list) {
      list = [];
      this.parts.set(mat, list);
    }
    list.push(g);
    return this;
  }

  /** Cylinder rod between two points. */
  rod(mat: THREE.Material, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, seg = 8): this {
    this.a.set(ax, ay, az);
    this.b.set(bx, by, bz);
    const dir = this.b.clone().sub(this.a);
    const len = dir.length();
    if (len < 1e-5) {
      return this;
    }
    dir.normalize();
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
    this.q.setFromUnitVectors(Y_AXIS, dir);
    const t = this.tmp;
    t.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    t.quaternion.copy(this.q);
    t.scale.set(1, 1, 1);
    t.updateMatrix();
    const ng = g.toNonIndexed();
    g.dispose();
    ng.applyMatrix4(t.matrix);
    let list = this.parts.get(mat);
    if (!list) {
      list = [];
      this.parts.set(mat, list);
    }
    list.push(ng);
    return this;
  }

  /** Capsule limb between two points. */
  limb(mat: THREE.Material, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number): this {
    this.a.set(ax, ay, az);
    this.b.set(bx, by, bz);
    const dir = this.b.clone().sub(this.a);
    const len = dir.length();
    if (len < 1e-5) {
      return this;
    }
    dir.normalize();
    const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 3, 10);
    this.q.setFromUnitVectors(Y_AXIS, dir);
    const t = this.tmp;
    t.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    t.quaternion.copy(this.q);
    t.scale.set(1, 1, 1);
    t.updateMatrix();
    const ng = g.toNonIndexed();
    g.dispose();
    ng.applyMatrix4(t.matrix);
    let list = this.parts.get(mat);
    if (!list) {
      list = [];
      this.parts.set(mat, list);
    }
    list.push(ng);
    return this;
  }

  flush(parent: THREE.Object3D, o: { cast?: boolean; receive?: boolean; name?: string } = {}): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    this.parts.forEach((list, mat) => {
      const merged = mergeGeos(list);
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = !!o.cast;
      m.receiveShadow = o.receive !== false;
      if (o.name) {
        m.name = o.name;
      }
      parent.add(m);
      out.push(m);
    });
    this.parts.clear();
    return out;
  }
}

/** Merge non-indexed geometries that carry position / normal / uv. */
export function mergeGeos(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let total = 0;
  for (const g of list) {
    total += g.attributes.position.count;
  }
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let o = 0;
  for (const src of list) {
    const g = src.index ? src.toNonIndexed() : src;
    const n = g.attributes.position.count;
    pos.set((g.attributes.position as THREE.BufferAttribute).array as ArrayLike<number>, o * 3);
    if (g.attributes.normal) {
      nor.set((g.attributes.normal as THREE.BufferAttribute).array as ArrayLike<number>, o * 3);
    }
    if (g.attributes.uv) {
      uv.set((g.attributes.uv as THREE.BufferAttribute).array as ArrayLike<number>, o * 2);
    }
    o += n;
    if (g !== src) {
      g.dispose();
    }
    src.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

export function put(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material | THREE.Material[],
  x = 0,
  y = 0,
  z = 0,
  o: Xf & { cast?: boolean; receive?: boolean; name?: string } = {}
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (o.rx || o.ry || o.rz) {
    m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
  }
  if (o.sx !== undefined || o.sy !== undefined || o.sz !== undefined) {
    m.scale.set(o.sx === undefined ? 1 : o.sx, o.sy === undefined ? 1 : o.sy, o.sz === undefined ? 1 : o.sz);
  }
  m.castShadow = !!o.cast;
  m.receiveShadow = o.receive !== false;
  if (o.name) {
    m.name = o.name;
  }
  parent.add(m);
  return m;
}
