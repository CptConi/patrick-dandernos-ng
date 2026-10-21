import * as THREE from 'three';
import { Kit } from './kit';
import { softBoxGeo, lstd } from './living-util';
import { Place, tint } from './living-desk-util';

/**
 * Small things of the workstation (camera, lamp, headphones, plant, mug...). Every function describes its item in
 * its own frame (origin = where it touches the desk, Y up, front +Z) and bakes it through a Place.
 */

export interface DeskMats {
  black: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  alu: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
  paper: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  lens: THREE.MeshStandardMaterial;
  tint: THREE.MeshStandardMaterial;
  ceramic: THREE.MeshStandardMaterial;
}

export function makeMats(k: Kit): DeskMats {
  return {
    black: lstd(k, 0x111214, 0.4, 0.15),
    rubber: lstd(k, 0x0b0b0c, 0.88, 0),
    alu: lstd(k, 0xa3a7ae, 0.28, 1),
    steel: lstd(k, 0x1a1b1e, 0.42, 0.55),
    white: lstd(k, 0xefece4, 0.5, 0),
    paper: lstd(k, 0xf3f1ea, 0.85, 0),
    brass: lstd(k, 0xb0894a, 0.32, 1),
    lens: lstd(k, 0x1a2430, 0.06, 0.7),
    tint: lstd(k, 0xffffff, 0.62, 0),
    ceramic: lstd(k, 0xffffff, 0.34, 0, { side: THREE.DoubleSide }),
  };
}

const HALF_PI = Math.PI / 2;

function lathe(k: Kit, key: string, pts: Array<[number, number]>, seg = 22): THREE.BufferGeometry {
  return k.geo(key, () => new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg));
}

function soft(k: Kit, w: number, h: number, d: number, r: number, seg = 6): THREE.BufferGeometry {
  return k.geo(`dsoft:${w}:${h}:${d}:${r}`, () => softBoxGeo(w, h, d, r, { seg }));
}

/* ---------------------------------------------------------------- */

/** DSLR with a zoom lens, resting on its base; lens along +Z. `detail` carries the strap. */
export function addCamera(p: Place, d: Place, k: Kit, m: DeskMats): void {
  p.add(m.black, k.rbox(0.15, 0.1, 0.07, 0.012), 0, 0.05, 0);
  p.add(m.rubber, soft(k, 0.052, 0.098, 0.06, 0.016), -0.068, 0.05, 0.007);
  p.add(m.black, k.rbox(0.075, 0.042, 0.06, 0.016), 0, 0.118, -0.004);
  p.add(m.alu, k.box(0.022, 0.006, 0.02), 0, 0.141, -0.004);
  p.add(m.alu, k.cyl(0.014, 0.014, 0.012, 14), 0.05, 0.106, -0.004);
  p.add(m.alu, k.cyl(0.008, 0.008, 0.01, 10), -0.07, 0.107, 0.012);
  p.add(m.rubber, k.rbox(0.03, 0.02, 0.012, 0.004), 0, 0.12, -0.04);
  p.add(m.lens, k.rbox(0.07, 0.048, 0.003, 0.002), 0.012, 0.045, -0.0365);
  p.add(m.alu, k.cyl(0.032, 0.032, 0.01, 20), 0, 0.055, 0.04, { rx: HALF_PI });
  p.add(m.black, k.cyl(0.037, 0.037, 0.07, 22), 0, 0.055, 0.08, { rx: HALF_PI });
  p.add(m.rubber, k.cyl(0.04, 0.04, 0.034, 22), 0, 0.055, 0.094, { rx: HALF_PI });
  p.add(m.black, k.cyl(0.034, 0.037, 0.034, 22), 0, 0.055, 0.14, { rx: HALF_PI });
  p.add(m.alu, k.cyl(0.0345, 0.0345, 0.004, 22), 0, 0.055, 0.159, { rx: HALF_PI });
  p.add(m.lens, k.sphere(0.03, 16, 8), 0, 0.055, 0.153, { sz: 0.18 });
  // strap
  d.tube(
    m.rubber,
    [
      [0.078, 0.085, -0.01],
      [0.12, 0.03, -0.02],
      [0.2, 0.004, -0.06],
      [0.26, 0.004, -0.14],
      [0.18, 0.004, -0.2],
      [0.06, 0.004, -0.16],
      [-0.06, 0.02, -0.12],
      [-0.08, 0.085, -0.01],
    ],
    0.007,
    40,
    5
  );
}

/** Photographer's lamp: weighted base, two arms, brass shade; the glowing parts are added to `glowParent`. */
export function addLamp(p: Place, k: Kit, m: DeskMats, glowParent: THREE.Object3D): THREE.MeshBasicMaterial {
  p.add(m.black, k.cyl(0.062, 0.068, 0.016, 26), 0, 0.008, 0);
  p.add(m.steel, k.cyl(0.02, 0.022, 0.03, 12), 0, 0.03, 0);
  for (const dx of [-0.007, 0.007]) {
    p.rod(m.steel, [dx, 0.04, 0], [0.05 + dx, 0.29, 0.01], 0.0048, 6);
    p.rod(m.steel, [0.05 + dx, 0.29, 0.012], [0.19 + dx, 0.285, 0.075], 0.0048, 6);
  }
  p.add(m.alu, k.sphere(0.0125, 10, 8), 0.05, 0.29, 0.01);
  p.add(m.alu, k.sphere(0.011, 10, 8), 0.19, 0.285, 0.075);
  const head = p.at(0.205, 0.27, 0.085, 0, 0.18, 0.62);
  head.add(m.brass, k.cyl(0.018, 0.058, 0.095, 24), 0, -0.01, 0);
  head.add(m.black, k.cyl(0.02, 0.02, 0.02, 12), 0, 0.05, 0);
  head.add(m.brass, k.cyl(0.06, 0.06, 0.006, 24), 0, -0.058, 0);
  const g = head.node(glowParent);
  const mat = k.glow(0xffb870, 2.6, { side: THREE.DoubleSide });
  const disc = new THREE.Mesh(k.geo('lamp-disc', () => new THREE.CircleGeometry(0.053, 24).rotateX(HALF_PI)), mat);
  disc.position.y = -0.061;
  g.add(disc);
  const bulb = new THREE.Mesh(k.sphere(0.017, 10, 8), mat);
  bulb.position.y = -0.04;
  g.add(bulb);
  return mat;
}

/** Headphones hanging on a black stand. */
export function addHeadphones(p: Place, k: Kit, m: DeskMats): void {
  p.add(m.black, k.cyl(0.062, 0.068, 0.012, 22), 0, 0.006, 0);
  p.add(m.alu, k.cyl(0.0075, 0.0075, 0.25, 8), 0, 0.137, 0);
  p.add(m.black, k.cyl(0.011, 0.011, 0.07, 10), 0, 0.262, 0, { rx: HALF_PI });
  const band = k.geo('hp-band', () => new THREE.TorusGeometry(0.086, 0.0075, 6, 22, Math.PI));
  p.add(m.black, band, 0, 0.185, 0);
  p.add(m.rubber, soft(k, 0.07, 0.014, 0.034, 0.006), 0, 0.2705, 0);
  for (const sx of [-1, 1]) {
    p.add(m.alu, k.cyl(0.044, 0.044, 0.026, 22), sx * 0.094, 0.13, 0, { rz: HALF_PI });
    p.add(m.rubber, k.cyl(0.04, 0.04, 0.02, 22), sx * 0.077, 0.13, 0, { rz: HALF_PI });
    p.add(m.black, k.cyl(0.037, 0.037, 0.004, 22), sx * 0.108, 0.13, 0, { rz: HALF_PI });
    p.add(m.rubber, k.box(0.01, 0.045, 0.012), sx * 0.088, 0.172, 0);
  }
}

/** Small potted plant: white pot and a bush of flat leaves. */
export function addPlant(p: Place, k: Kit, m: DeskMats, s = 1): void {
  const pot = lathe(k, 'dp-pot', [
    [0.001, 0],
    [0.034, 0],
    [0.044, 0.01],
    [0.05, 0.07],
    [0.052, 0.078],
    [0.046, 0.078],
    [0.044, 0.07],
    [0.001, 0.07],
  ]);
  p.add(m.ceramic, pot, 0, 0, 0, { sx: s, sy: s, sz: s, color: tint(0xf1efe8) });
  p.add(m.ceramic, k.cyl(0.044 * s, 0.044 * s, 0.004, 14), 0, 0.068 * s, 0, { color: tint(0x2a1d14) });
  const leafGeo = k.geo('dp-leaf', () => new THREE.SphereGeometry(0.03, 10, 6));
  const greens = [0x3f8a45, 0x4f9a4e, 0x2f7438, 0x5ba653, 0x377f3f];
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = i * 2.4 + 0.3;
    const rad = (0.012 + (i % 4) * 0.012) * s;
    const h = (0.08 + (i % 5) * 0.026) * s;
    const out = (0.03 + (i % 3) * 0.022) * s;
    const bx = Math.cos(a) * rad;
    const bz = Math.sin(a) * rad;
    const tx = Math.cos(a) * (rad + out);
    const tz = Math.sin(a) * (rad + out);
    p.rod(m.ceramic, [bx, 0.07 * s, bz], [tx, h + 0.07 * s, tz], 0.0016 * s, 4, { color: tint(0x3a6a34) });
    p.add(m.ceramic, leafGeo, tx, h + 0.07 * s, tz, {
      sx: 0.95 * s,
      sy: 0.22 * s,
      sz: 1.35 * s,
      ry: -a + HALF_PI,
      rx: -0.35 + (i % 3) * 0.2,
      color: tint(greens[i % greens.length]),
    });
  }
}

export function addMug(p: Place, k: Kit, m: DeskMats): void {
  const body = lathe(k, 'dm-mug', [
    [0.001, 0],
    [0.034, 0],
    [0.039, 0.006],
    [0.04, 0.09],
    [0.0385, 0.094],
    [0.035, 0.092],
    [0.0345, 0.01],
    [0.001, 0.008],
  ], 24);
  p.add(m.ceramic, body, 0, 0, 0, { color: tint(0xf4f2ec) });
  p.add(m.ceramic, k.geo('dm-handle', () => new THREE.TorusGeometry(0.024, 0.0055, 6, 12, Math.PI)), 0.04, 0.05, 0, { rz: -HALF_PI, color: tint(0xf4f2ec) });
  p.add(m.ceramic, k.cyl(0.0335, 0.0335, 0.002, 16), 0, 0.078, 0, { color: tint(0x6a4430) });
}

export function addPenPot(p: Place, k: Kit, m: DeskMats, d: Place): void {
  p.add(m.steel, k.cyl(0.034, 0.031, 0.092, 18), 0, 0.046, 0);
  const cols = [0xc6402e, 0x2d5fa8, 0x1a1a1a, 0xe3c14a, 0x3d8f6b];
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26;
    const top: [number, number, number] = [Math.cos(a) * (0.012 + i * 0.002) * 1.6, 0.14 + (i % 3) * 0.014, Math.sin(a) * 0.012];
    d.rod(m.tint, [Math.cos(a) * 0.01, 0.04, Math.sin(a) * 0.01], top, 0.0035, 5, { color: tint(cols[i]) });
  }
  // a thin brush with a bristle tip
  d.rod(m.black, [0.004, 0.04, 0.012], [-0.012, 0.165, 0.02], 0.0028, 5);
  d.rod(m.alu, [-0.011, 0.155, 0.019], [-0.016, 0.185, 0.022], 0.003, 5);
}

/** A4 stack of prints; the textured top sheet is added by the caller (it needs a map). Returns top height. */
export function addPrintStack(p: Place, k: Kit, m: DeskMats, sheets = 7): number {
  const h = 0.0016;
  for (let i = 0; i < sheets; i++) {
    p.add(m.paper, k.box(0.21, h, 0.297), (i % 3) * 0.002 - 0.002, h / 2 + i * h, ((i * 7) % 5) * 0.0015, { ry: ((i * 13) % 7) * 0.012 - 0.036 });
  }
  return sheets * h;
}

export function addDrive(p: Place, d: Place, k: Kit, m: DeskMats, glowParent: THREE.Object3D): void {
  p.add(m.steel, k.rbox(0.11, 0.034, 0.17, 0.007), 0, 0.017, 0);
  p.add(m.alu, k.box(0.112, 0.003, 0.172), 0, 0.034, 0);
  for (let i = 0; i < 6; i++) {
    p.add(m.black, k.box(0.07, 0.0016, 0.004), 0, 0.0358, -0.05 + i * 0.012);
  }
  const led = new THREE.Mesh(k.box(0.012, 0.003, 0.002), k.glow(0x4da8ff, 3));
  const n = p.at(0.03, 0.012, 0.0865).node(glowParent);
  n.add(led);
  d.tube(m.rubber, [[-0.02, 0.012, -0.085], [-0.03, 0.004, -0.14], [-0.02, 0.004, -0.2], [0.04, 0.004, -0.26]], 0.0028, 20, 4);
}

/** Wacom-style pen tablet with its pen. */
export function addTablet(p: Place, k: Kit, m: DeskMats, areaMat: THREE.Material): void {
  p.add(m.black, soft(k, 0.34, 0.012, 0.22, 0.005), 0, 0.006, 0);
  p.add(areaMat, k.geo('dt-area', () => new THREE.PlaneGeometry(0.27, 0.169).rotateX(-HALF_PI)), 0.022, 0.0127, 0.002);
  for (let i = 0; i < 4; i++) {
    p.add(m.steel, k.box(0.012, 0.002, 0.014), -0.145, 0.0132, -0.065 + i * 0.043);
  }
  p.add(m.alu, k.box(0.004, 0.0015, 0.04), 0.157, 0.0128, -0.08);
  // pen laid across the top-right corner
  p.rod(m.black, [-0.06, 0.0175, 0.1], [0.11, 0.0175, 0.03], 0.0052, 8);
  p.rod(m.rubber, [-0.03, 0.0175, 0.088], [0.03, 0.0175, 0.063], 0.0062, 8);
  p.rod(m.alu, [0.11, 0.0175, 0.03], [0.128, 0.0175, 0.0225], 0.0018, 5);
}

export function addMouse(p: Place, k: Kit, m: DeskMats): void {
  p.add(m.black, soft(k, 0.062, 0.03, 0.105, 0.014, 8), 0, 0.015, 0);
  p.add(m.rubber, k.box(0.003, 0.0016, 0.05), 0, 0.0305, -0.012);
}

/** Framed print leaning on the wall (frame origin = bottom edge centre). */
export function addFramedPrint(p: Place, k: Kit, m: DeskMats, printMat: THREE.Material, w = 0.3, h = 0.4): void {
  p.add(m.black, k.rbox(w, h, 0.02, 0.004), 0, h / 2, 0);
  p.add(m.paper, k.box(w - 0.036, h - 0.036, 0.004), 0, h / 2, 0.0098);
  p.add(printMat, k.plane(w - 0.088, h - 0.1), 0, h / 2 + 0.012, 0.0125);
}

export function addSticky(p: Place, k: Kit, m: DeskMats, hex: number, rz = 0): void {
  p.add(m.tint, k.box(0.074, 0.001, 0.074), 0, 0.0005, 0, { color: tint(hex), ry: rz });
}

/** Books standing on a shelf (origin = shelf top). */
export function addBooks(p: Place, d: Place, k: Kit, m: DeskMats): void {
  const spec: Array<[number, number, number, number]> = [
    [0.034, 0.27, 0x1d2a3a, 0],
    [0.026, 0.245, 0x8c2f24, 0.02],
    [0.044, 0.26, 0xd8d2c2, 0],
    [0.03, 0.23, 0x2f4a3a, 0],
    [0.038, 0.255, 0x15151a, -0.04],
  ];
  let x = -0.36;
  for (const [w, h, hex, tilt] of spec) {
    p.add(m.tint, k.box(w, h, 0.17), x + w / 2, h / 2, -0.002, { color: tint(hex), rz: tilt });
    d.add(m.tint, k.box(w * 0.82, 0.018, 0.002), x + w / 2, h * 0.7, 0.0845, { color: tint(0xcdb88a), rz: tilt });
    x += w + 0.003 + Math.abs(tilt) * h;
  }
  // flat stack on the right with a small twin-lens camera on top
  const hs = [0.034, 0.028, 0.022];
  const cs = [0x3a352e, 0xb7b0a0, 0x1c2433];
  let y = 0;
  for (let i = 0; i < hs.length; i++) {
    p.add(m.tint, k.box(0.3, hs[i], 0.22), 0.2, y + hs[i] / 2, 0, { color: tint(cs[i]), ry: (i - 1) * 0.05 });
    y += hs[i];
  }
  p.add(m.black, k.rbox(0.07, 0.09, 0.062, 0.006), 0.2, y + 0.045, 0);
  p.add(m.alu, k.cyl(0.02, 0.02, 0.012, 14), 0.2, y + 0.06, 0.036, { rx: HALF_PI });
  p.add(m.lens, k.cyl(0.015, 0.015, 0.004, 14), 0.2, y + 0.06, 0.043, { rx: HALF_PI });
  p.add(m.alu, k.cyl(0.02, 0.02, 0.012, 14), 0.2, y + 0.027, 0.036, { rx: HALF_PI });
  p.add(m.lens, k.cyl(0.015, 0.015, 0.004, 14), 0.2, y + 0.027, 0.043, { rx: HALF_PI });
}
