import * as THREE from 'three';
import { Kit, put } from './kit';
import { Bag, contactBlob, lstd, lin, onLivingQuality, softBoxGeo } from './living-util';
import { createDeskScreen } from './desk-screen';
import { Place, contactSheetTexture, deskKeyboardTexture, printTexture, spillTexture, tabletTexture, tint } from './living-desk-util';
import {
  addBooks,
  addCamera,
  addDrive,
  addHeadphones,
  addLamp,
  addMouse,
  addMug,
  addPenPot,
  addPlant,
  addPrintStack,
  addSticky,
  addTablet,
  makeMats,
} from './living-desk-items';

/**
 * The workstation (white desk, black steel frame). Local frame: origin on the floor at the desk centre, front +Z
 * (where the chair is), back edge at z = -0.35 which is meant to touch the wall (userData.wallZ). Width 1.6, depth 0.7.
 */

const T = 0.76; // desk top surface
const MON = { x: -0.08, z: -0.2, y: 1.07 };
const WALL = -0.35;
const HALF_PI = Math.PI / 2;

function additive(k: Kit, tex: THREE.Texture, color: number, opacity: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({
    map: tex,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  k.registerDim(m);
  return m;
}

export function buildDeskRich(k: Kit, _screenTex?: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  g.name = 'desk';
  g.userData.wallZ = WALL;
  const m = makeMats(k);
  const topMat = new THREE.MeshPhysicalMaterial({ color: lin(0xe6e2d8), roughness: 0.46, clearcoat: 0.25, clearcoatRoughness: 0.5 });
  const steel = m.steel;
  const white = lstd(k, 0xe9e6de, 0.55, 0);
  onLivingQuality((q) => {
    topMat.clearcoat = q === 'high' ? 0.25 : 0;
    topMat.needsUpdate = true;
  });

  const main = new Bag();
  const detail = new Bag();
  const P = new Place(main);
  const D = new Place(detail);
  const glowG = new THREE.Group();
  g.add(glowG);

  /* ---- top + black steel frame ---- */
  P.add(topMat, softBoxGeo(1.6, 0.04, 0.7, 0.012, { seg: 6 }), 0, 0.74, 0);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      P.add(steel, k.box(0.036, 0.72, 0.036), sx * 0.762, 0.36, sz * 0.31, { color: 0xffffff });
    }
    P.add(steel, k.box(0.03, 0.045, 0.6), sx * 0.762, 0.695, 0);
    P.add(steel, k.box(0.036, 0.03, 0.66), sx * 0.762, 0.02, 0);
    P.add(steel, k.box(0.03, 0.03, 0.6), sx * 0.762, 0.4, 0);
    for (const sz of [-1, 1]) {
      P.add(m.rubber, k.cyl(0.016, 0.018, 0.012, 10), sx * 0.762, 0.006, sz * 0.31);
    }
  }
  P.add(steel, k.box(1.5, 0.045, 0.03), 0, 0.695, -0.31);
  P.add(steel, k.box(1.5, 0.04, 0.03), 0, 0.695, 0.31);
  P.add(steel, k.box(1.5, 0.3, 0.012), 0, 0.5, -0.318);
  P.add(m.black, k.rbox(1.0, 0.04, 0.12, 0.006), -0.12, 0.665, -0.24);

  // white drawer pedestal with black bar handles
  const px = 0.5;
  P.add(white, k.rbox(0.42, 0.62, 0.5, 0.008), px, 0.34, 0.0, { ao: (p) => 0.7 + 0.3 * Math.min(1, p.y * 3) });
  for (let i = 0; i < 3; i++) {
    const y = 0.15 + i * 0.2;
    P.add(m.black, k.box(0.4, 0.006, 0.004), px, y + 0.095, 0.252);
    P.add(m.black, k.rbox(0.16, 0.014, 0.012, 0.004), px, y + 0.06, 0.258);
  }

  /* ---- monitor (27") ---- */
  const mon = P.at(MON.x, 0, MON.z);
  mon.add(m.black, k.rbox(0.26, 0.012, 0.19, 0.006), 0, T + 0.006, 0.0);
  mon.add(m.alu, k.rbox(0.2, 0.003, 0.14, 0.004), 0, T + 0.0125, 0.0);
  mon.add(m.black, k.rbox(0.07, 0.24, 0.02, 0.008), 0, T + 0.13, -0.034, { rx: 0.06 });
  mon.add(m.black, softBoxGeo(0.64, 0.386, 0.022, 0.009, { seg: 4 }), 0, MON.y, 0);
  mon.add(m.black, k.rbox(0.5, 0.28, 0.026, 0.03), 0, MON.y + 0.02, -0.02);
  mon.add(m.alu, k.box(0.016, 0.003, 0.002), 0, MON.y - 0.1845, 0.0115);
  const screen = createDeskScreen(k);
  const scrMat = k.glow(0xffffff, 1.1, { map: screen.texture });
  const scr = put(g, k.plane(0.6, 0.3375), scrMat, MON.x, MON.y + 0.007, MON.z + 0.0116, { receive: false, name: 'deskScreen' });
  screen.attach(scr);
  const led = new THREE.Mesh(k.box(0.004, 0.002, 0.001), k.glow(0x66ff9a, 2.5));
  led.position.set(MON.x + 0.29, MON.y - 0.186, MON.z + 0.0115);
  g.add(led);

  /* ---- keyboard, mouse, tablet ---- */
  const keyMat = lstd(k, 0xffffff, 0.55, 0, { map: deskKeyboardTexture(k) });
  const kb = P.at(-0.08, T, 0.2, 0.02);
  kb.add(m.black, k.rbox(0.44, 0.014, 0.142, 0.007), 0, 0.007, 0);
  kb.add(keyMat, k.geo('dk-keys', () => new THREE.PlaneGeometry(0.416, 0.126).rotateX(-HALF_PI)), 0, 0.0145, 0.002);
  addMouse(P.at(-0.35, T, 0.2, 0.2), k, m);
  addTablet(P.at(0.27, T, 0.17, -0.08), k, m, lstd(k, 0xffffff, 0.35, 0, { map: tabletTexture(k) }));

  /* ---- lamp, camera, notes, pot, mug, drive, headphones, plant ---- */
  const lampMat = addLamp(P.at(-0.7, T, -0.24, 0.3), k, m, glowG);
  void lampMat;
  addCamera(P.at(-0.56, T, 0.11, 0.55), D.at(-0.56, T, 0.11, 0.55), k, m);
  addSticky(P.at(-0.66, T, -0.03), k, m, 0xf2d84c, 0.2);
  addSticky(P.at(-0.65, T + 0.001, -0.03), k, m, 0xf0a0b8, -0.1);
  addPenPot(P.at(-0.5, T, -0.27), k, m, D.at(-0.5, T, -0.27));
  addMug(P.at(0.3, T, -0.07, 0.4), k, m);
  addDrive(P.at(0.52, T, -0.02, 0.2), D.at(0.52, T, -0.02, 0.2), k, m, glowG);
  addHeadphones(P.at(0.42, T, -0.23), k, m);
  addPlant(P.at(0.73, T, -0.1), k, m, 1);

  // prints: stack on the right, top sheet textured
  const stack = P.at(0.65, T, 0.19, 0.3);
  const top = addPrintStack(stack, k, m);
  const stackMat = lstd(k, 0xffffff, 0.7, 0, { map: printTexture(k, 192, 272, 0.07, 0.22, 0.06, 0.78) });
  stack.add(stackMat, k.geo('dp-top', () => new THREE.PlaneGeometry(0.21, 0.297).rotateX(-HALF_PI)), 0, top + 0.0006, 0, { ry: 0.05 });

  /* ---- wall dressing (plane z = WALL, facing +Z) ---- */
  const wall = P.at(0, 0, WALL);
  const wallD = D.at(0, 0, WALL);
  // black steel shelf with books, a flat stack and a twin-lens camera
  wall.add(m.black, k.box(0.95, 0.03, 0.2), -0.05, 1.6, 0.1);
  for (const sx of [-0.4, 0.3]) {
    wall.add(m.black, k.box(0.012, 0.09, 0.012), sx, 1.55, 0.004);
    wall.add(m.black, k.box(0.012, 0.012, 0.14), sx, 1.576, 0.07);
  }
  addBooks(wall.at(-0.05, 1.615, 0.1), wallD.at(-0.05, 1.615, 0.1), k, m);
  // pinned contact sheets + small prints
  const sheetMat = lstd(k, 0xffffff, 0.8, 0, { map: contactSheetTexture(k) });
  const sheetGeo = k.plane(0.21, 0.297);
  const pins: Array<[number, number, number, number]> = [
    [-0.72, 1.4, 0.05, 0xd8402e],
    [-0.52, 1.33, -0.06, 0x2d5fa8],
    [0.54, 1.44, -0.03, 0xe3c14a],
  ];
  for (const [x, y, rz, pin] of pins) {
    wallD.add(sheetMat, sheetGeo, x, y, 0.003, { rz, color: 0xffffff });
    wallD.add(m.tint, k.sphere(0.0085, 8, 6), x - rz * 0.1, y + 0.13, 0.009, { sz: 0.7, color: tint(pin) });
  }
  const smallPrint = lstd(k, 0xffffff, 0.8, 0, { map: printTexture(k, 96, 128, 0.06, 0.5, 0.25, 0.5) });
  wallD.add(smallPrint, k.plane(0.1, 0.133), 0.43, 1.2, 0.003, { rz: 0.08 });
  wallD.add(smallPrint, k.plane(0.1, 0.133), 0.56, 1.17, 0.003, { rz: -0.05 });
  addSticky(wallD.at(0.36, 1.36, 0.0, 0, HALF_PI), k, m, 0xf2d84c, 0.15);
  addSticky(wallD.at(0.36, 1.27, 0.0, 0, HALF_PI), k, m, 0x9ad0e8, -0.1);

  /* ---- cables ---- */
  const cableBlack = m.rubber;
  D.tube(
    cableBlack,
    [
      [MON.x + 0.03, 1.0, MON.z - 0.035],
      [MON.x + 0.045, 0.85, MON.z - 0.06],
      [MON.x + 0.06, T + 0.002, -0.27],
      [MON.x + 0.06, 0.72, -0.285],
      [0.0, 0.66, -0.285],
      [0.06, 0.3, -0.3],
      [0.02, 0.012, -0.26],
    ],
    0.0045,
    44,
    5
  );
  D.tube(
    cableBlack,
    [
      [0.2, T + 0.001, 0.07],
      [0.3, T + 0.001, -0.13],
      [0.1, T + 0.001, -0.25],
      [0.08, 0.72, -0.285],
      [0.1, 0.5, -0.3],
      [0.06, 0.012, -0.27],
    ],
    0.0032,
    40,
    4
  );
  D.tube(
    cableBlack,
    [
      [-0.7, T + 0.002, -0.28],
      [-0.72, T + 0.001, -0.31],
      [-0.7, 0.68, -0.3],
      [-0.4, 0.66, -0.29],
      [-0.2, 0.3, -0.3],
      [0.0, 0.012, -0.25],
    ],
    0.003,
    36,
    4
  );
  D.add(m.black, k.rbox(0.3, 0.032, 0.055, 0.008), 0.03, 0.016, -0.25);

  /* ---- soft contact shadows on the desk top ---- */
  const blob = new THREE.MeshBasicMaterial({
    map: spillTexture(k),
    color: 0x000000,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const blobs = new Bag();
  const bg = k.geo('dk-blob', () => new THREE.PlaneGeometry(1, 1).rotateX(-HALF_PI));
  const spots: Array<[number, number, number, number, number]> = [
    [MON.x, MON.z + 0.02, 0.36, 0.26, 0],
    [-0.08, 0.2, 0.52, 0.22, 0.02],
    [-0.35, 0.2, 0.12, 0.17, 0.2],
    [0.27, 0.17, 0.42, 0.3, -0.08],
    [-0.56, 0.11, 0.3, 0.2, 0.55],
    [-0.7, -0.24, 0.2, 0.2, 0],
    [-0.5, -0.27, 0.1, 0.1, 0],
    [0.3, -0.07, 0.14, 0.14, 0],
    [0.52, -0.02, 0.2, 0.26, 0.2],
    [0.42, -0.23, 0.2, 0.2, 0],
    [0.73, -0.1, 0.14, 0.14, 0],
    [0.65, 0.19, 0.3, 0.38, 0.3],
  ];
  for (const [x, z, w, d, ry] of spots) {
    blobs.add(blob, bg, x, T + 0.0006, z, { sx: w, sz: d, ry, color: 0xffffff });
  }
  for (const mesh of blobs.flush(g, { cast: false, receive: false })) {
    mesh.renderOrder = 2;
  }

  /* ---- light spill fakes: cool screen glow on the desk, warm lamp pool + wall wash ---- */
  const spill = spillTexture(k);
  const screenSpill = new THREE.Mesh(k.plane(1, 1), additive(k, spill, 0x86a9ff, 0.2));
  screenSpill.rotation.x = -HALF_PI;
  screenSpill.scale.set(0.95, 0.6, 1);
  screenSpill.position.set(MON.x, T + 0.0012, MON.z + 0.28);
  screenSpill.renderOrder = 3;
  glowG.add(screenSpill);
  const lampPool = new THREE.Mesh(k.plane(1, 1), additive(k, spill, 0xffa850, 0.34));
  lampPool.rotation.x = -HALF_PI;
  lampPool.scale.set(0.62, 0.5, 1);
  lampPool.position.set(-0.46, T + 0.0012, 0.0);
  lampPool.renderOrder = 3;
  glowG.add(lampPool);
  const wallWash = new THREE.Mesh(k.plane(1, 1), additive(k, spill, 0xffa24a, 0.26));
  wallWash.scale.set(1.1, 0.9, 1);
  wallWash.position.set(-0.6, 1.2, WALL + 0.004);
  wallWash.renderOrder = 3;
  glowG.add(wallWash);

  main.flush(g, { cast: true });
  const detailG = new THREE.Group();
  detailG.name = 'deskDetail';
  g.add(detailG);
  detail.flush(detailG, { cast: false });
  onLivingQuality((q) => {
    detailG.visible = q === 'high';
  });

  contactBlob(k, g, 0, 0, 1.75, 0.95, 0.55);
  return g;
}
