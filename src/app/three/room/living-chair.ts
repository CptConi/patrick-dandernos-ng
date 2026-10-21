import * as THREE from 'three';
import { Kit, put } from './kit';
import {
  Bag,
  canvasTex,
  contactBlob,
  fabricNormalMap,
  loopCurve,
  makeCanvas,
  onLivingQuality,
  roundRectLoop,
  softBoxGeo,
  sstep,
  lstd,
  lin,
} from './living-util';

/** Black mesh-back office chair (swivelled on its star base), the drum stool and the gear left on them. */

const HALF_PI = Math.PI / 2;

function meshTexture(k: Kit): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(64, 64);
  ctx.fillStyle = '#131416';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#34373d';
  ctx.lineWidth = 2;
  for (let i = -64; i <= 64; i += 8) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 64, 64);
    ctx.moveTo(i + 64, 0);
    ctx.lineTo(i, 64);
    ctx.stroke();
  }
  return canvasTex(k, c, { srgb: true, x: 7, y: 8 });
}

/** Curved back panel (u across, v up) bowing forward at the sides and into the lumbar. */
function backPanelGeo(w: number, h: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h, 10, 8);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / (w / 2);
    const v = pos.getY(i) / (h / 2);
    pos.setZ(i, 0.03 * u * u - 0.018 * (1 - v * v) * (1 - u * u * 0.5));
  }
  g.computeVertexNormals();
  return g;
}

export function buildStool(k: Kit, dressed = false): THREE.Group {
  const g = new THREE.Group();
  g.name = 'stool';
  const iron = new THREE.MeshStandardMaterial({ color: lin(0x1a1a1c), roughness: 0.42, metalness: 0.85 });
  const brass = new THREE.MeshStandardMaterial({ color: lin(0x8a6c3e), roughness: 0.35, metalness: 1 });
  const seatTop = new THREE.MeshStandardMaterial({ color: lin(0xece5d6), roughness: 0.55 });
  const seatRim = lstd(k, 0xc9b48d, 0.6);
  const prof: Array<[number, number]> = [
    [0.001, 0], [0.16, 0], [0.17, 0.008], [0.16, 0.02], [0.1, 0.035], [0.045, 0.06], [0.026, 0.1], [0.02, 0.14], [0.02, 0.3],
    [0.024, 0.33], [0.045, 0.34], [0.05, 0.36], [0.026, 0.38], [0.02, 0.4], [0.02, 0.58], [0.05, 0.59], [0.09, 0.6], [0.001, 0.6],
  ];
  put(g, k.geo('stool-base', () => new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), 28)), iron, 0, 0, 0, { cast: true });
  put(g, k.geo('stool-ring', () => new THREE.TorusGeometry(0.047, 0.008, 8, 22).rotateX(Math.PI / 2)), brass, 0, 0.35, 0, {});
  const seat = k.geo('stool-seat', () => {
    const pts: Array<[number, number]> = [[0.001, 0], [0.17, 0], [0.19, 0.008], [0.195, 0.025], [0.185, 0.04], [0.15, 0.046], [0.001, 0.046]];
    return new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), 32);
  });
  put(g, seat, seatRim, 0, 0.6, 0, { cast: true });
  put(g, k.cyl(0.158, 0.158, 0.003, 32), seatTop, 0, 0.6465, 0, { cast: false });
  contactBlob(k, g, 0, 0, 0.5, 0.5, 0.6);
  if (dressed) {
    addCameraBag(k, g);
  }
  return g;
}

/** Olive canvas camera bag lying on the stool seat, strap hanging over the edge. */
function addCameraBag(k: Kit, g: THREE.Group): void {
  const canvas = lstd(k, 0x565a43, 0.92, 0);
  const leather = lstd(k, 0x8a5a34, 0.55, 0);
  const alu = lstd(k, 0xb5b8be, 0.3, 1);
  const dark = lstd(k, 0x1b1c1e, 0.7, 0);
  const y0 = 0.6475;
  const b = new Bag();
  const grad = (p: THREE.Vector3) => 0.78 + 0.22 * sstep(y0, y0 + 0.2, p.y);
  const bag = new THREE.Group();
  bag.position.set(0.0, 0, 0.0);
  bag.rotation.y = 0.5;
  g.add(bag);
  b.add(canvas, softBoxGeo(0.34, 0.19, 0.15, 0.03, { seg: 6, uv: 4 }), 0, y0 + 0.095, 0, { ao: grad });
  b.add(canvas, softBoxGeo(0.352, 0.085, 0.162, 0.026, { seg: 6, uv: 4 }), 0, y0 + 0.165, 0.002, { ao: grad });
  b.add(canvas, softBoxGeo(0.27, 0.1, 0.034, 0.014, { seg: 4, uv: 4 }), 0, y0 + 0.075, 0.09, { ao: grad });
  b.add(canvas, softBoxGeo(0.03, 0.12, 0.1, 0.012, { seg: 4, uv: 4 }), 0.182, y0 + 0.07, 0, { ao: grad });
  for (const sx of [-1, 1]) {
    b.add(leather, k.box(0.034, 0.13, 0.005), sx * 0.085, y0 + 0.135, 0.0855);
    b.add(alu, k.rbox(0.022, 0.018, 0.007, 0.003), sx * 0.085, y0 + 0.098, 0.09);
    b.add(leather, k.box(0.03, 0.03, 0.005), sx * 0.085, y0 + 0.12, 0.0858);
  }
  b.add(leather, k.box(0.07, 0.02, 0.006), 0.0, y0 + 0.075, 0.109);
  b.add(dark, k.rbox(0.05, 0.016, 0.004, 0.002), -0.06, y0 + 0.09, 0.108);
  b.tube(leather, new THREE.CatmullRomCurve3([new THREE.Vector3(-0.07, y0 + 0.205, 0), new THREE.Vector3(0, y0 + 0.245, 0), new THREE.Vector3(0.07, y0 + 0.205, 0)]), 0.009, 12, 5);
  // shoulder strap hanging off both ends
  b.tube(
    dark,
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.17, y0 + 0.17, 0.0),
      new THREE.Vector3(-0.24, y0 + 0.14, 0.03),
      new THREE.Vector3(-0.3, y0 + 0.0, 0.07),
      new THREE.Vector3(-0.31, y0 - 0.2, 0.1),
      new THREE.Vector3(-0.3, y0 - 0.3, 0.12),
    ]),
    0.011,
    20,
    4
  );
  b.tube(
    dark,
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.17, y0 + 0.17, 0.0),
      new THREE.Vector3(0.26, y0 + 0.13, -0.03),
      new THREE.Vector3(0.31, y0 + 0.0, -0.06),
      new THREE.Vector3(0.33, y0 - 0.15, -0.05),
    ]),
    0.011,
    20,
    4
  );
  b.flush(bag, { cast: true });
}

export function buildChairRich(k: Kit): THREE.Group {
  const g = new THREE.Group();
  g.name = 'chair';
  const nm = fabricNormalMap(k);
  const fabric = new THREE.MeshPhysicalMaterial({
    color: lin(0x1b1c1f),
    roughness: 0.92,
    sheen: 0.8,
    sheenColor: new THREE.Color(lin(0x60646c)),
    sheenRoughness: 0.6,
    normalMap: nm,
    normalScale: new THREE.Vector2(0.6, 0.6),
  });
  onLivingQuality((q) => {
    fabric.sheen = q === 'high' ? 0.8 : 0;
    fabric.normalMap = q === 'high' ? nm : null;
    fabric.needsUpdate = true;
  });
  const plastic = lstd(k, 0x0d0e10, 0.45, 0.1);
  const chrome = lstd(k, 0xb9bdc3, 0.2, 1);
  const rubber = lstd(k, 0x060607, 0.7);

  // star base, gas lift
  const a = new Bag();
  a.add(chrome, k.cyl(0.024, 0.024, 0.3, 12), 0, 0.3, 0);
  a.add(plastic, k.cyl(0.036, 0.048, 0.2, 14), 0, 0.2, 0);
  a.add(plastic, k.cyl(0.045, 0.045, 0.025, 14), 0, 0.125, 0);
  for (let i = 0; i < 5; i++) {
    const t = (i / 5) * Math.PI * 2 + 0.3;
    const cx = Math.cos(t) * 0.3;
    const cz = Math.sin(t) * 0.3;
    a.rod(plastic, [0, 0.12, 0], [cx, 0.075, cz], 0.016, 8);
    a.add(plastic, k.cyl(0.011, 0.011, 0.04, 8), cx, 0.062, cz);
    for (const o of [-0.012, 0.012]) {
      const px = cx - Math.sin(t) * o;
      const pz = cz + Math.cos(t) * o;
      a.add(rubber, k.cyl(0.027, 0.027, 0.012, 14), px, 0.03, pz, { rx: Math.PI / 2, ry: -t + Math.PI / 2 });
    }
  }
  a.flush(g, { cast: true });
  contactBlob(k, g, 0, 0, 0.85, 0.85, 0.55);

  // everything above the lift swivels a little off the base axis (the chair was just used)
  const up = new THREE.Group();
  up.rotation.y = 0.24;
  g.add(up);
  const s = new Bag();
  const TILT = 0.14;
  s.add(fabric, softBoxGeo(0.5, 0.075, 0.48, 0.035, { bulge: 0.012, seg: 8, uv: 12 }), 0, 0.5, 0.01, { ao: (p) => 0.6 + 0.4 * sstep(0.44, 0.52, p.y) });
  s.add(plastic, k.rbox(0.44, 0.03, 0.42, 0.012), 0, 0.452, 0.0);
  s.add(plastic, k.rbox(0.2, 0.06, 0.2, 0.02), 0, 0.41, -0.02);
  s.rod(plastic, [0.1, 0.4, 0.0], [0.2, 0.395, 0.06], 0.006, 6);
  s.rod(plastic, [0, 0.44, -0.09], [0, 0.76, -0.285], 0.02, 8);
  // mesh back: frame loop + panel + lumbar support
  const yc = 0.88;
  const zc = -0.265;
  const loop = loopCurve(
    roundRectLoop(0.46, 0.54, 0.12, (u, v) => new THREE.Vector3(u, yc + v * Math.cos(TILT), zc - v * Math.sin(TILT) + 0.03 * (u * u) / 0.053), 5)
  );
  s.tube(plastic, loop, 0.012, 90, 6);
  s.add(plastic, k.rbox(0.42, 0.06, 0.03, 0.012), 0, 0.7, -0.255 - 0.03, { rx: -TILT });
  s.add(plastic, k.rbox(0.06, 0.05, 0.03, 0.01), 0, 1.14, -0.3, { rx: -TILT });
  for (const sx of [-1, 1]) {
    // armrests
    s.add(plastic, k.rbox(0.03, 0.2, 0.03, 0.008), sx * 0.27, 0.57, -0.03);
    s.add(plastic, softBoxGeo(0.065, 0.034, 0.27, 0.014, { seg: 6 }), sx * 0.27, 0.68, 0.02);
  }
  s.flush(up, { cast: true });
  const meshMat = new THREE.MeshStandardMaterial({ map: meshTexture(k), roughness: 0.88, side: THREE.DoubleSide });
  const panel = new THREE.Mesh(k.geo('chair-back', () => backPanelGeo(0.44, 0.52)), meshMat);
  panel.position.set(0, yc, zc);
  panel.rotation.x = -TILT;
  panel.castShadow = true;
  panel.receiveShadow = true;
  up.add(panel);

  // drum stool of studio-02 placed next to the chair (chair-local coords), with a camera bag left on it
  const stool = buildStool(k, true);
  stool.position.set(-0.588, 0, -0.428);
  g.add(stool);
  return g;
}
