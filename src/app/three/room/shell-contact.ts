import * as THREE from 'three';
import { Assembly, Kit, put } from './kit';
import { canvasTex, contactBlob, lstd, makeCanvas, onLivingQuality, wallBlob } from './living-util';
import { makeArtTexture } from './frames-art';
import { rng } from '../procedural-textures';

/** World z of the contact corner on the right wall (x = +2.75): clear of the black cabinet, a hand away from the door. */
export const CONTACT_Z = 0.0;

type Pt = [number, number];

/** Painted art placeholder (portrait-ish) as a canvas, ready to be drawn into another canvas. */
const artCanvas = (kind: 'bust' | 'figure' | 'still' | 'eye' | 'smoke', seed: number, w: number, h: number): HTMLCanvasElement =>
  makeArtTexture(w / h, seed, kind, 160).image as HTMLCanvasElement;

/** Cork pin-board with postcards, polaroids and prints drawn on it; returns the texture and the pin positions (m). */
function boardTexture(k: Kit, bw: number, bh: number): { tex: THREE.CanvasTexture; pins: Pt[] } {
  const W = 512;
  const H = Math.round((W * bh) / bw);
  const [c, ctx] = makeCanvas(W, H);
  const r = rng(907);
  ctx.fillStyle = '#b8864f';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 3200; i++) {
    const dark = r() < 0.55;
    ctx.fillStyle = dark ? `rgba(84,50,22,${0.1 + r() * 0.26})` : `rgba(238,200,146,${0.1 + r() * 0.26})`;
    const s = 1 + r() * 3.2;
    ctx.fillRect(r() * W, r() * H, s, s * (0.6 + r() * 0.8));
  }
  const pins: Pt[] = [];
  const note = (cx: number, cy: number, w: number, h: number, rot: number, draw: (x: number, y: number) => void) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.shadowColor = 'rgba(40,22,8,0.6)';
    ctx.shadowBlur = 7;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 5;
    draw(-w / 2, -h / 2);
    ctx.restore();
    const px = cx + Math.sin(-rot) * (h / 2 - 9) * -1;
    const py = cy - Math.cos(rot) * (h / 2 - 9);
    pins.push([(px / W - 0.5) * bw, (0.5 - py / H) * bh]);
  };
  const photo = (w: number, h: number, bx: number, by: number, bb: number, kind: 'bust' | 'figure' | 'still' | 'eye' | 'smoke', seed: number, paper: string) => (x: number, y: number) => {
    ctx.fillStyle = paper;
    ctx.fillRect(x, y, w, h);
    ctx.shadowColor = 'transparent';
    ctx.drawImage(artCanvas(kind, seed, w - bx * 2, h - by - bb), x + bx, y + by, w - bx * 2, h - by - bb);
  };
  // airmail postcard
  note(112, 96, 150, 102, -0.07, (x, y) => {
    ctx.fillStyle = '#eee3cb';
    ctx.fillRect(x, y, 150, 102);
    ctx.shadowColor = 'transparent';
    for (let i = 0; i < 15; i++) {
      ctx.fillStyle = i % 2 ? '#c8372d' : '#2c4f8f';
      ctx.fillRect(x + i * 10, y, 6, 5);
      ctx.fillRect(x + i * 10, y + 97, 6, 5);
    }
    ctx.fillStyle = '#5a7a58';
    ctx.fillRect(x + 112, y + 12, 28, 34);
    ctx.strokeStyle = '#eee3cb';
    ctx.strokeRect(x + 115, y + 15, 22, 28);
    ctx.strokeStyle = 'rgba(40,40,60,0.55)';
    ctx.beginPath();
    ctx.arc(x + 100, y + 38, 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(40,40,50,0.5)';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(x + 12, y + 28 + i * 12, 60 - (i % 2) * 14, 2);
    }
  });
  note(322, 88, 172, 118, 0.04, photo(172, 118, 7, 7, 7, 'figure', 3117, '#efe9dc'));
  // sticky note
  note(456, 64, 62, 62, 0.12, (x, y) => {
    ctx.fillStyle = '#f0d45a';
    ctx.fillRect(x, y, 62, 62);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = 'rgba(70,50,20,0.65)';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(x + 8, y + 16 + i * 11, 40 - ((i * 7) % 14), 2.5);
    }
  });
  note(94, 268, 106, 128, 0.1, photo(106, 128, 9, 9, 28, 'bust', 4401, '#f3f0e8'));
  note(212, 290, 100, 122, -0.08, photo(100, 122, 8, 8, 26, 'eye', 5233, '#f3f0e8'));
  note(372, 272, 168, 126, 0.03, photo(168, 126, 6, 6, 6, 'smoke', 6011, '#ece7da'));
  // photo-booth strip
  note(474, 244, 42, 146, 0.05, (x, y) => {
    ctx.fillStyle = '#e9e4d6';
    ctx.fillRect(x, y, 42, 146);
    ctx.shadowColor = 'transparent';
    for (let i = 0; i < 3; i++) {
      ctx.drawImage(artCanvas(i % 2 ? 'bust' : 'figure', 7000 + i * 31, 32, 40), x + 5, y + 5 + i * 46, 32, 40);
    }
  });
  return { tex: canvasTex(k, c, { srgb: true, repeat: false }), pins };
}

/** Small letter-board plaque. */
function signTexture(k: Kit): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 160);
  ctx.fillStyle = '#121214';
  ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = '#b58f4a';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, 492, 140);
  ctx.fillStyle = '#e8dcc0';
  ctx.font = '600 70px Georgia, "Times New Roman", serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const word = 'CONTACT';
  const gap = 14;
  let total = -gap;
  for (const ch of word) {
    total += ctx.measureText(ch).width + gap;
  }
  let x = 256 - total / 2;
  for (const ch of word) {
    ctx.fillText(ch, x, 70);
    x += ctx.measureText(ch).width + gap;
  }
  ctx.fillStyle = '#b58f4a';
  ctx.fillRect(176, 118, 160, 2);
  ctx.beginPath();
  ctx.moveTo(256, 112);
  ctx.lineTo(262, 119);
  ctx.lineTo(256, 126);
  ctx.lineTo(250, 119);
  ctx.fill();
  return canvasTex(k, c, { srgb: true, repeat: false });
}

/** String of small bordered prints (one atlas, one cell per print). */
const PHOTO_CELLS = 5;
function photoAtlas(k: Kit): THREE.CanvasTexture {
  const cw = 96;
  const ch = 128;
  const [c, ctx] = makeCanvas(cw * PHOTO_CELLS, ch);
  const kinds: Array<'bust' | 'figure' | 'still' | 'eye' | 'smoke'> = ['bust', 'figure', 'eye', 'still', 'smoke'];
  for (let i = 0; i < PHOTO_CELLS; i++) {
    ctx.fillStyle = '#efe9dc';
    ctx.fillRect(i * cw, 0, cw, ch);
    const bottom = i % 2 ? 22 : 7;
    ctx.drawImage(artCanvas(kinds[i], 811 + i * 53, cw - 14, ch - 7 - bottom), i * cw + 7, 7, cw - 14, ch - 7 - bottom);
  }
  return canvasTex(k, c, { srgb: true, repeat: false });
}

function haloTexture(k: Kit): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return canvasTex(k, c, { repeat: false });
}

function weaveTexture(k: Kit): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128, 128);
  const r = rng(5);
  ctx.fillStyle = '#b79660';
  ctx.fillRect(0, 0, 128, 128);
  const cell = 16;
  for (let j = 0; j < 8; j++) {
    for (let i = 0; i < 8; i++) {
      const over = (i + j) % 2 === 0;
      const t = 0.82 + r() * 0.3;
      ctx.fillStyle = `rgba(${Math.round(190 * t)},${Math.round(150 * t)},${Math.round(92 * t)},1)`;
      if (over) {
        ctx.fillRect(i * cell + 1, j * cell + 3, cell - 2, cell - 6);
      } else {
        ctx.fillRect(i * cell + 3, j * cell + 1, cell - 6, cell - 2);
      }
    }
  }
  ctx.fillStyle = 'rgba(40,24,8,0.28)';
  for (let j = 0; j < 8; j++) {
    ctx.fillRect(0, j * cell, 128, 1.5);
  }
  return canvasTex(k, c, { srgb: true, x: 12, y: 3 });
}

/**
 * "Contact corner": a vintage wall telephone above a small oak shelf (brass bell, notepad, card holder, letters, dried
 * flowers), a cork pin-board, a string of clipped prints with warm fairy lights, a hat and a rangefinder camera on a
 * hook rail, a tripod floor lamp and a basket of rolled prints.
 * Local frame: origin on the wall surface at floor level, +z out of the wall (the shell turns it onto the right wall),
 * +x towards the entrance door. It hangs on the right wall, between the portraits cluster and the entrance door.
 */
export function buildContactCorner(k: Kit): THREE.Group {
  const g = new THREE.Group();
  g.name = 'contactCorner';
  const black = lstd(k, 0x131416, 0.28, 0.25);
  const blackSoft = lstd(k, 0x1e1f22, 0.5, 0.1);
  const brass = lstd(k, 0xb58f4a, 0.3, 0.9);
  const oak = lstd(k, 0x8a6a45, 0.6);
  const paper = lstd(k, 0xe9e1cf, 0.9);
  const cream = lstd(k, 0xd8d0bc, 0.55);
  const felt = lstd(k, 0x4b4239, 0.95, 0, { side: THREE.DoubleSide });
  const leather = lstd(k, 0x5a3a24, 0.55);
  const twine = lstd(k, 0xc9b58a, 0.9);
  const ceramic = lstd(k, 0xe4dccb, 0.35);
  const stem = lstd(k, 0x8a7348, 0.9);
  const bloom = lstd(k, 0xb9835a, 0.9);
  const red = lstd(k, 0xc23a2c, 0.4);

  const lathe = (key: string, pts: number[][], seg = 24) =>
    k.geo(key, () => new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg));

  // soft occlusion halos on the wall and on the floor
  wallBlob(k, g, 0, 1.28, 0.003, 0.9, 0.95, 0.32);
  wallBlob(k, g, 0, 0.96, 0.003, 1.16, 0.4, 0.3);
  wallBlob(k, g, 0.58, 1.57, 0.003, 0.74, 0.64, 0.3);
  wallBlob(k, g, 1.06, 1.76, 0.003, 0.44, 0.4, 0.26);
  wallBlob(k, g, 1.24, 1.55, 0.003, 0.2, 0.62, 0.24);
  wallBlob(k, g, 0, 1.84, 0.003, 0.42, 0.18, 0.28);
  contactBlob(k, g, -0.55, 0.26, 0.62, 0.62, 0.5);
  contactBlob(k, g, 0.62, 0.2, 0.46, 0.44, 0.55);

  const a = new Assembly();
  const f = new Assembly(); // fine details, dropped in low quality

  /* ----- shelf + three brackets ----- */
  a.add(oak, k.rbox(0.9, 0.032, 0.21, 0.008), 0, 1.04, 0.105);
  for (const x of [-0.34, 0.34]) {
    a.add(black, k.box(0.014, 0.08, 0.012), x, 0.984, 0.008);
    a.add(black, k.box(0.014, 0.012, 0.15), x, 1.018, 0.085);
  }
  // wall plate + body of the telephone
  a.add(blackSoft, k.rbox(0.2, 0.3, 0.02, 0.01), 0, 1.5, 0.012);
  a.add(black, k.rbox(0.17, 0.18, 0.075, 0.03), 0, 1.45, 0.055);
  // cradle fork
  for (const x of [-0.056, 0.056]) {
    a.add(black, k.box(0.012, 0.045, 0.03), x, 1.565, 0.06);
  }
  // handset on the cradle: grip + two cups
  a.rod(black, -0.07, 1.592, 0.075, 0.07, 1.592, 0.075, 0.0125, 10);
  a.add(black, k.sphere(0.027, 12, 8), -0.088, 1.585, 0.075, { sy: 0.9, sz: 0.9 });
  a.add(black, k.sphere(0.027, 12, 8), 0.088, 1.585, 0.075, { sy: 0.9, sz: 0.9 });
  // dial
  a.add(cream, k.cyl(0.056, 0.056, 0.008, 28), 0, 1.45, 0.095, { rx: Math.PI / 2 });
  a.add(black, k.cyl(0.026, 0.026, 0.01, 20), 0, 1.45, 0.1, { rx: Math.PI / 2 });
  for (let i = 0; i < 10; i++) {
    const t = Math.PI * 0.75 + (i / 9) * Math.PI * 1.45;
    a.add(black, k.cyl(0.0058, 0.0058, 0.006, 8), Math.cos(t) * 0.04, 1.45 + Math.sin(t) * 0.04, 0.1, { rx: Math.PI / 2 });
  }
  a.add(brass, k.cyl(0.006, 0.006, 0.012, 8), 0.03, 1.405, 0.102, { rx: Math.PI / 2 });

  /* ----- shelf items ----- */
  const SH = 1.056;
  // brass service bell
  const bellGeo = lathe('contact-bell', [[0.001, 0], [0.042, 0], [0.043, 0.004], [0.038, 0.018], [0.026, 0.03], [0.012, 0.037], [0.001, 0.04]]);
  a.add(brass, bellGeo, 0.2, SH, 0.115);
  a.add(brass, k.sphere(0.008, 8, 6), 0.2, SH + 0.043, 0.115);
  a.add(black, k.cyl(0.044, 0.044, 0.004, 20), 0.2, SH + 0.002, 0.115);
  // notepad + pencil
  a.add(paper, k.box(0.11, 0.014, 0.15), -0.2, SH + 0.007, 0.105, { ry: 0.18 });
  a.add(blackSoft, k.box(0.112, 0.003, 0.152), -0.2, SH + 0.014, 0.105, { ry: 0.18 });
  a.rod(brass, -0.13, SH + 0.021, 0.14, -0.21, SH + 0.021, 0.04, 0.003, 6);
  // business-card holder with fanned cards
  a.add(brass, k.rbox(0.092, 0.008, 0.052, 0.003), -0.375, SH + 0.004, 0.1);
  a.add(black, k.box(0.09, 0.05, 0.004), -0.375, SH + 0.03, 0.078, { rx: -0.22 });
  a.add(brass, k.box(0.092, 0.018, 0.003), -0.375, SH + 0.017, 0.124);
  for (let i = 0; i < 5; i++) {
    f.add(cream, k.box(0.08, 0.048, 0.0016), -0.375 + (i - 2) * 0.0015, SH + 0.031, 0.083 + i * 0.0072, { rx: -0.22 - i * 0.02 });
  }
  // stack of letters tied with twine
  for (let i = 0; i < 4; i++) {
    f.add(i % 2 ? paper : cream, k.box(0.17, 0.0042, 0.105), 0.0 + (i % 2) * 0.004, SH + 0.0022 + i * 0.0042, 0.11, { ry: -0.12 + i * 0.09 });
  }
  f.add(twine, k.box(0.006, 0.0186, 0.108), 0.0, SH + 0.0086, 0.11, { ry: -0.03 });
  f.add(red, k.box(0.022, 0.0006, 0.026), 0.055, SH + 0.0178, 0.095, { ry: 0.06 });
  // bud vase with dried flowers
  const vaseGeo = lathe('contact-vase', [[0.001, 0], [0.022, 0], [0.027, 0.014], [0.03, 0.04], [0.021, 0.074], [0.012, 0.094], [0.015, 0.108], [0.012, 0.11]], 16);
  a.add(ceramic, vaseGeo, 0.36, SH, 0.1);
  const heads: Array<[number, number, number]> = [
    [0.0, 0.0, 0.27],
    [0.026, 0.01, 0.23],
    [-0.024, 0.014, 0.24],
    [0.012, -0.024, 0.2],
    [-0.016, -0.018, 0.255],
    [0.036, -0.012, 0.18],
    [-0.034, 0.0, 0.19],
  ];
  for (const [dx, dz, h] of heads) {
    f.rod(stem, 0.36 + dx * 0.15, SH + 0.1, 0.1 + dz * 0.15, 0.36 + dx, SH + h, 0.1 + dz, 0.0013, 4);
    f.add(bloom, k.sphere(0.0085, 6, 5), 0.36 + dx, SH + h + 0.006, 0.1 + dz, { sy: 1.9 });
  }

  /* ----- letter-board sign above the phone ----- */
  a.add(black, k.rbox(0.32, 0.1, 0.016, 0.004), 0, 1.84, 0.009);
  for (const sx of [-0.145, 0.145]) {
    for (const sy of [-0.04, 0.04]) {
      a.add(brass, k.cyl(0.004, 0.004, 0.004, 8), sx, 1.84 + sy, 0.018, { rx: Math.PI / 2 });
    }
  }
  put(g, k.plane(0.3, 0.094), lstd(k, 0xffffff, 0.5, 0, { map: signTexture(k) }), 0, 1.84, 0.0172, { receive: false });

  /* ----- pin-board ----- */
  const BX = 0.58;
  const BY = 1.57;
  const bw = 0.5;
  const bh = 0.38;
  a.add(oak, k.rbox(bw + 0.05, bh + 0.05, 0.024, 0.006), BX, BY, 0.013);
  const board = boardTexture(k, bw, bh);
  put(g, k.plane(bw, bh), lstd(k, 0xffffff, 0.92, 0, { map: board.tex }), BX, BY, 0.0255, { receive: false });
  for (const p of board.pins) {
    f.add(red, k.sphere(0.0055, 8, 6), BX + p[0], BY + p[1], 0.0295, { sz: 0.8 });
  }

  /* ----- hook rail: felt hat + rangefinder camera on its strap ----- */
  const RX = 1.14;
  const RY = 1.82;
  a.add(oak, k.rbox(0.38, 0.034, 0.02, 0.005), RX, RY, 0.012);
  for (const hx of [1.04, 1.24]) {
    a.rod(black, hx, RY, 0.02, hx, RY, 0.075, 0.0055, 6);
    a.rod(black, hx, RY, 0.075, hx, RY + 0.028, 0.085, 0.0055, 6);
    a.add(black, k.sphere(0.0075, 8, 6), hx, RY + 0.029, 0.086);
  }
  // hat: hangs by its inside from the first hook, opening towards the wall
  const hatGeo = lathe('contact-hat', [
    [0.001, 0.098], [0.045, 0.1], [0.066, 0.094], [0.074, 0.078], [0.076, 0.03], [0.095, 0.016], [0.128, 0.013], [0.133, 0.008],
    [0.128, 0.003], [0.092, 0.0], [0.068, 0.0], [0.068, 0.05], [0.064, 0.09], [0.001, 0.093],
  ], 28);
  const bandGeo = lathe('contact-hatband', [[0.0765, 0.022], [0.0775, 0.024], [0.0775, 0.044], [0.0765, 0.046]], 28);
  const hatTilt = { rx: 1.3, ry: 0, rz: 0.04 };
  a.add(felt, hatGeo, 1.04, 1.775, 0.062, hatTilt);
  a.add(leather, bandGeo, 1.04, 1.775, 0.062, hatTilt);
  // camera strap: flat leather loop over the second hook down to the camera lugs
  const CX = 1.24;
  const strapCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.05, 1.425, 0.05),
    new THREE.Vector3(-0.04, 1.6, 0.045),
    new THREE.Vector3(-0.012, 1.835, 0.075),
    new THREE.Vector3(0, 1.852, 0.089),
    new THREE.Vector3(0.012, 1.835, 0.075),
    new THREE.Vector3(0.04, 1.6, 0.045),
    new THREE.Vector3(0.05, 1.425, 0.05),
  ]);
  const strapGeo = new THREE.TubeGeometry(strapCurve, 40, 0.0062, 6, false);
  strapGeo.scale(1.9, 1, 0.8);
  strapGeo.computeVertexNormals();
  a.add(leather, strapGeo, CX, 0, 0);
  // rangefinder camera
  a.add(black, k.rbox(0.116, 0.062, 0.04, 0.006), CX, 1.38, 0.03);
  a.add(brass, k.rbox(0.118, 0.016, 0.042, 0.004), CX, 1.4225, 0.03);
  a.add(brass, k.rbox(0.118, 0.01, 0.042, 0.004), CX, 1.3445, 0.03);
  a.add(black, k.cyl(0.021, 0.021, 0.034, 20), CX + 0.004, 1.378, 0.066, { rx: Math.PI / 2 });
  a.add(brass, k.cyl(0.019, 0.019, 0.006, 20), CX + 0.004, 1.378, 0.085, { rx: Math.PI / 2 });
  a.add(blackSoft, k.cyl(0.0145, 0.0145, 0.004, 16), CX + 0.004, 1.378, 0.0885, { rx: Math.PI / 2 });
  a.add(brass, k.cyl(0.009, 0.009, 0.01, 12), CX + 0.04, 1.4375, 0.03);
  a.add(cream, k.box(0.014, 0.01, 0.002), CX - 0.045, 1.38, 0.0505);
  a.add(cream, k.box(0.014, 0.01, 0.002), CX - 0.026, 1.38, 0.0505);
  for (const sx of [-1, 1]) {
    a.add(brass, k.box(0.008, 0.012, 0.01), CX + sx * 0.05, 1.4165, 0.05);
  }

  /* ----- fairy lights + clipped prints on a string above ----- */
  const bulbMat = k.glow(0xffc27a, 2.4);
  const haloMat = k.glow(0xffb464, 0.5, {
    map: haloTexture(k),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const bulbs = new Assembly();
  const halos = new Assembly();
  const photos = new Assembly();
  const atlas = lstd(k, 0xffffff, 0.7, 0, { map: photoAtlas(k) });
  const photoGeo = (i: number) =>
    k.geo(`contact-photo-${i}`, () => {
      const p = new THREE.PlaneGeometry(0.075, 0.1);
      const uv = p.attributes.uv as THREE.BufferAttribute;
      for (let n = 0; n < uv.count; n++) {
        uv.setX(n, (i + uv.getX(n)) / PHOTO_CELLS);
      }
      return p;
    });
  const hooks: Pt[] = [[-0.5, 2.22], [0.35, 2.24], [1.2, 2.22]];
  let photoIdx = 0;
  for (let s = 0; s < hooks.length - 1; s++) {
    const [x0, y0] = hooks[s];
    const [x1, y1] = hooks[s + 1];
    const at = (u: number): THREE.Vector3 =>
      new THREE.Vector3(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u - 0.15 * 4 * u * (1 - u), 0.016);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      pts.push(at(i / 12));
    }
    a.add(twine, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0016, 4, false), 0, 0, 0);
    a.add(brass, k.cyl(0.004, 0.004, 0.012, 6), x0, y0, 0.016);
    for (let i = 0; i < 12; i++) {
      const p = at((i + 0.5) / 12);
      bulbs.add(bulbMat, k.sphere(0.0085, 8, 6), p.x, p.y - 0.017, 0.02, { sy: 1.2 });
      f.add(brass, k.cyl(0.0034, 0.0034, 0.012, 6), p.x, p.y - 0.005, 0.017);
      halos.add(haloMat, k.plane(0.1, 0.1), p.x, p.y - 0.017, 0.024);
    }
    if (s === 1) {
      for (let i = 0; i < 5; i++) {
        const p = at(0.1 + i * 0.19);
        const rz = (i % 2 ? 1 : -1) * (0.04 + 0.03 * ((i * 7) % 3));
        photos.add(atlas, photoGeo(photoIdx % PHOTO_CELLS), p.x, p.y - 0.062, 0.0125, { rz });
        f.add(oak, k.box(0.008, 0.026, 0.008), p.x, p.y - 0.012, 0.0185, { rz });
        photoIdx++;
      }
    }
  }
  a.add(brass, k.cyl(0.004, 0.004, 0.012, 6), hooks[2][0], hooks[2][1], 0.016);

  /* ----- tripod floor lamp (linen drum shade) ----- */
  const LX = -0.55;
  const LZ = 0.26;
  const hubY = 0.98;
  for (let i = 0; i < 3; i++) {
    const ang = Math.PI * 0.5 + (i / 3) * Math.PI * 2;
    a.rod(oak, LX, hubY, LZ, LX + Math.cos(ang) * 0.17, 0.01, LZ + Math.sin(ang) * 0.17 * 0.9 + 0.02, 0.0115, 6);
    a.add(brass, k.sphere(0.0125, 8, 6), LX + Math.cos(ang) * 0.17, 0.012, LZ + Math.sin(ang) * 0.17 * 0.9 + 0.02);
  }
  a.add(brass, k.cyl(0.026, 0.02, 0.05, 12), LX, hubY, LZ);
  a.rod(black, LX, hubY, LZ, LX, 1.36, LZ, 0.0065, 6);
  a.add(brass, k.cyl(0.016, 0.016, 0.03, 10), LX, 1.37, LZ);
  const shadeGeo = k.geo('contact-shade', () => new THREE.LatheGeometry([new THREE.Vector2(0.135, 0), new THREE.Vector2(0.105, 0.22)], 20));
  const shade = put(g, shadeGeo, k.glow(0xffc886, 0.62, { side: THREE.DoubleSide }), LX, 1.36, LZ, { receive: false, name: 'contactShade' });
  shade.renderOrder = 1;
  a.add(black, k.cyl(0.108, 0.108, 0.004, 20), LX, 1.58, LZ);
  halos.add(haloMat, k.plane(0.7, 0.7), LX, 1.5, LZ + 0.12);

  /* ----- woven basket with rolled prints ----- */
  const KX = 0.62;
  const KZ = 0.2;
  const basketGeo = lathe('contact-basket', [[0.001, 0], [0.11, 0], [0.135, 0.02], [0.152, 0.12], [0.16, 0.24], [0.164, 0.27], [0.155, 0.275], [0.15, 0.2], [0.12, 0.04], [0.001, 0.035]], 20);
  const basketMat = lstd(k, 0xffffff, 0.85, 0, { map: weaveTexture(k), side: THREE.DoubleSide });
  const basket = put(g, basketGeo, basketMat, KX, 0.0, KZ, { receive: false, name: 'contactBasket' });
  void basket;
  const rolls: Array<[number, number, number]> = [[0.2, 0.1, 0.42], [1.5, 0.1, 0.38], [2.6, 0.09, 0.45], [3.7, 0.1, 0.36], [4.8, 0.09, 0.4]];
  rolls.forEach(([ang, lean, len], i) => {
    const bx = KX + Math.cos(ang) * 0.06;
    const bz = KZ + Math.sin(ang) * 0.06;
    a.rod(i % 2 ? paper : cream, bx, 0.1, bz, bx + Math.cos(ang) * lean, 0.1 + len, bz + Math.sin(ang) * lean, 0.019, 10);
    f.rod(twine, bx + Math.cos(ang) * lean * 0.8, 0.1 + len * 0.8, bz + Math.sin(ang) * lean * 0.8, bx + Math.cos(ang) * lean * 0.8, 0.1 + len * 0.8 + 0.008, bz + Math.sin(ang) * lean * 0.8, 0.02, 10);
  });

  /* ----- coiled phone cord ----- */
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 90; i++) {
    const u = i / 90;
    const t = u * Math.PI * 2 * 9;
    pts.push(new THREE.Vector3(-0.09 + 0.012 * Math.cos(t) - 0.03 * u, 1.575 - 0.17 * u + 0.012 * Math.sin(t), 0.085 + 0.03 * Math.sin(u * Math.PI)));
  }
  a.add(black, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 220, 0.0028, 4), 0, 0, 0);

  a.flush(g, { cast: false });
  photos.flush(g, { cast: false });
  bulbs.flush(g, { cast: false, receive: false });
  for (const m of halos.flush(g, { cast: false, receive: false })) {
    m.renderOrder = 3;
  }
  const fine = new THREE.Group();
  fine.name = 'contactFine';
  g.add(fine);
  f.flush(fine, { cast: false });
  onLivingQuality((q) => {
    fine.visible = q === 'high';
  });
  return g;
}
