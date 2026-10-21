import * as THREE from 'three';
import { Kit, frustumGeo } from './kit';
import { Bake, V3 } from './set-geo';
import { makeFabricWeave, makeHoneycomb, makeLcd, makeLogoDecal } from './set-tex';

/**
 * Studio lighting gear built from merged, vertex-coloured parts: light stands with 3 telescopic
 * sections + castor wheels, Godox-style monolights, strip softboxes (+ honeycomb grid), octabox,
 * beauty dish, cone spot, cables and a power strip.
 */

export interface GearTex {
  diffuser: THREE.Texture;
  diffuserGrid: THREE.Texture;
}

const DARK = 0x16181b;
const GREY = 0x2c2f34;
const CHROME = 0xd5d9df;

/** Local -> world placement: yaw around Y, pitch around X (positive pitch aims the +Z axis downward). */
export function place(x: number, y: number, z: number, yaw: number, pitch = 0): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
}

export class Gear {
  readonly dark = new Bake();
  readonly chrome = new Bake();
  readonly rubber = new Bake();
  readonly plastic = new Bake();
  readonly fabric = new Bake();
  readonly silver = new Bake();
  readonly decal = new Bake();
  readonly lcd = new Bake();
  readonly dome = new Bake();
  readonly faceStrip = new Bake();
  readonly faceGrid = new Bake();
  readonly faceOcta = new Bake();
  readonly grid = new Bake();

  private mats: Record<string, THREE.Material> = {};

  constructor(private k: Kit, private tx: GearTex, readonly hi: boolean) {
    const weave = k.tex(makeFabricWeave());
    weave.repeat.set(7, 7);
    const honey = k.tex(makeHoneycomb(0.36, 1.25, 0.016));
    const logo = k.tex(makeLogoDecal());
    const lcd = k.tex(makeLcd());
    const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ vertexColors: true, ...p });
    const M = this.mats;
    M['dark'] = std({ roughness: 0.42, metalness: 0.4 });
    M['chrome'] = std({ roughness: 0.2, metalness: 0.9 });
    M['rubber'] = std({ roughness: 0.82, metalness: 0 });
    M['plastic'] = hi
      ? new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.1, clearcoat: 0.35, clearcoatRoughness: 0.4 })
      : std({ roughness: 0.55, metalness: 0.1 });
    M['fabric'] = hi
      ? new THREE.MeshPhysicalMaterial({ vertexColors: true, map: weave, roughness: 0.88, sheen: 0.8, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x777b82), side: THREE.DoubleSide })
      : std({ map: weave, roughness: 0.9, side: THREE.DoubleSide });
    M['silver'] = std({ roughness: 0.32, metalness: 0.45, side: THREE.DoubleSide, emissive: new THREE.Color(0x24272b) });
    M['decal'] = new THREE.MeshStandardMaterial({ map: logo, transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    M['lcd'] = k.glow(0xffffff, 1.1, { map: lcd });
    M['dome'] = k.glow(0xfff4e6, 1.5);
    M['faceStrip'] = k.glow(0xffffff, 1.25, { map: tx.diffuser });
    M['faceGrid'] = k.glow(0xffffff, 1.25, { map: tx.diffuserGrid });
    M['faceOcta'] = k.glow(0xffffff, 1.25, { map: tx.diffuser });
    M['grid'] = new THREE.MeshBasicMaterial({ map: honey, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  }

  /** Light stand: 3 telescopic sections, locking collars + knobs, splayed legs with braces, optional castors. */
  stand(x: number, z: number, h: number, o: { spread?: number; rot?: number; wheels?: boolean; heavy?: boolean } = {}): void {
    const spread = o.spread || 0.5;
    const rot = o.rot || 0;
    const r1 = o.heavy ? 0.0185 : 0.0165;
    const seg = this.hi ? 12 : 8;
    const D = this.dark;
    const C = this.chrome;
    // telescopic sections
    const y1 = 0.62 * h;
    const y2 = 0.84 * h;
    D.rod(x, 0.28, z, x, y1, z, r1, r1, DARK, seg);
    D.rod(x, y1 - 0.05, z, x, y2, z, r1 * 0.82, r1 * 0.82, GREY, seg);
    D.rod(x, y2 - 0.05, z, x, h, z, r1 * 0.64, r1 * 0.64, DARK, seg);
    C.rod(x, h - 0.002, z, x, h + 0.05, z, 0.0075, 0.0075, CHROME, 8);
    C.cyl(0.0085, 0.012, CHROME, x, h + 0.052, z, {}, 8);
    // collars and knobs
    for (const [cy, cr, a] of [[y1, r1, rot + 0.7], [y2, r1 * 0.82, rot + 2.2]] as Array<[number, number, number]>) {
      D.cyl(cr + 0.005, 0.055, 0x0a0b0c, x, cy, z, {}, seg);
      C.cyl(cr + 0.0065, 0.008, CHROME, x, cy + 0.03, z, {}, seg);
      const kx = x + Math.cos(a) * (cr + 0.006);
      const kz = z + Math.sin(a) * (cr + 0.006);
      D.rod(kx, cy, kz, x + Math.cos(a) * (cr + 0.04), cy, z + Math.sin(a) * (cr + 0.04), 0.0055, 0.0055, 0x0a0b0c, 6);
      D.ball(x + Math.cos(a) * (cr + 0.046), cy, z + Math.sin(a) * (cr + 0.046), 0.013, 0x0a0b0c, 0.013, 0.013, {}, 8);
    }
    // base hub and splayed legs
    D.cyl(0.036, 0.1, DARK, x, 0.29, z, {}, seg);
    C.cyl(0.0385, 0.008, CHROME, x, 0.34, z, {}, seg);
    for (let i = 0; i < 3; i++) {
      const t = rot + (i / 3) * Math.PI * 2;
      const c = Math.cos(t);
      const s = Math.sin(t);
      const fx = x + c * spread;
      const fz = z + s * spread;
      D.rod(x + c * 0.03, 0.31, z + s * 0.03, fx, 0.075, fz, 0.0115, 0.0105, DARK, 8);
      D.rod(x, 0.13, z, x + c * spread * 0.55, 0.31 - 0.236 * 0.55, z + s * spread * 0.55, 0.0065, 0.0065, GREY, 6);
      C.cyl(0.011, 0.014, 0x2a2c30, x + c * spread * 0.4, 0.31 - 0.236 * 0.4 - 0.01, z + s * spread * 0.4, {}, 8);
      this.rubber.cyl(0.0125, 0.03, 0x0a0a0a, fx, 0.07, fz, {}, 8);
      if (o.wheels) {
        // castor: fork + tyre with a red hub; axle is tangential so it rolls along the leg
        const ry = -(t + Math.PI / 2);
        D.rod(fx, 0.085, fz, fx, 0.05, fz, 0.0085, 0.0085, 0x0a0b0c, 6);
        D.box(0.05, 0.012, 0.03, GREY, fx, 0.06, fz, { ry: -t });
        this.rubber.cyl(0.03, 0.02, 0x0b0b0b, fx, 0.031, fz, { rz: Math.PI / 2, ry }, this.hi ? 14 : 8);
        this.plastic.cyl(0.0185, 0.024, 0xc4241c, fx, 0.031, fz, { rz: Math.PI / 2, ry }, 10);
      }
    }
  }

  /** Strobe with speed ring, vents, control panel + LCD and a carry handle. Local frame: front at z = 0, body along -z. */
  monolight(base: THREE.Matrix4, o: { body?: number; len?: number; bare?: boolean; barrel?: boolean } = {}): void {
    const len = o.len || 0.25;
    const body = o.body || 0x32353b;
    const P = this.plastic;
    P.base = base;
    this.dark.base = base;
    this.chrome.base = base;
    this.lcd.base = base;
    this.dome.base = base;
    const seg = this.hi ? 28 : 14;
    P.lathe([[0.1, 0], [0.1, 0.05], [0.086, 0.06], [0.085, 0.55], [0.08, 0.93], [0.06, 0.985], [0.0, 1]], V3(0, 0, 0), V3(0, 0, -len), body, seg);
    // speed-ring mount + chrome flange
    this.chrome.lathe([[0.062, 0], [0.066, 0.4], [0.088, 0.6], [0.092, 1]], V3(0, 0, 0.012), V3(0, 0, -0.012), CHROME, seg);
    // flash-tube dome
    const hemi = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    this.dome.geo(hemi, 0xffffff, 0, 0, 0.004, { rx: Math.PI / 2, sx: 0.055, sy: 0.05, sz: 0.055 });
    hemi.dispose();
    P.geo(new THREE.TorusGeometry(0.06, 0.006, 6, 24), 0xe8eaee, 0, 0, 0.006);
    // vents
    for (let i = 0; i < 6; i++) {
      this.dark.box(0.07, 0.004, 0.011, 0x08090a, 0, 0.0845, -0.04 - i * 0.017);
      this.dark.box(0.004, 0.06, 0.011, 0x08090a, 0.0845, 0, -0.045 - i * 0.017);
      this.dark.box(0.004, 0.06, 0.011, 0x08090a, -0.0845, 0, -0.045 - i * 0.017);
    }
    // control panel
    P.box(0.1, 0.012, 0.08, 0x1a1c20, 0, 0.088, -len + 0.095, { rx: 0.1 });
    this.lcd.geo(new THREE.PlaneGeometry(0.055, 0.028), 0xffffff, 0, 0.0955, -len + 0.092, { rx: -Math.PI / 2 + 0.1 });
    for (const kx of [-0.034, 0, 0.034]) {
      this.chrome.cyl(0.0085, 0.011, 0xb6bac0, kx, 0.097, -len + 0.13, { rx: 0.1 }, 10);
    }
    P.ball(0.036, 0.097, -len + 0.078, 0.003, 0xff3a2a, 0.003, 0.003, {}, 6);
    // carry handle
    this.dark.tube([[0, 0.084, -0.04], [0, 0.118, -0.06], [0, 0.118, -0.15], [0, 0.084, -0.17]], 0.0075, 0x101214, 18, 6);
    // rear cap + mains socket
    P.cyl(0.03, 0.02, 0x15171a, 0, 0, -len - 0.008, { rx: Math.PI / 2 }, 12);
    if (o.barrel) {
      // spot head: flared reflector snout with a focusing lens
      this.dark.lathe([[0.075, 0], [0.083, 0.3], [0.096, 0.7], [0.102, 1]], V3(0, 0, 0.0), V3(0, 0, 0.17), 0x131417, seg);
      this.chrome.lathe([[0.1, 0], [0.104, 1]], V3(0, 0, 0.165), V3(0, 0, 0.175), CHROME, seg);
      this.dome.geo(new THREE.CircleGeometry(0.085, 24), 0xcfe4ff, 0, 0, 0.12);
    }
    P.base = null;
    this.dark.base = null;
    this.chrome.base = null;
    this.lcd.base = null;
    this.dome.base = null;
  }

  /** Yoke + pivot post for a head, returns the world position of the stand pin. */
  yoke(base: THREE.Matrix4, side = 0.1, pivotZ = -0.13): THREE.Vector3 {
    const D = this.dark;
    D.base = base;
    D.rod(-side, 0, pivotZ, 0, -0.115, pivotZ, 0.0075, 0.0075, 0x101214, 6);
    D.rod(side, 0, pivotZ, 0, -0.115, pivotZ, 0.0075, 0.0075, 0x101214, 6);
    D.rod(0, -0.115, pivotZ, 0, -0.17, pivotZ, 0.013, 0.013, 0x101214, 8);
    for (const sx of [-1, 1]) {
      D.ball(sx * (side + 0.012), 0, pivotZ, 0.015, 0x0a0b0c, 0.015, 0.015, {}, 8);
      this.chrome.base = base;
      this.chrome.cyl(0.006, 0.01, CHROME, sx * (side + 0.026), 0, pivotZ, { rz: Math.PI / 2 }, 8);
      this.chrome.base = null;
    }
    D.base = null;
    return V3(0, -0.17, pivotZ).applyMatrix4(base);
  }

  /** Strip softbox with optional honeycomb grid. Local frame: speed ring at z = 0, face at z = depth. */
  strip(base: THREE.Matrix4, o: { w: number; h: number; depth: number; grid: boolean }): THREE.Vector3 {
    const { w, h, depth: d } = o;
    const rw = 0.2;
    const F = this.fabric;
    F.base = base;
    this.dark.base = base;
    this.decal.base = base;
    F.geo(frustumGeo(rw, rw, w, h, d), 0xffffff);
    // pole rods along the four edges + front frame
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        this.dark.rod(sx * rw / 2, sy * rw / 2, 0, sx * w / 2, sy * h / 2, d, 0.0065, 0.0065, 0x0e0f11, 6);
      }
    }
    const t = 0.02;
    this.dark.box(w + t, t, 0.035, 0x0e0f11, 0, h / 2, d - 0.004);
    this.dark.box(w + t, t, 0.035, 0x0e0f11, 0, -h / 2, d - 0.004);
    this.dark.box(t, h, 0.035, 0x0e0f11, -w / 2, 0, d - 0.004);
    this.dark.box(t, h, 0.035, 0x0e0f11, w / 2, 0, d - 0.004);
    // speed ring collar
    this.dark.cyl(0.105, 0.03, 0x222428, 0, 0, 0.005, { rx: Math.PI / 2 }, 16);
    this.chrome.base = base;
    this.chrome.cyl(0.092, 0.012, CHROME, 0, 0, -0.012, { rx: Math.PI / 2 }, 16);
    this.chrome.base = null;
    // diffuser face (+ grid with real depth: skirt walls and two honeycomb layers)
    const plane = new THREE.PlaneGeometry(w - 0.012, h - 0.012);
    const face = o.grid ? this.faceGrid : this.faceStrip;
    face.base = base;
    face.geo(plane, 0xffffff, 0, 0, d - 0.006);
    face.base = null;
    if (o.grid) {
      const gd = 0.06;
      F.geo(new THREE.PlaneGeometry(gd, h), 0xffffff, w / 2 - 0.002, 0, d + gd / 2 - 0.004, { ry: Math.PI / 2 });
      F.geo(new THREE.PlaneGeometry(gd, h), 0xffffff, -w / 2 + 0.002, 0, d + gd / 2 - 0.004, { ry: Math.PI / 2 });
      F.geo(new THREE.PlaneGeometry(w, gd), 0xffffff, 0, h / 2 - 0.002, d + gd / 2 - 0.004, { rx: Math.PI / 2 });
      F.geo(new THREE.PlaneGeometry(w, gd), 0xffffff, 0, -h / 2 + 0.002, d + gd / 2 - 0.004, { rx: Math.PI / 2 });
      this.grid.base = base;
      this.grid.geo(new THREE.PlaneGeometry(w - 0.01, h - 0.01), 0xffffff, 0, 0, d + 0.052);
      this.grid.geo(new THREE.PlaneGeometry(w - 0.01, h - 0.01), 0xffffff, 0, 0, d + 0.012);
      this.grid.base = null;
      this.dark.box(w + t, 0.012, 0.012, 0x0e0f11, 0, h / 2, d + 0.056);
      this.dark.box(w + t, 0.012, 0.012, 0x0e0f11, 0, -h / 2, d + 0.056);
      this.dark.box(0.012, h, 0.012, 0x0e0f11, -w / 2, 0, d + 0.056);
      this.dark.box(0.012, h, 0.012, 0x0e0f11, w / 2, 0, d + 0.056);
    }
    // brand wordmark on the +X flank (white, reads bottom-to-top)
    const slope = (w - rw) / 2 / d;
    const ang = Math.PI / 2 + Math.atan(slope);
    const zf = d * 0.52;
    const xf = rw / 2 + ((w - rw) / 2) * (zf / d);
    this.decal.geo(new THREE.PlaneGeometry(0.22, 0.055), 0xffffff, xf + 0.003 * Math.sin(ang), h * 0.08, zf + 0.003 * Math.cos(ang), { rz: Math.PI / 2, ry: ang });
    F.base = null;
    this.dark.base = null;
    this.decal.base = null;
    this.monolight(new THREE.Matrix4().multiplyMatrices(base, new THREE.Matrix4().makeTranslation(0, 0, 0.07)));
    return this.yoke(new THREE.Matrix4().multiplyMatrices(base, new THREE.Matrix4().makeTranslation(0, 0, 0.07)));
  }

  /** 8-sided octabox: tapered shell, 8 rods, octagonal rim, radial seams on the diffuser. */
  octa(base: THREE.Matrix4, o: { r: number; depth: number }): THREE.Vector3 {
    const { r, depth: d } = o;
    const rr = 0.1;
    const F = this.fabric;
    F.base = base;
    this.dark.base = base;
    const shell = new THREE.CylinderGeometry(r, rr, d, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, d / 2);
    F.geo(shell, 0xffffff);
    shell.dispose();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const a2 = ((i + 1) * Math.PI) / 4;
      const fx = r * Math.sin(a);
      const fy = -r * Math.cos(a);
      const fx2 = r * Math.sin(a2);
      const fy2 = -r * Math.cos(a2);
      this.dark.rod(rr * Math.sin(a), -rr * Math.cos(a), 0, fx, fy, d, 0.0065, 0.0065, 0x0e0f11, 6);
      this.dark.rod(fx, fy, d, fx2, fy2, d, 0.0095, 0.0095, 0x0e0f11, 6);
      this.dark.ball(fx, fy, d, 0.0125, 0x0e0f11, 0.0125, 0.0125, {}, 6);
      // faint seams on the diffuser
      this.dark.rod(0.07 * Math.sin(a), -0.07 * Math.cos(a), d - 0.003, fx * 0.97, fy * 0.97, d - 0.003, 0.0022, 0.0022, 0x6b7076, 4);
    }
    this.dark.cyl(0.108, 0.03, 0x222428, 0, 0, 0.005, { rx: Math.PI / 2 }, 16);
    const face = this.faceOcta;
    face.base = base;
    face.geo(new THREE.CircleGeometry(r * 0.985, 8), 0xffffff, 0, 0, d - 0.006);
    face.base = null;
    F.base = null;
    this.dark.base = null;
    const mb = new THREE.Matrix4().multiplyMatrices(base, new THREE.Matrix4().makeTranslation(0, 0, 0.07));
    this.monolight(mb);
    return this.yoke(mb);
  }

  /** Beauty dish hanging below its strobe. Origin = dish centre, facing -Y. */
  dish(base: THREE.Matrix4): void {
    const seg = this.hi ? 40 : 20;
    const tilt = new THREE.Matrix4().multiplyMatrices(base, new THREE.Matrix4().makeRotationX(0));
    this.dark.base = tilt;
    this.silver.base = tilt;
    this.chrome.base = tilt;
    const top = V3(0, 0.072, 0);
    const bot = V3(0, 0, 0);
    const prof: Array<[number, number]> = [[0.001, 0], [0.05, 0.029], [0.12, 0.171], [0.2, 0.486], [0.27, 0.886], [0.285, 1]];
    this.dark.lathe(prof, top, bot, 0x7b8087, seg);
    this.silver.lathe(prof.map((p) => [p[0] * 0.985, p[1]] as [number, number]), V3(0, 0.067, 0), V3(0, -0.003, 0), 0xe9ecf0, seg);
    this.chrome.geo(new THREE.TorusGeometry(0.285, 0.0055, 6, seg), CHROME, 0, 0.0, 0, { rx: Math.PI / 2 });
    // centre reflector plate on spokes
    this.silver.lathe([[0.001, 0], [0.04, 0.35], [0.065, 0.85], [0.066, 1]], V3(0, 0.014, 0), V3(0, 0.0, 0), 0xf2f4f6, 24);
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      this.dark.rod(0.012 * Math.cos(a), 0.06, 0.012 * Math.sin(a), 0.056 * Math.cos(a), 0.014, 0.056 * Math.sin(a), 0.0022, 0.0022, 0x25272b, 4);
    }
    this.dark.cyl(0.056, 0.045, 0x8b9097, 0, 0.088, 0, {}, 20);
    // strobe on top, firing down into the dish
    const mb = new THREE.Matrix4().multiplyMatrices(base, new THREE.Matrix4().compose(V3(0, 0.1, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), V3(1, 1, 1)));
    this.dark.base = null;
    this.silver.base = null;
    this.chrome.base = null;
    this.monolight(mb, { body: 0x24272b, len: 0.26 });
  }

  /** Plain matte-black cylinder weight slid on the rear of a boom arm (dx, dz = horizontal boom direction). */
  counterweight(x: number, y: number, z: number, dx: number, dz: number): void {
    const l = Math.hypot(dx, dz) || 1;
    const ux = (dx / l) * 0.07;
    const uz = (dz / l) * 0.07;
    this.rubber.rod(x - ux, y, z - uz, x + ux, y, z + uz, 0.045, 0.045, 0x17181a, this.hi ? 18 : 10);
    this.dark.rod(x + ux * 1.02, y, z + uz * 1.02, x + ux * 1.3, y, z + uz * 1.3, 0.016, 0.016, 0x0c0d0f, 8);
  }

  cable(pts: Array<[number, number, number]>, r = 0.0055): void {
    this.rubber.tube(pts, r, 0x0a0a0b, Math.max(24, pts.length * 14), 5);
  }

  powerStrip(x: number, z: number, ry: number): void {
    this.plastic.box(0.34, 0.032, 0.07, 0xeceae4, x, 0.016, z, { ry });
    for (let i = -2; i <= 2; i++) {
      const cx = x + Math.cos(ry) * i * 0.062;
      const cz = z - Math.sin(ry) * i * 0.062;
      this.plastic.box(0.04, 0.004, 0.04, 0x1a1a1c, cx, 0.033, cz, { ry });
      this.plastic.ball(cx, 0.036, cz, 0.004, 0x101012, 0.0015, 0.004, {}, 6);
    }
    this.plastic.box(0.02, 0.006, 0.02, 0xc8261f, x + Math.cos(ry) * 0.15, 0.035, z - Math.sin(ry) * 0.15, { ry });
  }

  flush(root: THREE.Object3D): void {
    const m = this.mats;
    this.dark.flush(root, m['dark'], { cast: true, name: 'gearDark' });
    this.chrome.flush(root, m['chrome'], { cast: true, name: 'gearChrome' });
    this.rubber.flush(root, m['rubber'], { cast: false, name: 'gearRubber' });
    this.plastic.flush(root, m['plastic'], { cast: true, name: 'gearPlastic' });
    this.fabric.flush(root, m['fabric'], { cast: true, name: 'gearFabric' });
    this.silver.flush(root, m['silver'], { cast: false, name: 'gearSilver' });
    const dec = this.decal.flush(root, m['decal'], { cast: false, ao: false, name: 'gearDecals' });
    if (dec) {
      dec.renderOrder = 2;
    }
    this.lcd.flush(root, m['lcd'], { cast: false, ao: false, name: 'gearLcd' });
    this.dome.flush(root, m['dome'], { cast: false, ao: false, name: 'gearDomes' });
    this.faceStrip.flush(root, m['faceStrip'], { cast: false, ao: false, name: 'faceStrip' });
    this.faceGrid.flush(root, m['faceGrid'], { cast: false, ao: false, name: 'faceStripGrid' });
    this.faceOcta.flush(root, m['faceOcta'], { cast: false, ao: false, name: 'faceOcta' });
    const gr = this.grid.flush(root, m['grid'], { cast: false, ao: false, name: 'gearHoneycomb' });
    if (gr) {
      gr.renderOrder = 3;
    }
  }
}
