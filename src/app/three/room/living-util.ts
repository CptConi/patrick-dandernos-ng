import * as THREE from 'three';
import { Kit, Xf } from './kit';
import { rng } from '../procedural-textures';

/**
 * Shared helpers of the furniture / living props: vertex-colour merge bag, soft (pillowy) boxes,
 * procedural wood / fabric maps and contact-shadow blobs. Everything is deterministic and procedural.
 */

/* ---------------------------------------------------------------- */
/* Quality switch (builders do not receive it, so props subscribe)   */
/* ---------------------------------------------------------------- */

export type Quality = 'high' | 'low';
type QualityHook = (q: Quality) => void;
const qualityHooks: QualityHook[] = [];
let currentQuality: Quality = 'high';

/** Optional: call from the room when the quality switch changes (clearcoat / normal maps / sway are toggled). */
export function setLivingQuality(q: Quality): void {
  currentQuality = q;
  for (const h of qualityHooks) {
    h(q);
  }
}

export function onLivingQuality(h: QualityHook): void {
  qualityHooks.push(h);
  h(currentQuality);
}

/**
 * Private (non shared) standard material cache. The Bag switches `vertexColors` on, which must never touch
 * the materials Kit.std() hands out to the other prop files.
 */
const ownMats = new WeakMap<Kit, Map<string, THREE.MeshStandardMaterial>>();

/**
 * The room is rendered with legacy (non colour managed) colours: hex values behave like linear values, so a
 * plain sRGB picked from a photo comes out far too light. This darkens an sRGB hex towards linear
 * (gamma 1.7 and a small gain), which keeps the props in the same ballpark as the photographed colours.
 */
export function lin(hex: number): number {
  const c = new THREE.Color(hex);
  const f = (v: number) => Math.min(1, Math.pow(v, 1.7) * 1.15);
  c.setRGB(f(c.r), f(c.g), f(c.b));
  return c.getHex();
}
export function lstd(
  k: Kit,
  color: number,
  rough = 0.8,
  metal = 0,
  params?: THREE.MeshStandardMaterialParameters
): THREE.MeshStandardMaterial {
  if (params) {
    return new THREE.MeshStandardMaterial({ color: lin(color), roughness: rough, metalness: metal, ...params });
  }
  let m = ownMats.get(k);
  if (!m) {
    m = new Map();
    ownMats.set(k, m);
  }
  const key = `${color}|${rough}|${metal}`;
  let mat = m.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ color: lin(color), roughness: rough, metalness: metal });
    m.set(key, mat);
  }
  return mat;
}

/* ---------------------------------------------------------------- */
/* Merge bag with vertex colours                                     */
/* ---------------------------------------------------------------- */

export interface PartOpts extends Xf {
  /** Multiplies the vertex colour (default white). */
  color?: number;
  /** Baked ambient occlusion / gradient evaluated per vertex in the bag's space. */
  ao?: (p: THREE.Vector3) => number;
  /** Same, evaluated on the source geometry before the part transform (local AO of a rotated cushion). */
  aoLocal?: (p: THREE.Vector3) => number;
}

/** Collects parts per material (position / normal / uv / colour) and merges them: one draw call per material. */
export class Bag {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private o3 = new THREE.Object3D();
  private v = new THREE.Vector3();
  private c = new THREE.Color();
  private up = new THREE.Vector3(0, 1, 0);
  private q = new THREE.Quaternion();

  add(mat: THREE.Material, geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, o: PartOpts = {}): this {
    const t = this.o3;
    t.position.set(x, y, z);
    t.quaternion.identity();
    t.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
    t.scale.set(o.sx === undefined ? 1 : o.sx, o.sy === undefined ? 1 : o.sy, o.sz === undefined ? 1 : o.sz);
    t.updateMatrix();
    return this.push(mat, geo, t.matrix, o);
  }

  /** Rod between two points. */
  rod(mat: THREE.Material, a: THREE.Vector3Tuple, b: THREE.Vector3Tuple, r: number, seg = 6, o: PartOpts = {}): this {
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = dir.length();
    if (len < 1e-5) {
      return this;
    }
    dir.divideScalar(len);
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
    this.q.setFromUnitVectors(this.up, dir);
    const t = this.o3;
    t.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    t.quaternion.copy(this.q);
    t.scale.set(1, 1, 1);
    t.updateMatrix();
    this.push(mat, g, t.matrix, o);
    t.quaternion.identity();
    g.dispose();
    return this;
  }

  /** Tube along a curve. */
  tube(mat: THREE.Material, curve: THREE.Curve<THREE.Vector3>, r: number, segs = 24, radial = 5, o: PartOpts = {}): this {
    const g = new THREE.TubeGeometry(curve, segs, r, radial, false);
    this.push(mat, g, new THREE.Matrix4(), o);
    g.dispose();
    return this;
  }

  /** Adds an already built geometry with a world matrix. */
  push(mat: THREE.Material, geo: THREE.BufferGeometry, m: THREE.Matrix4, o: PartOpts = {}): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.normal) {
      g.computeVertexNormals();
    }
    const n = g.attributes.position.count;
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    let local: Float32Array | null = null;
    if (o.aoLocal) {
      local = new Float32Array(n);
      const p0 = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < n; i++) {
        local[i] = o.aoLocal(this.v.fromBufferAttribute(p0, i));
      }
    }
    g.applyMatrix4(m);
    const col = new Float32Array(n * 3);
    this.c.set(o.color === undefined ? 0xffffff : o.color);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      let s = local ? local[i] : 1;
      if (o.ao) {
        s *= o.ao(this.v.fromBufferAttribute(pos, i));
      }
      col[i * 3] = this.c.r * s;
      col[i * 3 + 1] = this.c.g * s;
      col[i * 3 + 2] = this.c.b * s;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (const k of Object.keys(g.attributes)) {
      if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') {
        g.deleteAttribute(k);
      }
    }
    g.clearGroups();
    let list = this.parts.get(mat);
    if (!list) {
      list = [];
      this.parts.set(mat, list);
    }
    list.push(g);
    return this;
  }

  flush(parent: THREE.Object3D, o: { cast?: boolean; receive?: boolean; name?: string } = {}): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    this.parts.forEach((list, mat) => {
      const merged = mergeAttrs(list);
      (mat as THREE.MeshStandardMaterial).vertexColors = true;
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

function mergeAttrs(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
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
    pos.set((g.attributes.position as THREE.BufferAttribute).array as ArrayLike<number>, o * 3);
    nor.set((g.attributes.normal as THREE.BufferAttribute).array as ArrayLike<number>, o * 3);
    uv.set((g.attributes.uv as THREE.BufferAttribute).array as ArrayLike<number>, o * 2);
    col.set((g.attributes.color as THREE.BufferAttribute).array as ArrayLike<number>, o * 3);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

/* ---------------------------------------------------------------- */
/* Geometry                                                          */
/* ---------------------------------------------------------------- */

export interface SoftOpts {
  /** Grid resolution per axis (even). */
  seg?: number;
  /** Top surface sags in the middle by this much (meters). */
  sag?: number;
  /** Both big faces bulge outward by this much (pillow crown). */
  bulge?: number;
  /** Corners are pulled in by this fraction (pinched pillow corners). */
  pinch?: number;
  /** Curves the box around Y (backrest wrap). */
  bend?: number;
  /** Texture units per meter for the planar UVs. */
  uv?: number;
}

/**
 * Rounded box with analytic smooth normals and optional sag / crown / pinch / bend.
 * Grid lines cluster in the corner region so even a 1 cm radius stays round.
 */
export function softBoxGeo(w: number, h: number, d: number, r: number, o: SoftOpts = {}): THREE.BufferGeometry {
  const n = o.seg ?? 10;
  const g = new THREE.BoxGeometry(2, 2, 2, n, n, n);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const rr = Math.max(0.002, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
  const hx = w / 2 - rr;
  const hy = h / 2 - rr;
  const hz = d / 2 - rr;
  const A = 0.5;
  const remap = (c: number, hh: number) => {
    const m = Math.abs(c);
    return Math.sign(c) * (m <= A ? (m / A) * hh : hh + ((m - A) / (1 - A)) * rr);
  };
  const uvs = o.uv ?? 10;
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const nn = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const fx = Math.abs(nor.getX(i));
    const fy = Math.abs(nor.getY(i));
    p.set(remap(pos.getX(i), hx), remap(pos.getY(i), hy), remap(pos.getZ(i), hz));
    q.set(Math.max(-hx, Math.min(hx, p.x)), Math.max(-hy, Math.min(hy, p.y)), Math.max(-hz, Math.min(hz, p.z)));
    dir.subVectors(p, q);
    const len = dir.length();
    if (len > 1e-6) {
      nn.copy(dir).divideScalar(len);
      p.copy(q).addScaledVector(nn, rr);
    } else {
      nn.set(nor.getX(i), nor.getY(i), nor.getZ(i));
    }
    const u = p.x / (w / 2);
    const t = p.z / (d / 2);
    if (o.pinch) {
      const f = 1 - o.pinch * u * u * t * t;
      p.x *= f;
      p.z *= f;
    }
    const prof = (1 - u * u) * (1 - t * t);
    if (o.bulge) {
      const sg = p.y >= 0 ? 1 : -1;
      p.y += sg * o.bulge * prof;
      nn.x -= ((sg * o.bulge * -2 * u * (1 - t * t)) / (w / 2)) * nn.y;
      nn.z -= ((sg * o.bulge * -2 * t * (1 - u * u)) / (d / 2)) * nn.y;
    }
    if (o.sag && p.y > 0) {
      p.y -= o.sag * prof;
      nn.x -= (o.sag * 2 * u * (1 - t * t) / (w / 2)) * nn.y;
      nn.z -= (o.sag * 2 * t * (1 - u * u) / (d / 2)) * nn.y;
    }
    if (o.bend) {
      const bx = u * u;
      p.z += o.bend * bx;
      nn.x -= ((o.bend * 2 * u) / (w / 2)) * nn.z;
    }
    nn.normalize();
    pos.setXYZ(i, p.x, p.y, p.z);
    nor.setXYZ(i, nn.x, nn.y, nn.z);
    // planar UVs, projected along the face axis of the original box
    if (fx > 0.5) {
      uv.setXY(i, p.z * uvs, p.y * uvs);
    } else if (fy > 0.5) {
      uv.setXY(i, p.x * uvs, p.z * uvs);
    } else {
      uv.setXY(i, p.x * uvs, p.y * uvs);
    }
  }
  g.computeBoundingSphere();
  return g;
}

/** Cushion: puffy soft box, optionally pinched at the corners. Thin axis is Y. */
export function pillowGeo(w: number, d: number, thick: number, pinch = 0.1, seg = 12): THREE.BufferGeometry {
  return softBoxGeo(w, thick, d, thick * 0.42, { seg, bulge: thick * 0.32, pinch, uv: 8 });
}

/**
 * Smooths an ExtrudeGeometry: bevel / side faces get smooth welded normals while the flat caps keep
 * crisp (0,0,±1) normals. Also keeps the cap UVs (meters) as generated.
 */
export function smoothExtrude(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src.clone();
  const pos = g.attributes.position as THREE.BufferAttribute;
  g.computeBoundingBox();
  const zMin = (g.boundingBox as THREE.Box3).min.z;
  const zMax = (g.boundingBox as THREE.Box3).max.z;
  const eps = 1e-5;
  const n = pos.count;
  const acc = new Map<string, THREE.Vector3>();
  const key = (i: number) =>
    `${Math.round(pos.getX(i) * 20000)},${Math.round(pos.getY(i) * 20000)},${Math.round(pos.getZ(i) * 20000)}`;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const isCap: boolean[] = [];
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    const capTop = Math.abs(a.z - zMax) < eps && Math.abs(b.z - zMax) < eps && Math.abs(c.z - zMax) < eps;
    const capBot = Math.abs(a.z - zMin) < eps && Math.abs(b.z - zMin) < eps && Math.abs(c.z - zMin) < eps;
    const cap = capTop || capBot;
    isCap.push(cap);
    if (cap) {
      continue;
    }
    e1.subVectors(b, a);
    e2.subVectors(c, a);
    const fn = e1.cross(e2);
    for (let k = 0; k < 3; k++) {
      const kk = key(i + k);
      let v = acc.get(kk);
      if (!v) {
        v = new THREE.Vector3();
        acc.set(kk, v);
      }
      v.add(fn);
    }
  }
  const nor = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    for (let k = 0; k < 3; k++) {
      const j = i + k;
      if (isCap[i / 3]) {
        const top = Math.abs(pos.getZ(j) - zMax) < eps;
        nor[j * 3 + 2] = top ? 1 : -1;
      } else {
        const v = acc.get(key(j)) as THREE.Vector3;
        const l = v.length() || 1;
        nor[j * 3] = v.x / l;
        nor[j * 3 + 1] = v.y / l;
        nor[j * 3 + 2] = v.z / l;
      }
    }
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.clearGroups();
  return g;
}

/** Outline from a closed Catmull-Rom through 2D points (any winding). */
export function outlineShape(points: Array<[number, number]>, samples = 120): THREE.Shape {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], 0)), true, 'centripetal');
  const pts = curve.getPoints(samples).map((p) => new THREE.Vector2(p.x, p.y));
  const s = new THREE.Shape(pts);
  return s;
}

/** Rounded rectangle polyline (for stitching / piping loops) in a plane; returns 3D points. */
export function roundRectLoop(
  w: number,
  d: number,
  r: number,
  map: (u: number, v: number) => THREE.Vector3,
  perCorner = 4
): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const corners: Array<[number, number, number]> = [
    [w / 2 - r, d / 2 - r, 0],
    [-(w / 2 - r), d / 2 - r, Math.PI / 2],
    [-(w / 2 - r), -(d / 2 - r), Math.PI],
    [w / 2 - r, -(d / 2 - r), Math.PI * 1.5],
  ];
  for (const cn of corners) {
    for (let i = 0; i <= perCorner; i++) {
      const a = cn[2] + (i / perCorner) * (Math.PI / 2);
      pts.push(map(cn[0] + Math.cos(a) * r, cn[1] + Math.sin(a) * r));
    }
  }
  return pts;
}

export function loopCurve(pts: THREE.Vector3[]): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.2);
}

/** Tapered tube: radius goes from r0 (start) to r1 (end). */
export function taperedTube(
  curve: THREE.Curve<THREE.Vector3>,
  r0: number,
  r1: number,
  segs = 14,
  radial = 6
): THREE.BufferGeometry {
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const ring = radial + 1;
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, c);
    const r = r0 + (r1 - r0) * (i / segs);
    for (let j = 0; j < ring; j++) {
      const idx = i * ring + j;
      v.fromBufferAttribute(pos, idx);
      v.sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  return g;
}

/* ---------------------------------------------------------------- */
/* Textures                                                          */
/* ---------------------------------------------------------------- */

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d') as CanvasRenderingContext2D];
}

export function canvasTex(
  k: Kit,
  c: HTMLCanvasElement,
  o: { srgb?: boolean; repeat?: boolean; x?: number; y?: number } = {}
): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (o.srgb) {
    t.encoding = THREE.sRGBEncoding;
  }
  t.anisotropy = Math.min(k.aniso, 8);
  if (o.repeat !== false) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  if (o.x || o.y) {
    t.repeat.set(o.x || 1, o.y || 1);
  }
  return k.tex(t);
}

/** Height (red channel) canvas -> tangent-space normal map canvas (wrapping). */
export function heightToNormal(src: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const d = (src.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, w, h).data;
  const [c, ctx] = makeCanvas(w, h);
  const out = ctx.createImageData(w, h);
  const H = (x: number, y: number) => d[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * w + x) * 4;
      out.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

const fabricCache = new WeakMap<Kit, THREE.CanvasTexture>();

/** Plain-weave normal map (wrapping, 128 px = 32 threads). */
export function fabricNormalMap(k: Kit): THREE.CanvasTexture {
  const cached = fabricCache.get(k);
  if (cached) {
    return cached;
  }
  const S = 128;
  const [hc, hx] = makeCanvas(S, S);
  const img = hx.createImageData(S, S);
  const rand = rng(77);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const cx = x % 4;
      const cy = y % 4;
      const odd = ((x >> 2) + (y >> 2)) & 1;
      const hgt = odd ? Math.sin(((cx + 0.5) / 4) * Math.PI) : Math.sin(((cy + 0.5) / 4) * Math.PI) * 0.85;
      const v = Math.max(0, Math.min(1, 0.25 + hgt * 0.55 + (rand() - 0.5) * 0.12));
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255;
      img.data[i + 3] = 255;
    }
  }
  hx.putImageData(img, 0, 0);
  const t = canvasTex(k, heightToNormal(hc, 2.2));
  fabricCache.set(k, t);
  return t;
}

export interface WoodMaps {
  map: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
}

/** Wood grain colour + normal maps. `vertical` runs the grain along V. Seamless in the grain direction. */
export function makeWood(
  k: Kit,
  seed: number,
  base: string,
  dark: string,
  o: { w?: number; h?: number; grain?: number; vertical?: boolean; knots?: number; planks?: number } = {}
): WoodMaps {
  const W = o.w ?? 512;
  const H = o.h ?? 512;
  const rand = rng(seed);
  const [c, ctx] = makeCanvas(W, H);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  const [hc, hx] = makeCanvas(W, H);
  hx.fillStyle = '#808080';
  hx.fillRect(0, 0, W, H);
  const grain = o.grain ?? 220;
  for (let i = 0; i < grain; i++) {
    const pos = rand() * H;
    const lw = 0.6 + rand() * 2.2;
    const a = 0.05 + rand() * 0.22;
    const freq = Math.round(1 + rand() * 3);
    const amp = 1 + rand() * 4;
    const ph = rand() * 6.28;
    const useDark = rand() < 0.7;
    ctx.strokeStyle = useDark ? dark : '#ffffff';
    ctx.globalAlpha = useDark ? a : a * 0.35;
    ctx.lineWidth = lw;
    hx.strokeStyle = useDark ? '#202020' : '#e0e0e0';
    hx.globalAlpha = a * 1.4;
    hx.lineWidth = lw;
    for (const cv of [ctx, hx]) {
      cv.beginPath();
      for (let x = 0; x <= W; x += 16) {
        const y = pos + Math.sin((x / W) * Math.PI * 2 * freq + ph) * amp;
        if (x === 0) {
          cv.moveTo(x, y);
        } else {
          cv.lineTo(x, y);
        }
      }
      cv.stroke();
    }
  }
  ctx.globalAlpha = 1;
  hx.globalAlpha = 1;
  for (let i = 0; i < (o.knots ?? 0); i++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = 6 + rand() * 14;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, dark);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 2.2, r, 0, 0, 6.28);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const planks = o.planks ?? 0;
  for (let i = 0; i < planks; i++) {
    const y = (i / planks) * H;
    ctx.fillStyle = 'rgba(15,10,6,0.65)';
    ctx.fillRect(0, y - 1, W, 2.5);
    hx.fillStyle = '#101010';
    hx.fillRect(0, y - 1, W, 2.5);
    // per-plank brightness variation
    ctx.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.1)';
    ctx.fillRect(0, y, W, H / planks);
  }
  let colorCanvas = c;
  let heightCanvas = hc;
  if (o.vertical) {
    // rotate 90 degrees so the grain runs along V
    const [rc, rx] = makeCanvas(H, W);
    rx.translate(H, 0);
    rx.rotate(Math.PI / 2);
    rx.drawImage(c, 0, 0);
    colorCanvas = rc;
    const [rh, rhx] = makeCanvas(H, W);
    rhx.translate(H, 0);
    rhx.rotate(Math.PI / 2);
    rhx.drawImage(hc, 0, 0);
    heightCanvas = rh;
  }
  return {
    map: canvasTex(k, colorCanvas, { srgb: true }),
    normal: canvasTex(k, heightToNormal(heightCanvas, 2.4)),
  };
}

/* ---------------------------------------------------------------- */
/* Contact shadows                                                   */
/* ---------------------------------------------------------------- */

const blobTexCache = new WeakMap<Kit, THREE.CanvasTexture>();
const blobMatCache = new WeakMap<Kit, Map<number, THREE.MeshBasicMaterial>>();

function blobMaterial(k: Kit, opacity: number): THREE.MeshBasicMaterial {
  let tex = blobTexCache.get(k);
  if (!tex) {
    const [c, ctx] = makeCanvas(128, 128);
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    tex = k.tex(new THREE.CanvasTexture(c));
    blobTexCache.set(k, tex);
  }
  let mats = blobMatCache.get(k);
  if (!mats) {
    mats = new Map();
    blobMatCache.set(k, mats);
  }
  const key = Math.round(opacity * 100);
  let mat = mats.get(key);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      map: tex,
      color: 0x000000,
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    mats.set(key, mat);
  }
  return mat;
}

/** Soft dark contact shadow lying on the floor (group-local x / z, y = floor). */
export function contactBlob(
  k: Kit,
  parent: THREE.Object3D,
  x: number,
  z: number,
  w: number,
  d: number,
  opacity = 0.5,
  rotY = 0
): THREE.Mesh {
  const m = new THREE.Mesh(
    k.geo('lv-blob', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
    blobMaterial(k, opacity)
  );
  m.position.set(x, 0.009, z);
  m.scale.set(w, 1, d);
  m.rotation.y = rotY;
  m.renderOrder = 2;
  parent.add(m);
  return m;
}

/** Soft ambient-occlusion halo on a wall (plane faces +Z of the parent). */
export function wallBlob(k: Kit, parent: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, opacity = 0.4): THREE.Mesh {
  const m = new THREE.Mesh(k.plane(1, 1), blobMaterial(k, opacity));
  m.position.set(x, y, z);
  m.scale.set(w, h, 1);
  m.renderOrder = 2;
  parent.add(m);
  return m;
}

/** Smoothstep helper for baked AO gradients. */
export function sstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
