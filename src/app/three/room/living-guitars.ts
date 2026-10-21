import * as THREE from 'three';
import { Kit, put } from './kit';
import {
  Bag,
  canvasTex,
  contactBlob,
  makeCanvas,
  makeWood,
  onLivingQuality,
  outlineShape,
  smoothExtrude, lstd, lin } from './living-util';

/** Instrument stand (A-frame tripod with foam cradles). Origin on the floor. */
export function buildGuitarStand(k: Kit, parent: THREE.Object3D): void {
  const tube = lstd(k, 0x0d0d0f, 0.42, 0.55);
  const foam = lstd(k, 0x1b1b1e, 0.95);
  const rubber = lstd(k, 0x050506, 0.9);
  const b = new Bag();
  const R = 0.0075;
  const hub: THREE.Vector3Tuple = [0, 0.2, 0];
  b.rod(tube, [-0.19, 0.016, 0.13], hub, R, 8);
  b.rod(tube, [0.19, 0.016, 0.13], hub, R, 8);
  b.rod(tube, [0, 0.016, -0.23], hub, R, 8);
  b.rod(tube, hub, [0, 0.64, -0.06], R, 8);
  // body cradle (lower arms) + neck yoke (upper)
  b.rod(tube, [-0.1, 0.15, 0.015], [0.1, 0.15, 0.015], R, 8);
  b.rod(tube, [0, 0.19, 0.0], [0, 0.15, 0.015], R * 0.9, 6);
  b.rod(tube, [-0.06, 0.62, -0.055], [0.06, 0.62, -0.055], R * 0.9, 8);
  b.rod(tube, [-0.06, 0.62, -0.055], [-0.06, 0.62, 0.03], R * 0.9, 8);
  b.rod(tube, [0.06, 0.62, -0.055], [0.06, 0.62, 0.03], R * 0.9, 8);
  // foam pads and rubber caps
  b.add(foam, k.cyl(0.015, 0.015, 0.07, 10), -0.1, 0.15, 0.015, { rz: Math.PI / 2 });
  b.add(foam, k.cyl(0.015, 0.015, 0.07, 10), 0.1, 0.15, 0.015, { rz: Math.PI / 2 });
  b.add(foam, k.cyl(0.012, 0.012, 0.1, 10), -0.06, 0.62, 0.0, { rx: Math.PI / 2 });
  b.add(foam, k.cyl(0.012, 0.012, 0.1, 10), 0.06, 0.62, 0.0, { rx: Math.PI / 2 });
  for (const p of [[-0.19, 0.13], [0.19, 0.13], [0, -0.23]]) {
    b.add(rubber, k.sphere(0.012, 8, 6), p[0], 0.012, p[1], { sy: 0.8 });
  }
  b.add(rubber, k.cyl(0.014, 0.014, 0.03, 8), 0, 0.2, 0);
  b.flush(parent, { cast: true });
}

/** Chrome / gold hardware helpers */
function metals(k: Kit) {
  return {
    gold: lstd(k, 0xd5ad52, 0.26, 1),
    chrome: lstd(k, 0xd6d9dd, 0.16, 1),
    nickel: lstd(k, 0xbfc2c6, 0.3, 1),
    black: lstd(k, 0x0c0c0e, 0.35, 0.1),
  };
}

function taperBoxGeo(wBottom: number, wTop: number, h: number, len: number): THREE.BufferGeometry {
  // y from 0 (bottom, width wBottom) to len (top, width wTop)
  const g = new THREE.BoxGeometry(1, len, h, 1, 1, 1);
  g.translate(0, len / 2, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / len;
    p.setX(i, p.getX(i) * (wBottom + (wTop - wBottom) * t));
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Drops the flat +Z cap triangles of an extruded (non-indexed) body: a separate plate sits exactly in that plane, so
 * no two surfaces are ever coplanar (they z-fought in the 16-bit depth buffer of the post-fx render target).
 */
function withoutFrontCap(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src;
  g.computeBoundingBox();
  const zMax = (g.boundingBox as THREE.Box3).max.z;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const keep: number[] = [];
  for (let i = 0; i < pos.count; i += 3) {
    const cap = [0, 1, 2].every((j) => Math.abs(pos.getZ(i + j) - zMax) < 1e-5);
    if (!cap) {
      keep.push(i, i + 1, i + 2);
    }
  }
  const out = new THREE.BufferGeometry();
  const P = new Float32Array(keep.length * 3);
  const N = new Float32Array(keep.length * 3);
  const U = new Float32Array(keep.length * 2);
  keep.forEach((v, j) => {
    P.set([pos.getX(v), pos.getY(v), pos.getZ(v)], j * 3);
    N.set([nor.getX(v), nor.getY(v), nor.getZ(v)], j * 3);
    U.set([uv.getX(v), uv.getY(v)], j * 2);
  });
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  return out;
}

/**
 * Thin parts laid on a surface (frets, inlays, veneers, rosette) get a small polygon offset: it is expressed in
 * depth-buffer resolution units, so they win the depth test at any distance (a plain 1 mm gap does not at 2.5 m+).
 */
function decal(k: Kit, color: number, rough: number, metal = 0, units = -1): THREE.MeshStandardMaterial {
  return lstd(k, color, rough, metal, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: units });
}

function headstockShape(): THREE.Shape {
  const pts: Array<[number, number]> = [
    [-0.026, 0], [0.026, 0], [0.033, 0.03], [0.039, 0.1], [0.037, 0.15], [0.022, 0.178], [0, 0.184],
    [-0.022, 0.178], [-0.037, 0.15], [-0.039, 0.1], [-0.033, 0.03],
  ];
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    s.lineTo(pts[i][0], pts[i][1]);
  }
  s.closePath();
  return s;
}

/** Epiphone-style white Les Paul Custom on its stand. */
export function buildLesPaulRich(k: Kit): THREE.Group {
  const g = new THREE.Group();
  g.name = 'lesPaul';
  const { gold, chrome, black } = metals(k);

  buildGuitarStand(k, g);

  const gt = new THREE.Group();
  gt.rotation.x = -0.1;
  gt.position.set(0, 0, 0.02);
  g.add(gt);

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: lin(0xdad4c0),
    roughness: 0.3,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.07,
  });
  const bindMat = lstd(k, 0xe2d6a8, 0.4);
  const fretMat = decal(k, 0xbfc2c6, 0.3, 1);
  const bindStrip = decal(k, 0xe2d6a8, 0.4);
  const board = new THREE.MeshStandardMaterial({ color: lin(0x1f130d), roughness: 0.55 });
  const neckWood = lstd(k, 0x7a5233, 0.5);
  const inlay = decal(k, 0xf1ecd8, 0.35, 0, -2);
  const head = new THREE.MeshPhysicalMaterial({ color: lin(0x0b0b0c), roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06 });
  const stringMat = lstd(k, 0xd7d9dc, 0.25, 1);
  const pearl = lstd(k, 0xf4efe0, 0.25);
  onLivingQuality((q) => {
    bodyMat.clearcoat = q === 'high' ? 1 : 0;
    head.clearcoat = q === 'high' ? 1 : 0;
    bodyMat.needsUpdate = true;
    head.needsUpdate = true;
  });

  const YB = 0.37; // body centre height
  const outline: Array<[number, number]> = [
    [0, -0.236], [0.07, -0.232], [0.13, -0.205], [0.163, -0.15], [0.17, -0.08], [0.152, -0.025], [0.125, 0.02],
    [0.108, 0.06], [0.09, 0.105], [0.082, 0.15], [0.072, 0.19], [0.05, 0.215], [0, 0.225], [-0.05, 0.226],
    [-0.105, 0.213], [-0.147, 0.175], [-0.158, 0.12], [-0.145, 0.07], [-0.122, 0.02], [-0.145, -0.03],
    [-0.17, -0.09], [-0.172, -0.14], [-0.145, -0.195], [-0.09, -0.228],
  ];
  const scaled = (s: number) => outline.map((p) => [p[0] * s, p[1] * s] as [number, number]);

  // ---- body: extruded outline with bevel + arched maple-style top dome
  const bodyGeo = k.geo('lp-body-rich', () =>
    smoothExtrude(
      new THREE.ExtrudeGeometry(outlineShape(scaled(0.972), 140), {
        depth: 0.026,
        bevelEnabled: true,
        bevelThickness: 0.008,
        bevelSize: 0.008,
        bevelSegments: 4,
        curveSegments: 1,
      }).translate(0, 0, -0.013)
    )
  );
  const domeGeo = k.geo('lp-dome-rich', () =>
    smoothExtrude(
      new THREE.ExtrudeGeometry(outlineShape(scaled(0.88), 140), {
        depth: 0.0005,
        bevelEnabled: true,
        bevelThickness: 0.013,
        bevelSize: 0.022,
        bevelSegments: 7,
        curveSegments: 1,
      }).translate(0, 0, 0.021)
    )
  );
  const bodyBag = new Bag();
  bodyBag.add(bodyMat, bodyGeo, 0, YB, 0);
  bodyBag.add(bodyMat, domeGeo, 0, YB, 0);
  // cream binding running around the top edge
  const bindCurve = new THREE.CatmullRomCurve3(
    scaled(0.99).map((p) => new THREE.Vector3(p[0], p[1], 0.0215)),
    true,
    'centripetal'
  );
  bodyBag.flush(gt, { cast: true });
  // the 5 mm binding cord does not cast: its thin shadow aliased into a dotted dark line along the whole rim
  const bindBag = new Bag();
  bindBag.tube(bindMat, bindCurve, 0.0026, 150, 6, {});
  bindBag.flush(gt, { cast: false });

  // ---- hardware on the top (body-local z = 0.0335 at the flat of the dome)
  const hw = new Bag();
  const ZT = 0.0335;
  const pickup = (y: number) => {
    hw.add(black, k.box(0.084, 0.052, 0.006), 0, y, ZT + 0.003);
    hw.add(gold, k.box(0.07, 0.04, 0.011), 0, y, ZT + 0.0095);
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 6; i++) {
        hw.add(chrome, k.cyl(0.0021, 0.0021, 0.003, 6), -0.0275 + i * 0.011, y + (r ? 0.011 : -0.011), ZT + 0.016, {
          rx: Math.PI / 2,
        });
      }
    }
    // mounting screws
    hw.add(chrome, k.cyl(0.003, 0.003, 0.003, 6), -0.036, y, ZT + 0.007, { rx: Math.PI / 2 });
    hw.add(chrome, k.cyl(0.003, 0.003, 0.003, 6), 0.036, y, ZT + 0.007, { rx: Math.PI / 2 });
  };
  const yNeckPu = YB + 0.038;
  const yBridgePu = YB - 0.05;
  pickup(yNeckPu);
  pickup(yBridgePu);
  // tune-o-matic bridge + stop tailpiece
  const yBridge = YB - 0.075;
  const yTail = YB - 0.125;
  hw.add(chrome, k.box(0.078, 0.009, 0.007), 0, yBridge, ZT + 0.0105);
  for (let i = 0; i < 6; i++) {
    hw.add(chrome, k.box(0.006, 0.006, 0.006), -0.026 + i * 0.0105, yBridge, ZT + 0.0155);
  }
  for (const sx of [-1, 1]) {
    hw.add(chrome, k.cyl(0.0035, 0.0035, 0.016, 8), sx * 0.043, yBridge, ZT + 0.008, { rx: Math.PI / 2 });
    hw.add(chrome, k.cyl(0.0065, 0.0065, 0.004, 10), sx * 0.043, yBridge, ZT + 0.016, { rx: Math.PI / 2 });
    hw.add(chrome, k.cyl(0.0045, 0.0045, 0.012, 8), sx * 0.044, yTail, ZT + 0.005, { rx: Math.PI / 2 });
  }
  hw.add(chrome, k.rbox(0.092, 0.02, 0.011, 0.004), 0, yTail, ZT + 0.0095);
  // knobs: 2 volumes + 2 tones
  for (const p of [[0.058, -0.105], [0.102, -0.085], [0.074, -0.152], [0.118, -0.132]]) {
    hw.add(black, k.cyl(0.0125, 0.0145, 0.019, 14), p[0], YB + p[1], ZT + 0.003, { rx: Math.PI / 2 });
    hw.add(gold, k.cyl(0.0105, 0.0105, 0.0026, 14), p[0], YB + p[1], ZT + 0.0145, { rx: Math.PI / 2 });
  }
  // 3-way toggle with amber tip
  hw.add(gold, k.cyl(0.011, 0.011, 0.004, 10), -0.107, YB + 0.094, ZT + 0.0, { rx: Math.PI / 2 });
  hw.add(chrome, k.cyl(0.0022, 0.0022, 0.028, 6), -0.107, YB + 0.094, ZT + 0.014, { rx: Math.PI / 2 + 0.25 });
  hw.add(pearl, k.sphere(0.0058, 8, 6), -0.107, YB + 0.094, ZT + 0.029);
  // strap button + end pin
  hw.add(gold, k.cyl(0.006, 0.006, 0.016, 8), 0, YB - 0.248, 0, { rz: 0 });
  hw.flush(gt, { cast: false });

  // ---- neck group tilted so the strings keep a ~2 mm action over frets
  const NECK_PIVOT_Y = 0.47;
  const NUT_Y = 0.924;
  const LOC_NUT = NUT_Y - NECK_PIVOT_Y;
  const tilt = -0.0507;
  const neck = new THREE.Group();
  neck.position.set(0, NECK_PIVOT_Y, 0.034);
  neck.rotation.x = tilt;
  gt.add(neck);
  const nb = new Bag();
  const fbLen = LOC_NUT + 0.004;
  // fingerboard (top at local z = 0), neck wood behind it
  nb.add(board, taperBoxGeo(0.056, 0.043, 0.007, fbLen), 0, 0, -0.0035);
  nb.add(neckWood, taperBoxGeo(0.05, 0.04, 0.019, fbLen + 0.04), 0, -0.04, -0.0165);
  // binding strips follow the taper of the fingerboard (56 mm at the body end -> 43 mm at the nut)
  const bindAng = Math.atan(0.0065 / fbLen);
  nb.add(bindStrip, k.box(0.0016, fbLen, 0.0075), -0.02475, fbLen / 2, -0.0035, { rz: -bindAng });
  nb.add(bindStrip, k.box(0.0016, fbLen, 0.0075), 0.02475, fbLen / 2, -0.0035, { rz: bindAng });
  const L = 0.629;
  const d = (n: number) => L * (1 - Math.pow(2, -n / 12));
  const wAt = (y: number) => 0.043 + ((LOC_NUT - y) / LOC_NUT) * 0.013;
  for (let n = 1; n <= 22; n++) {
    const y = LOC_NUT - d(n);
    nb.add(fretMat, k.box(wAt(y) - 0.002, 0.0022, 0.0014), 0, y, 0.0003);
  }
  for (const n of [3, 5, 7, 9, 15, 17, 19, 21]) {
    const y = LOC_NUT - (d(n) + d(n - 1)) / 2;
    nb.add(inlay, k.cyl(0.0036, 0.0036, 0.0008, 10), 0, y, 0.0007, { rx: Math.PI / 2 });
  }
  const y12 = LOC_NUT - (d(12) + d(11)) / 2;
  nb.add(inlay, k.cyl(0.0034, 0.0034, 0.0008, 10), -0.009, y12, 0.0007, { rx: Math.PI / 2 });
  nb.add(inlay, k.cyl(0.0034, 0.0034, 0.0008, 10), 0.009, y12, 0.0007, { rx: Math.PI / 2 });
  nb.add(pearl, k.box(0.044, 0.0035, 0.0045), 0, LOC_NUT + 0.002, -0.001); // nut
  nb.flush(neck, { cast: false });

  // ---- headstock angled back, with tuners
  const hs = new THREE.Group();
  hs.position.set(0, LOC_NUT + 0.004, -0.0035);
  hs.rotation.x = -0.26;
  neck.add(hs);
  const hsGeo = k.geo('lp-head-rich', () =>
    new THREE.ExtrudeGeometry(headstockShape(), {
      depth: 0.01,
      bevelEnabled: true,
      bevelThickness: 0.0015,
      bevelSize: 0.0015,
      bevelSegments: 2,
      curveSegments: 1,
    }).translate(0, 0, -0.011)
  );
  put(hs, hsGeo, head, 0, 0, 0, { cast: false });
  const hb = new Bag();
  // plates laid on the head face (z = 0.0005): decals, so they never z-fight with it
  hb.add(decal(k, 0xf4efe0, 0.25, 0, -2), k.box(0.03, 0.045, 0.0012), 0, 0.12, 0.0012); // logo plate hint
  hb.add(decal(k, 0x0c0c0e, 0.35, 0.1, -2), k.box(0.024, 0.036, 0.0012), 0, 0.027, 0.0015); // truss rod cover
  hb.add(decal(k, 0xd5ad52, 0.26, 1, -2), k.box(0.012, 0.004, 0.0012), 0, 0.14, 0.0018);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const y = 0.042 + i * 0.047;
      hb.add(gold, k.cyl(0.0042, 0.0042, 0.012, 8), sx * 0.0255, y, -0.002, { rx: Math.PI / 2 });
      hb.add(gold, k.cyl(0.006, 0.006, 0.0016, 10), sx * 0.0255, y, 0.0045, { rx: Math.PI / 2 });
      hb.add(gold, k.cyl(0.0016, 0.0016, 0.016, 6), sx * 0.039, y, -0.006, { rz: Math.PI / 2 });
      hb.add(pearl, k.rbox(0.0085, 0.017, 0.007, 0.0025), sx * 0.052, y, -0.006);
    }
  }
  hb.flush(hs, { cast: false });

  // ---- strings (tailpiece -> bridge -> nut)
  const sb = new Bag();
  const zBridge = ZT + 0.0155 + 0.003;
  const nutPoint = (i: number): THREE.Vector3Tuple => {
    const local = new THREE.Vector3((i - 2.5) * 0.0072, LOC_NUT, 0.0036);
    local.applyEuler(neck.rotation).add(neck.position);
    return [local.x, local.y, local.z];
  };
  const rr = [0.0017, 0.0014, 0.0011, 0.0008, 0.0006, 0.0005];
  for (let i = 0; i < 6; i++) {
    const bx = (i - 2.5) * 0.0105;
    sb.rod(stringMat, [(i - 2.5) * 0.0078, yTail + 0.002, ZT + 0.021], [bx, yBridge, zBridge], rr[i], 4);
    sb.rod(stringMat, [bx, yBridge, zBridge], nutPoint(i), rr[i], 4);
  }
  sb.flush(gt, { cast: false });

  contactBlob(k, g, 0, -0.04, 0.56, 0.62, 0.6);
  contactBlob(k, g, 0, -0.03, 0.4, 0.4, 0.55);
  return g;
}

/** Classical guitar: figure-8 body, spruce top with rosette, rosewood bridge, nylon strings. */
export function buildAcousticRich(k: Kit): THREE.Group {
  const g = new THREE.Group();
  g.name = 'acoustic';
  const { gold } = metals(k);
  const fretMat = decal(k, 0xbfc2c6, 0.3, 1);
  const dotMat = decal(k, 0xe8dfc6, 0.5);
  const veneer = decal(k, 0x2d170d, 0.5);
  const headInlay = decal(k, 0x1b120c, 0.5, 0, -2);
  buildGuitarStand(k, g);
  const gt = new THREE.Group();
  gt.rotation.x = -0.1;
  gt.position.set(0, 0, 0.02);
  g.add(gt);

  const wood = makeWood(k, 17, '#d9a45c', '#8a5420', { grain: 260, vertical: true, w: 512, h: 512 });
  wood.map.repeat.set(4, 4);
  wood.normal.repeat.set(4, 4);
  const topMat = new THREE.MeshPhysicalMaterial({
    map: wood.map,
    normalMap: wood.normal,
    normalScale: new THREE.Vector2(0.35, 0.35),
    color: lin(0xffffff),
    roughness: 0.42,
    clearcoat: 0.5,
    clearcoatRoughness: 0.35,
  });
  const sideMat = lstd(k, 0x4b2515, 0.45);
  const dark = lstd(k, 0x1b120c, 0.5);
  const rose = lstd(k, 0x2d170d, 0.5);
  const neckMat = lstd(k, 0xa56f3d, 0.5);
  const cream = lstd(k, 0xe8dfc6, 0.5);
  const nylon = new THREE.MeshStandardMaterial({ color: lin(0xe4e0d0), roughness: 0.35, transparent: true, opacity: 0.85 });
  const wound = lstd(k, 0xb9bcc0, 0.3, 1);
  onLivingQuality((q) => {
    topMat.clearcoat = q === 'high' ? 0.5 : 0;
    topMat.normalMap = q === 'high' ? wood.normal : null;
    topMat.needsUpdate = true;
  });

  const YC = 0.36;
  const half: Array<[number, number]> = [
    [0, -0.25], [0.085, -0.247], [0.155, -0.215], [0.19, -0.15], [0.188, -0.085], [0.15, -0.03], [0.112, 0.0],
    [0.108, 0.04], [0.125, 0.09], [0.14, 0.15], [0.125, 0.205], [0.075, 0.238], [0, 0.246],
  ];
  const full: Array<[number, number]> = half.slice();
  for (let i = half.length - 2; i >= 1; i--) {
    full.push([-half[i][0], half[i][1]]);
  }
  const bodyShape = outlineShape(full, 160);
  const bodyGeo = k.geo('ac-body-rich', () =>
    withoutFrontCap(
      smoothExtrude(
        new THREE.ExtrudeGeometry(bodyShape, {
          depth: 0.074,
          bevelEnabled: true,
          bevelThickness: 0.009,
          bevelSize: 0.006,
          bevelSegments: 3,
          curveSegments: 1,
        }).translate(0, 0, -0.037)
      )
    )
  );
  put(gt, bodyGeo, sideMat, 0, YC, 0, { cast: true });
  // the soundboard IS the front cap (exactly 0.037 + 0.009): the body has none, so nothing is coplanar with it
  const topGeo = k.geo('ac-top-rich', () => new THREE.ShapeGeometry(bodyShape, 1));
  const ZT = 0.046;
  put(gt, topGeo, topMat, 0, YC, ZT, { cast: true, receive: true });

  // purfling line + soundhole with rosette
  const pur = new THREE.CatmullRomCurve3(
    full.map((p) => new THREE.Vector3(p[0] * 0.965, p[1] * 0.972, ZT + 0.0008)),
    true,
    'centripetal'
  );
  const tb = new Bag();
  tb.tube(dark, pur, 0.0016, 140, 4);
  tb.flush(gt, { cast: false });
  const roseTex = (() => {
    const [c, ctx] = makeCanvas(256, 256);
    ctx.fillStyle = '#0b0705';
    ctx.fillRect(0, 0, 256, 256);
    const ring = (r0: number, r1: number, col: string) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(128, 128, r1, 0, Math.PI * 2);
      ctx.arc(128, 128, r0, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
    };
    ctx.fillStyle = '#030201'; // soundhole interior
    ctx.beginPath();
    ctx.arc(128, 128, 90, 0, Math.PI * 2);
    ctx.fill();
    ring(88, 94, '#e9dfc4');
    ring(98, 118, '#8a5a2c');
    ring(104, 112, '#2a190d');
    ring(120, 126, '#e9dfc4');
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      ctx.strokeStyle = i % 2 ? '#f0e6ca' : '#4a2c16';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(a) * 99, 128 + Math.sin(a) * 99);
      ctx.lineTo(128 + Math.cos(a) * 117, 128 + Math.sin(a) * 117);
      ctx.stroke();
    }
    return canvasTex(k, c, { srgb: true, repeat: false });
  })();
  const roseMat = new THREE.MeshStandardMaterial({
    map: roseTex,
    roughness: 0.55,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const hole = new THREE.Mesh(k.geo('ac-rosette', () => new THREE.CircleGeometry(0.0625, 64)), roseMat);
  hole.position.set(0, 0.4, ZT + 0.0012);
  hole.receiveShadow = true;
  gt.add(hole);

  // bridge, saddle, tie block
  const yBridge = YC - 0.135;
  const bb = new Bag();
  // (sunk 1 mm into the soundboard so no face is coplanar with it)
  bb.add(rose, k.rbox(0.16, 0.03, 0.011, 0.004), 0, yBridge, ZT + 0.0045);
  bb.add(rose, k.box(0.15, 0.012, 0.007), 0, yBridge + 0.012, ZT + 0.0125, {});
  bb.add(cream, k.box(0.108, 0.003, 0.0045), 0, yBridge + 0.0075, ZT + 0.0155);
  for (let i = 0; i < 6; i++) {
    bb.add(cream, k.sphere(0.0028, 8, 6), (i - 2.5) * 0.0105, yBridge - 0.008, ZT + 0.012);
  }
  bb.flush(gt, { cast: false });

  // ---- neck
  const NECK_Y = 0.555;
  const NUT_Y = YC - 0.135 + 0.65 + 0.003;
  const LOC_NUT = NUT_Y - NECK_Y;
  const neck = new THREE.Group();
  neck.position.set(0, NECK_Y, 0.0555);
  neck.rotation.x = -0.022;
  gt.add(neck);
  const nb = new Bag();
  const LS = 0.65;
  const dn = (n: number) => LS * (1 - Math.pow(2, -n / 12));
  const yEnd = LOC_NUT - dn(19);
  const fbLen = LOC_NUT - yEnd + 0.004;
  const wAt = (y: number) => 0.052 + ((LOC_NUT - y) / (LOC_NUT - yEnd)) * 0.018;
  // fingerboard: ebony, tapered
  nb.add(rose, taperBoxGeo(0.07, 0.052, 0.006, fbLen), 0, yEnd, -0.003);
  nb.add(neckMat, taperBoxGeo(0.064, 0.05, 0.02, LOC_NUT - yEnd + 0.12), 0, yEnd - 0.12, -0.016);
  for (let n = 1; n <= 19; n++) {
    const y = LOC_NUT - dn(n);
    nb.add(fretMat, k.box(wAt(y) - 0.003, 0.0018, 0.002), 0, y, 0.0004);
  }
  for (const n of [3, 5, 7, 9, 15]) {
    nb.add(dotMat, k.cyl(0.0028, 0.0028, 0.0012, 12), 0, LOC_NUT - (dn(n) + dn(n - 1)) / 2, 0.0006, { rx: Math.PI / 2 });
  }
  nb.add(cream, k.box(0.05, 0.003, 0.004), 0, LOC_NUT + 0.0015, -0.001); // nut
  nb.flush(neck, { cast: false });

  // slotted headstock
  const hs = new THREE.Group();
  hs.position.set(0, LOC_NUT + 0.003, -0.004);
  hs.rotation.x = -0.24;
  neck.add(hs);
  const hsShape = (() => {
    const s = new THREE.Shape();
    s.moveTo(-0.026, 0);
    s.lineTo(0.026, 0);
    s.lineTo(0.034, 0.04);
    s.lineTo(0.039, 0.14);
    s.quadraticCurveTo(0.04, 0.19, 0, 0.19);
    s.quadraticCurveTo(-0.04, 0.19, -0.039, 0.14);
    s.lineTo(-0.034, 0.04);
    s.closePath();
    return s;
  })();
  put(
    hs,
    k.geo('ac-head', () => new THREE.ExtrudeGeometry(hsShape, { depth: 0.012, bevelEnabled: false }).translate(0, 0, -0.012)),
    neckMat,
    0,
    0,
    0,
    {}
  );
  const hb = new Bag();
  // rosewood veneer following the headstock outline (a 1.2 mm decal, not a box poking out of the shape)
  hb.add(
    veneer,
    k.geo('ac-head-veneer', () => new THREE.ShapeGeometry(hsShape, 4).translate(0, -0.095, 0).scale(0.9, 0.93, 1).translate(0, 0.095, 0)),
    0,
    0,
    0.0012
  );
  hb.add(headInlay, k.box(0.012, 0.06, 0.0016), 0, 0.055, 0.0024);
  hb.add(headInlay, k.box(0.012, 0.06, 0.0016), 0, 0.135, 0.0024);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const y = 0.035 + i * 0.045;
      hb.add(gold, k.cyl(0.004, 0.004, 0.02, 8), sx * 0.039, y, -0.006, { rz: Math.PI / 2 });
      hb.add(cream, k.rbox(0.008, 0.019, 0.006, 0.0025), sx * 0.052, y, -0.006);
      hb.add(gold, k.box(0.012, 0.0045, 0.0018), sx * 0.048, y, -0.012);
    }
  }
  hb.flush(hs, { cast: false });

  // strings: 3 nylon + 3 wound, bridge saddle -> nut
  const sb = new Bag();
  const sr = [0.0016, 0.0013, 0.0011, 0.001, 0.0009, 0.0008];
  const zSaddle = ZT + 0.0185;
  for (let i = 0; i < 6; i++) {
    const nutLocal = new THREE.Vector3((i - 2.5) * 0.0083, LOC_NUT, 0.0033).applyEuler(neck.rotation).add(neck.position);
    sb.rod(i < 3 ? wound : nylon, [(i - 2.5) * 0.0105, yBridge + 0.0075, zSaddle], [nutLocal.x, nutLocal.y, nutLocal.z], sr[i], 4);
  }
  sb.flush(gt, { cast: false });

  contactBlob(k, g, 0, -0.04, 0.56, 0.62, 0.6);
  contactBlob(k, g, 0, -0.03, 0.4, 0.4, 0.55);
  return g;
}
