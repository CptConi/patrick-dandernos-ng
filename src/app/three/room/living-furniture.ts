import * as THREE from 'three';
import { Kit, put } from './kit';
import { rng } from '../procedural-textures';
import {
  Bag,
  canvasTex,
  contactBlob,
  fabricNormalMap,
  loopCurve,
  makeCanvas,
  makeWood,
  onLivingQuality,
  pillowGeo,
  roundRectLoop,
  softBoxGeo,
  sstep,
  wallBlob, lstd, lin } from './living-util';

/* ---------------------------------------------------------------- */
/* Small textures                                                    */
/* ---------------------------------------------------------------- */

function keyboardTexture(k: Kit): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 96);
  ctx.fillStyle = '#17181b';
  ctx.fillRect(0, 0, 256, 96);
  const rows = [14, 14, 13, 12, 8];
  rows.forEach((n, r) => {
    const kw = 256 / 15.2;
    let x = 4 + (r === 4 ? 40 : 0);
  for (let i = 0; i < n; i++) {
      const w = r === 4 && i === 3 ? kw * 5.5 : kw - 2;
      ctx.fillStyle = '#2b2d33';
      ctx.fillRect(x, 6 + r * 17, w, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, 6 + r * 17, w, 2);
      x += w + 2;
    }
  });
  return canvasTex(k, c, { srgb: true, repeat: false });
}

function posterTexture(k: Kit): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128, 180);
  ctx.fillStyle = '#efe9dc';
  ctx.fillRect(0, 0, 128, 180);
  ctx.fillStyle = '#1a1a1c';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('EXPOSITION', 64, 22);
  ctx.font = '9px sans-serif';
  ctx.fillText('CLUB PHOTO', 64, 36);
  const g = ctx.createRadialGradient(64, 85, 4, 64, 85, 50);
  g.addColorStop(0, '#c7936a');
  g.addColorStop(1, '#2a1c14');
  ctx.fillStyle = g;
  ctx.fillRect(18, 46, 92, 70);
  ctx.fillStyle = '#d6d0c4';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(18 + i * 24, 124, 20, 16);
  }
  ctx.fillStyle = '#555';
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(18, 148 + i * 5, 92 - (i % 2) * 20, 2);
  }
  return canvasTex(k, c, { srgb: true, repeat: false });
}

function printTexture(k: Kit): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(96, 128);
  const g = ctx.createRadialGradient(48, 60, 4, 48, 60, 70);
  g.addColorStop(0, '#d9a066');
  g.addColorStop(0.4, '#5a3a24');
  g.addColorStop(1, '#0c0908');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 96, 128);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(48, 78, 18, 40, 0, 0, 6.28);
  ctx.fill();
  return canvasTex(k, c, { srgb: true, repeat: false });
}

/* ---------------------------------------------------------------- */
/* Cabinet                                                           */
/* ---------------------------------------------------------------- */

export function buildCabinetRich(k: Kit, screenTex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  g.name = 'cabinet';
  const blackWood = new THREE.MeshStandardMaterial({ color: lin(0x17130f), roughness: 0.42, metalness: 0.05 });
  const wood = makeWood(k, 23, '#e6cf9c', '#b08c52', { grain: 160, w: 512, h: 256 });
  const woodMat = new THREE.MeshStandardMaterial({
    color: lin(0xffffff),
    map: wood.map,
    normalMap: wood.normal,
    normalScale: new THREE.Vector2(0.3, 0.3),
    roughness: 0.55,
  });
  onLivingQuality((q) => {
    woodMat.normalMap = q === 'high' ? wood.normal : null;
    woodMat.needsUpdate = true;
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: lin(0x0b0e12),
    roughness: 0.05,
    metalness: 0.1,
    transparent: true,
    opacity: 0.6,
    envMapIntensity: 1.8,
    depthWrite: false,
  });
  const metal = lstd(k, 0xb8bcc2, 0.25, 1);
  const dark = lstd(k, 0x0c0c0d, 0.5, 0.2);

  const W = 0.56;
  const H = 1.45;
  const D = 0.46;
  const a = new Bag();
  const ao = (p: THREE.Vector3) => 0.78 + 0.22 * sstep(0.0, 0.25, p.y);
  a.add(blackWood, k.box(0.02, H, D), -W / 2 + 0.01, H / 2, 0, { ao });
  a.add(blackWood, k.box(0.02, H, D), W / 2 - 0.01, H / 2, 0, { ao });
  a.add(blackWood, k.box(W, 0.025, D), 0, H - 0.0125, 0);
  a.add(blackWood, k.box(W - 0.04, 0.07, D - 0.04), 0, 0.035, -0.01, { color: 0x555555 });
  a.add(blackWood, k.box(W - 0.04, 0.02, D - 0.02), 0, 0.752, 0);
  a.add(blackWood, k.box(W - 0.04, H - 0.07, 0.012), 0, H / 2 + 0.035, -D / 2 + 0.006, { color: 0x666666 });
  a.add(blackWood, k.box(W - 0.04, 0.012, D - 0.06), 0, 1.02, -0.01);
  a.add(blackWood, k.box(W - 0.04, 0.012, D - 0.06), 0, 1.24, -0.01);
  // a few things behind the glass
  const colors = [0x2c2f36, 0x3a2b24, 0x1e2a33, 0x4a4036, 0x25282d];
  const rr = rng(8);
  for (let s = 0; s < 3; s++) {
    const y = [0.77, 1.032, 1.252][s];
    let x = -0.2;
    while (x < 0.2) {
      const w = 0.04 + rr() * 0.07;
      const h = 0.06 + rr() * 0.12;
      a.add(blackWood, k.box(w, h, 0.18 + rr() * 0.1), x + w / 2, y + h / 2, -0.04, { color: colors[Math.floor(rr() * 5)] });
      x += w + 0.01 + rr() * 0.03;
    }
  }
  a.flush(g, { cast: true });

  // door frame + glass + handle + poster
  const frame = new Bag();
  const zf = D / 2 + 0.004;
  frame.add(dark, k.box(0.5, 0.02, 0.012), 0, 1.4, zf);
  frame.add(dark, k.box(0.5, 0.02, 0.012), 0, 0.775, zf);
  frame.add(dark, k.box(0.02, 0.64, 0.012), -0.24, 1.09, zf);
  frame.add(dark, k.box(0.02, 0.64, 0.012), 0.24, 1.09, zf);
  frame.add(metal, k.cyl(0.005, 0.005, 0.12, 8), 0.2, 1.09, zf + 0.016);
  frame.add(metal, k.box(0.01, 0.01, 0.014), 0.2, 1.15, zf + 0.008);
  frame.add(metal, k.box(0.01, 0.01, 0.014), 0.2, 1.03, zf + 0.008);
  frame.flush(g, { cast: false });
  put(g, k.box(0.48, 0.62, 0.004), glass, 0, 1.09, zf - 0.001, { receive: false });
  const poster = new THREE.Mesh(
    k.plane(0.17, 0.24),
    new THREE.MeshStandardMaterial({ map: posterTexture(k), roughness: 0.6 })
  );
  poster.position.set(-0.07, 1.12, zf + 0.007);
  poster.rotation.z = 0.02;
  g.add(poster);

  // drawers (light wood) with recessed pulls
  const dr = new Bag();
  for (let i = 0; i < 3; i++) {
    const y = 0.178 + i * 0.2;
    dr.add(woodMat, softBoxGeo(0.5, 0.19, 0.022, 0.004, { seg: 4, uv: 2 }), 0, y, zf - 0.004, { color: 0xffffff });
    dr.add(dark, k.rbox(0.17, 0.022, 0.006, 0.003), 0, y + 0.072, zf + 0.009);
    dr.add(metal, k.box(0.15, 0.004, 0.004), 0, y + 0.0585, zf + 0.0095);
  }
  dr.flush(g, { cast: true });

  // top of the cabinet: laptop, figurine, leaning print, piggy bank, mini cow
  const top = new THREE.Group();
  top.position.y = H;
  g.add(top);
  const lap = new THREE.Group();
  lap.position.set(0.05, 0, 0.0);
  lap.rotation.y = 0.25;
  top.add(lap);
  const lapMat = lstd(k, 0x2a2c31, 0.35, 0.8);
  const keyMat = new THREE.MeshStandardMaterial({ map: keyboardTexture(k), roughness: 0.6 });
  put(lap, k.rbox(0.32, 0.012, 0.22, 0.005), lapMat, 0, 0.006, 0, { cast: true });
  const kb = new THREE.Mesh(k.plane(0.28, 0.1), keyMat);
  kb.rotation.x = -Math.PI / 2;
  kb.position.set(0, 0.0125, 0.03);
  lap.add(kb);
  const lid = new THREE.Group();
  lid.position.set(0, 0.012, -0.105);
  lid.rotation.x = -0.2;
  lap.add(lid);
  put(lid, k.rbox(0.32, 0.21, 0.008, 0.004), lapMat, 0, 0.105, 0, { cast: true });
  const scr = k.glow(0xffffff, 0.9, { map: screenTex });
  put(lid, k.plane(0.3, 0.19), scr, 0, 0.105, 0.0045, { receive: false });

  const fig = new Bag();
  const figDark = lstd(k, 0x23272e, 0.5, 0.3);
  const figAcc = lstd(k, 0x6a3a2a, 0.55, 0.2);
  const skin = lstd(k, 0xb89883, 0.6);
  fig.add(figDark, k.cyl(0.05, 0.055, 0.012, 14), -0.15, 0.006, 0.08);
  fig.rod(figDark, [-0.16, 0.015, 0.08], [-0.16, 0.1, 0.082], 0.011, 6);
  fig.rod(figDark, [-0.14, 0.015, 0.08], [-0.14, 0.1, 0.078], 0.011, 6);
  fig.add(figAcc, k.rbox(0.05, 0.08, 0.03, 0.01), -0.15, 0.14, 0.08);
  fig.rod(figDark, [-0.185, 0.17, 0.08], [-0.195, 0.1, 0.09], 0.008, 6);
  fig.rod(figDark, [-0.115, 0.17, 0.08], [-0.105, 0.11, 0.09], 0.008, 6);
  fig.add(skin, k.sphere(0.021, 10, 8), -0.15, 0.2, 0.082);
  fig.add(figDark, k.sphere(0.023, 10, 8), -0.15, 0.206, 0.077, { sy: 0.8 });
  fig.flush(top, { cast: true });

  put(top, k.rbox(0.2, 0.15, 0.014, 0.004), lstd(k, 0x0b0b0c, 0.5), 0.21, 0.075, -0.13, { rx: -0.2, cast: true });
  const printM = new THREE.Mesh(k.plane(0.18, 0.13), new THREE.MeshBasicMaterial({ map: printTexture(k), toneMapped: false }));
  printM.position.set(0.21, 0.075, -0.1225);
  printM.rotation.x = -0.2;
  top.add(printM);

  // black piggy bank (lathe-ish body + snout, ears, legs, curly tail)
  const pig = new Bag();
  const pigMat = lstd(k, 0x0f0f11, 0.28, 0.15);
  pig.add(pigMat, k.sphere(0.05, 18, 12), 0.2, 0.062, 0.12, { sx: 1.2, sy: 0.96, sz: 0.95 });
  pig.add(pigMat, k.cyl(0.018, 0.02, 0.022, 10), 0.262, 0.06, 0.12, { rz: Math.PI / 2 });
  pig.add(pigMat, k.cyl(0.011, 0.011, 0.01, 8), 0.2, 0.113, 0.12);
  for (const sz of [-1, 1]) {
    pig.add(pigMat, k.cyl(0.0, 0.014, 0.026, 6), 0.243, 0.105, 0.12 + sz * 0.025, { rx: sz * 0.5 });
    for (const sx of [-1, 1]) {
      pig.add(pigMat, k.cyl(0.011, 0.012, 0.03, 8), 0.2 + sx * 0.032, 0.015, 0.12 + sz * 0.027);
    }
  }
  pig.tube(
    pigMat,
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.147, 0.07, 0.12),
      new THREE.Vector3(0.132, 0.085, 0.12),
      new THREE.Vector3(0.14, 0.1, 0.125),
      new THREE.Vector3(0.128, 0.108, 0.12),
    ]),
    0.004,
    10,
    4
  );
  pig.flush(top, { cast: true });
  put(top, k.sphere(0.0035, 6, 4), lstd(k, 0xd0d0d0, 0.3, 1), 0.262, 0.065, 0.12);

  // mini cow (white with black patches)
  const cow = new Bag();
  const cowW = lstd(k, 0xeeeae0, 0.6);
  const cowB = lstd(k, 0x161616, 0.6);
  cow.add(cowW, k.rbox(0.07, 0.035, 0.032, 0.008), -0.19, 0.04, 0.13);
  cow.add(cowB, k.box(0.022, 0.02, 0.034), -0.2, 0.05, 0.13);
  cow.add(cowW, k.rbox(0.026, 0.026, 0.026, 0.008), -0.236, 0.05, 0.13);
  cow.add(cowB, k.box(0.012, 0.012, 0.01), -0.25, 0.043, 0.13);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      cow.add(cowW, k.cyl(0.005, 0.005, 0.024, 6), -0.19 + sx * 0.026, 0.012, 0.13 + sz * 0.011);
    }
  }
  cow.flush(top, { cast: true });

  contactBlob(k, g, 0, 0, 0.9, 0.78, 0.65);
  return g;
}

/* ---------------------------------------------------------------- */
/* Brass porthole mirror                                             */
/* ---------------------------------------------------------------- */

export function buildPortholeRich(k: Kit): THREE.Group {
  const g = new THREE.Group();
  g.name = 'porthole';
  const brass = new THREE.MeshStandardMaterial({
    color: lin(0xb08a55),
    roughness: 0.42,
    metalness: 0.78,
    envMapIntensity: 1.6,
    side: THREE.DoubleSide,
  });
  const brassDark = new THREE.MeshStandardMaterial({ color: lin(0x4a3622), roughness: 0.5, metalness: 0.9 });
  const mirror = new THREE.MeshStandardMaterial({ color: lin(0xe2e8ec), roughness: 0.04, metalness: 1, envMapIntensity: 1.5 });
  wallBlob(k, g, 0, 0, 0.002, 0.78, 0.78, 0.42);

  const prof: Array<[number, number]> = [
    [0.19, 0.0], [0.205, 0.0], [0.22, 0.006], [0.238, 0.02], [0.262, 0.034], [0.278, 0.03], [0.285, 0.016], [0.284, 0.004],
    [0.28, 0.0],
  ];
  const ringGeo = k.geo('ph-ring-rich', () => {
    // lathe about Y then rotate so the axis is Z
    const pts = prof.map((p) => new THREE.Vector2(p[0], p[1]));
    return new THREE.LatheGeometry(pts, 48).rotateX(Math.PI / 2);
  });
  put(g, ringGeo, brass, 0, 0, 0.004, { cast: true });
  // inner lip
  put(g, k.geo('ph-lip', () => new THREE.TorusGeometry(0.2, 0.011, 8, 48)), brassDark, 0, 0, 0.012);
  // convex mirror
  const mir = k.geo('ph-mirror', () => {
    const R = 1.3;
    const th = Math.asin(0.2 / R);
    return new THREE.SphereGeometry(R, 40, 8, 0, Math.PI * 2, 0, th).rotateX(Math.PI / 2).translate(0, 0, -R + 0.014);
  });
  put(g, mir, mirror, 0, 0, 0.004);

  const b = new Bag();
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2 + 0.2;
    const x = Math.cos(t) * 0.249;
    const y = Math.sin(t) * 0.249;
    b.add(brassDark, k.cyl(0.0125, 0.0125, 0.008, 6), x, y, 0.038, { rx: Math.PI / 2, ry: t });
    b.add(brass, k.sphere(0.0105, 8, 5), x, y, 0.0415, { sz: 0.55 });
  }
  // hinge on the left, wing-nut latch on the right
  for (const dy of [-0.08, 0, 0.08]) {
    b.add(brass, k.cyl(0.013, 0.013, 0.05, 10), -0.3, dy, 0.022);
  }
  b.add(brass, k.box(0.045, 0.2, 0.012), -0.285, 0, 0.012);
  b.add(brass, k.cyl(0.009, 0.009, 0.03, 8), 0.292, 0, 0.026, { rx: Math.PI / 2 });
  b.add(brass, k.box(0.05, 0.012, 0.008), 0.292, 0, 0.044);
  b.flush(g, { cast: true });
  return g;
}

/* ---------------------------------------------------------------- */
/* Desk, office chair and drum stool live in their own files          */
/* ---------------------------------------------------------------- */

export { buildDeskRich } from './living-desk';
export { buildChairRich, buildStool } from './living-chair';

/* ---------------------------------------------------------------- */
/* Wooden chest with red cushion                                     */
/* ---------------------------------------------------------------- */

export function buildChestRich(k: Kit): THREE.Group {
  const g = new THREE.Group();
  g.name = 'chest';
  const wood = makeWood(k, 9, '#a58b68', '#554029', { grain: 260, w: 512, h: 128, knots: 3 });
  const plank = new THREE.MeshStandardMaterial({
    color: lin(0xffffff),
    map: wood.map,
    normalMap: wood.normal,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.88,
  });
  onLivingQuality((q) => {
    plank.normalMap = q === 'high' ? wood.normal : null;
    plank.needsUpdate = true;
  });
  const strap = lstd(k, 0x1a1b1d, 0.5, 0.75);
  const nail = lstd(k, 0x4a4d52, 0.4, 0.9);
  const nm = fabricNormalMap(k);
  const red = new THREE.MeshPhysicalMaterial({
    color: lin(0xc23a22),
    roughness: 0.96,
    sheen: 1,
    sheenColor: new THREE.Color(lin(0xf09070)),
    sheenRoughness: 0.6,
    normalMap: nm,
    normalScale: new THREE.Vector2(0.5, 0.5),
  });
  onLivingQuality((q) => {
    red.sheen = q === 'high' ? 1 : 0;
    red.normalMap = q === 'high' ? nm : null;
    red.needsUpdate = true;
  });
  const rnd = rng(61);
  const a = new Bag();
  const W = 0.9;
  const Dp = 0.5;
  const PH = 0.082;
  const ao = (p: THREE.Vector3) => 0.6 + 0.4 * sstep(0.0, 0.2, p.y);
  for (let i = 0; i < 5; i++) {
    const y = 0.045 + i * 0.0845;
    const tint = (v: number) => {
      const r = Math.round((0.8 + rnd() * 0.2) * 255);
      const gg = Math.round((0.8 + rnd() * 0.2) * 255);
      return (r << 16) | (gg << 8) | Math.round(v * 255);
    };
    for (const sz of [-1, 1]) {
      a.add(plank, k.box(W, PH, 0.02), 0, y, sz * (Dp / 2 - 0.01), { color: tint(0.86), ao });
    }
    for (const sx of [-1, 1]) {
      a.add(plank, k.box(0.02, PH, Dp - 0.04), sx * (W / 2 - 0.01), y, 0, { color: tint(0.8), ao });
    }
  }
  a.add(plank, k.box(W - 0.04, 0.02, Dp - 0.04), 0, 0.43, 0);
  a.add(plank, k.box(W - 0.04, 0.02, Dp - 0.04), 0, 0.012, 0, { color: 0x333333 });
  // corner posts
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      a.add(plank, k.box(0.04, 0.43, 0.04), sx * (W / 2 - 0.018), 0.215, sz * (Dp / 2 - 0.018), { color: 0xb08c68, ao });
    }
  }
  // dark steel straps, corners and rims
  for (const sx of [-1, 1]) {
    a.add(strap, k.box(0.03, 0.42, 0.004), sx * 0.4, 0.215, Dp / 2 + 0.001);
    a.add(strap, k.box(0.03, 0.42, 0.004), sx * 0.4, 0.215, -Dp / 2 - 0.001);
    a.add(strap, k.box(0.004, 0.42, 0.03), sx * (W / 2 + 0.001), 0.215, 0);
  }
  a.add(strap, k.box(W + 0.01, 0.014, 0.008), 0, 0.436, Dp / 2);
  a.add(strap, k.box(W + 0.01, 0.014, 0.008), 0, 0.436, -Dp / 2);
  a.add(strap, k.box(0.008, 0.014, Dp), -W / 2, 0.436, 0);
  a.add(strap, k.box(0.008, 0.014, Dp), W / 2, 0.436, 0);
  // front latch + side handles
  a.add(strap, k.rbox(0.07, 0.05, 0.008, 0.004), 0, 0.31, Dp / 2 + 0.003);
  a.add(nail, k.cyl(0.012, 0.012, 0.006, 10), 0, 0.3, Dp / 2 + 0.009, { rx: Math.PI / 2 });
  for (const sx of [-1, 1]) {
    a.rod(strap, [sx * (W / 2 + 0.012), 0.32, -0.07], [sx * (W / 2 + 0.012), 0.32, 0.07], 0.005, 6);
    a.add(strap, k.box(0.012, 0.012, 0.012), sx * (W / 2 + 0.008), 0.32, 0.07);
    a.add(strap, k.box(0.012, 0.012, 0.012), sx * (W / 2 + 0.008), 0.32, -0.07);
  }
  a.flush(g, { cast: true });
  // rivet heads
  const nl = new Bag();
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      for (const sz of [-1, 1]) {
        nl.add(nail, k.sphere(0.005, 6, 4), sx * 0.4, 0.04 + i * 0.07, sz * (Dp / 2 + 0.004), { sz: 0.5 });
      }
    }
  }
  nl.flush(g, {});

  // two red cushions side by side on the lid, each with piping and a centre button (slightly askew, one a shade deeper)
  const cush = new Bag();
  const pipe = new Bag();
  const buttonMat = lstd(k, 0x6d1d10, 0.7);
  const CW = 0.425;
  const CD = 0.46;
  const cg = pillowGeo(CW, CD, 0.09, 0.08, 14);
  const seats: Array<{ x: number; y: number; yaw: number; tone: number; pipe: number }> = [
    { x: -0.218, y: 0.485, yaw: 0.05, tone: 0xffffff, pipe: 0xa82f1a },
    { x: 0.218, y: 0.489, yaw: -0.07, tone: 0xe8d6cf, pipe: 0x982a17 },
  ];
  for (const sc of seats) {
    cush.add(red, cg, sc.x, sc.y, 0, {
      ry: sc.yaw,
      color: sc.tone,
      aoLocal: (p) => 0.78 + 0.22 * Math.min(1, (1 - Math.pow(p.x / (CW / 2), 2)) * (1 - Math.pow(p.z / (CD / 2), 2)) * 3.4),
    });
    const ca = Math.cos(sc.yaw);
    const sa = Math.sin(sc.yaw);
    pipe.tube(
      red,
      loopCurve(
        roundRectLoop(CW - 0.01, CD - 0.005, 0.045, (u, v) => new THREE.Vector3(sc.x + u * ca + v * sa, sc.y, -u * sa + v * ca), 4)
      ),
      0.0045,
      90,
      4,
      { color: sc.pipe }
    );
    pipe.add(buttonMat, k.cyl(0.011, 0.011, 0.006, 10), sc.x, sc.y + 0.048, 0);
  }
  cush.flush(g, { cast: true });
  pipe.flush(g, { cast: true });

  contactBlob(k, g, 0, 0, 1.15, 0.72, 0.6);
  return g;
}
