import * as THREE from 'three';

/**
 * Helpers for the exterior garden seen through the bay window: noise, linear palette colours, soft blobby geometry
 * with baked shading in vertex colours, a merge bucket for hard surfaces and the shared haze / wind shader patch.
 */

export const lin = (hex: number): THREE.Color => new THREE.Color(hex).convertSRGBToLinear();
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const sstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const hash2 = (x: number, y: number, s: number) => {
  const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return h - Math.floor(h);
};

/** Smooth value noise in [0, 1]. */
export function vnoise(x: number, y: number, s = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s);
  const b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s);
  const d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Colour of the haze every far layer fades into (= the sky at the horizon). */
export const HAZE_HEX = 0xe2edf3;

export interface GardenUniforms {
  uTime: { value: number };
  uWind: { value: number };
  uBright: { value: number };
  uHazeK: { value: number };
  uHazeCol: { value: THREE.Color };
}

export const makeUniforms = (): GardenUniforms => ({
  uTime: { value: 0 },
  uWind: { value: 1 },
  uBright: { value: 1 },
  uHazeK: { value: 0.024 },
  uHazeCol: { value: lin(HAZE_HEX) },
});

const WIND_GLSL = /* glsl */ `
#ifdef USE_INSTANCING
  vec2 gWp = instanceMatrix[3].xz;
#else
  vec2 gWp = modelMatrix[3].xz;
#endif
  float gPh = uTime * 1.25 + gWp.x * 0.55 + gWp.y * 0.35;
  float gH = clamp(position.y * 0.5 + 0.5, 0.0, 1.0);
  transformed.x += (sin(gPh + position.y * 1.7) * 0.05 + sin(gPh * 2.3 + position.x * 3.0) * 0.014) * uWind * gH;
  transformed.z += cos(gPh * 0.83 + position.x * 1.3) * 0.032 * uWind * gH;
`;

const HAZE_VERT = /* glsl */ `
#ifdef USE_INSTANCING
  vec4 gW = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
#else
  vec4 gW = modelMatrix * vec4(transformed, 1.0);
#endif
  vHz = max(0.0, -gW.z - 4.7);
`;

const HAZE_FRAG = /* glsl */ `
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeCol, 1.0 - exp(-uHazeK * vHz));
  gl_FragColor.rgb *= uBright;
`;

/**
 * Unlit material shared by the garden layers: exponential haze towards the sky colour (measured from the window, so
 * it does not depend on where the camera stands and is not the room's fog), optional wind sway and a brightness
 * uniform driven by the room.
 */
export function gardenMaterial(
  params: THREE.MeshBasicMaterialParameters,
  u: GardenUniforms,
  o: { wind?: boolean; haze?: boolean } = {}
): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ toneMapped: false, fog: false, ...params });
  const wind = !!o.wind;
  const haze = o.haze !== false;
  m.onBeforeCompile = (sh) => {
    sh.uniforms['uTime'] = u.uTime;
    sh.uniforms['uWind'] = u.uWind;
    sh.uniforms['uBright'] = u.uBright;
    sh.uniforms['uHazeK'] = u.uHazeK;
    sh.uniforms['uHazeCol'] = u.uHazeCol;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;\nvarying float vHz;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + (wind ? WIND_GLSL : ''))
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + HAZE_VERT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uHazeCol;\nuniform float uHazeK;\nuniform float uBright;\nvarying float vHz;')
      .replace(
        '#include <tonemapping_fragment>',
        (haze ? HAZE_FRAG : 'gl_FragColor.rgb *= uBright;') + '\n#include <tonemapping_fragment>'
      );
  };
  m.customProgramCacheKey = () => `garden${wind ? 'W' : ''}${haze ? 'H' : ''}`;
  return m;
}

/* ------------------------------------------------------------------ */
/* Baked soft lighting                                                  */
/* ------------------------------------------------------------------ */

const LDIR = new THREE.Vector3(-0.5, 0.8, 0.55).normalize();

/** Cool shadow -> warm light multiplier for a surface normal (fake daylight + sky fill, no real lights). */
export function shade(nx: number, ny: number, nz: number, out: number[]): number[] {
  const lit = Math.max(0, nx * LDIR.x + ny * LDIR.y + nz * LDIR.z);
  const s = 0.56 + 0.22 * (0.5 + 0.5 * ny) + 0.32 * lit;
  out[0] = s * (0.88 + 0.16 * lit);
  out[1] = s * (0.96 + 0.06 * lit);
  out[2] = s * (1.03 - 0.1 * lit);
  return out;
}

const tmp3 = [0, 0, 0];

/** Icosphere pushed towards a rounded cube (`exp` < 1) and lumped with noise; shaded per vertex. Unit radius. */
export function blobGeo(detail: number, o: { noise: number; exp: number; seed: number; flatBase?: boolean }): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes['position'] as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  const sg = (a: number) => (a < 0 ? -1 : 1);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let x = sg(v.x) * Math.pow(Math.abs(v.x), o.exp);
    let y = sg(v.y) * Math.pow(Math.abs(v.y), o.exp);
    let z = sg(v.z) * Math.pow(Math.abs(v.z), o.exp);
    const r =
      1 +
      o.noise *
        (vnoise(v.x * 1.9 + v.z * 0.7 + o.seed, v.y * 1.9 - v.z * 1.3, o.seed) * 0.65 +
          vnoise(v.x * 4.1 - v.y * 1.1, v.z * 4.1 + v.y * 2.3, o.seed + 3) * 0.35 -
          0.5) *
        2;
    x *= r;
    y *= r;
    z *= r;
    if (o.flatBase && y < -0.5) {
      y = -0.5 + (y + 0.5) * 0.25;
    }
    p.setXYZ(i, x, y, z);
    const l = Math.hypot(x, y, z) || 1;
    const nx = x / l;
    const ny = y / l;
    const nz = z / l;
    shade(nx, ny, nz, tmp3);
    // soft occlusion towards the underside
    const ao = 0.72 + 0.28 * sstep(-0.95, 0.2, ny);
    col[i * 3] = tmp3[0] * ao;
    col[i * 3 + 1] = tmp3[1] * ao;
    col[i * 3 + 2] = tmp3[2] * ao;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g.computeBoundingSphere();
  return g;
}

/** Soft tiered cone (clipped topiary / conifer), y in [-1, 1], base radius ~1. */
export function coneGeo(tiers: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0.001, -1)];
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = 0.98 * Math.pow(1 - t, 0.82) * (1 + 0.075 * Math.sin(t * Math.PI * 2 * tiers - 0.6)) + 0.001;
    pts.push(new THREE.Vector2(r, -1 + 2 * t));
  }
  const g = new THREE.LatheGeometry(pts, 14);
  const nor = g.attributes['normal'] as THREE.BufferAttribute;
  const pos = g.attributes['position'] as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    shade(nor.getX(i), nor.getY(i), nor.getZ(i), tmp3);
    const ao = 0.76 + 0.24 * sstep(-1, 0.1, pos.getY(i));
    col[i * 3] = tmp3[0] * ao;
    col[i * 3 + 1] = tmp3[1] * ao;
    col[i * 3 + 2] = tmp3[2] * ao;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g.computeBoundingSphere();
  return g;
}

/** Bucket that bakes many hard-surface parts (walls, pots, branches...) into one vertex-coloured geometry. */
export class Bake {
  private pos: number[] = [];
  private col: number[] = [];
  private o = new THREE.Object3D();
  private nm = new THREE.Matrix3();
  private v = new THREE.Vector3();
  private n = new THREE.Vector3();
  private s = [0, 0, 0];
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);
  private dir = new THREE.Vector3();

  add(
    geo: THREE.BufferGeometry,
    color: THREE.Color,
    x: number,
    y: number,
    z: number,
    xf: { rx?: number; ry?: number; rz?: number; sx?: number; sy?: number; sz?: number } = {},
    ao = 0.2
  ): this {
    const o = this.o;
    o.position.set(x, y, z);
    o.quaternion.identity();
    o.rotation.set(xf.rx || 0, xf.ry || 0, xf.rz || 0);
    o.scale.set(xf.sx === undefined ? 1 : xf.sx, xf.sy === undefined ? 1 : xf.sy, xf.sz === undefined ? 1 : xf.sz);
    o.updateMatrix();
    return this.addMatrix(geo, color, o.matrix, ao);
  }

  /** Tapered rod between two points. */
  rod(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r0: number, r1: number, color: THREE.Color, seg = 6): this {
    this.dir.set(bx - ax, by - ay, bz - az);
    const len = this.dir.length();
    if (len < 1e-4) {
      return this;
    }
    this.dir.divideScalar(len);
    this.q.setFromUnitVectors(this.up, this.dir);
    const o = this.o;
    o.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    o.quaternion.copy(this.q);
    o.scale.set(1, 1, 1);
    o.updateMatrix();
    const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, true);
    this.addMatrix(g, color, o.matrix, 0);
    g.dispose();
    return this;
  }

  private addMatrix(geo: THREE.BufferGeometry, color: THREE.Color, m: THREE.Matrix4, ao: number): this {
    const p = geo.attributes['position'] as THREE.BufferAttribute;
    const nor = geo.attributes['normal'] as THREE.BufferAttribute;
    if (!geo.boundingBox) {
      geo.computeBoundingBox();
    }
    const y0 = (geo.boundingBox as THREE.Box3).min.y;
    const hh = Math.max(0.05, (geo.boundingBox as THREE.Box3).max.y - y0);
    this.nm.getNormalMatrix(m);
    const idx = geo.index;
    const count = idx ? idx.count : p.count;
    for (let i = 0; i < count; i++) {
      const vi = idx ? idx.getX(i) : i;
      this.v.fromBufferAttribute(p, vi).applyMatrix4(m);
      this.n.fromBufferAttribute(nor, vi).applyMatrix3(this.nm).normalize();
      shade(this.n.x, this.n.y, this.n.z, this.s);
      const a = 1 - ao + ao * sstep(0, 0.7, (p.getY(vi) - y0) / hh + 0.1);
      this.pos.push(this.v.x, this.v.y, this.v.z);
      this.col.push(color.r * this.s[0] * a, color.g * this.s[1] * a, color.b * this.s[2] * a);
    }
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

export interface Inst {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  ry?: number;
  c: THREE.Color;
}

const D = new THREE.Object3D();

/** Fill an InstancedMesh from a list (matrices + colours). */
export function fillInstances(mesh: THREE.InstancedMesh, list: Inst[]): void {
  list.forEach((s, i) => {
    D.position.set(s.x, s.y, s.z);
    D.rotation.set(0, s.ry || 0, 0);
    D.scale.set(s.sx, s.sy, s.sz);
    D.updateMatrix();
    mesh.setMatrixAt(i, D.matrix);
    mesh.setColorAt(i, s.c);
  });
  mesh.count = list.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }
  mesh.frustumCulled = false;
}
