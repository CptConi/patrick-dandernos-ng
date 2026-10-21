import * as THREE from 'three';
import { Kit } from './kit';
import { rng } from '../procedural-textures';
import {
  Bag,
  contactBlob,
  fabricNormalMap,
  loopCurve,
  onLivingQuality,
  pillowGeo,
  roundRectLoop,
  softBoxGeo,
  sstep, lstd, lin } from './living-util';

/** Grey-blue bed-sofa with piped seams, sagging seat cushions and three fringed cushions. */
export function buildSofaRich(k: Kit): THREE.Group {
  const g = new THREE.Group();
  g.name = 'sofa';
  const nm = fabricNormalMap(k);

  const fabric = new THREE.MeshPhysicalMaterial({
    color: lin(0x3b4658),
    roughness: 0.96,
    sheen: 0.3,
    sheenColor: new THREE.Color(lin(0x586d8a)),
    sheenRoughness: 0.6,
    normalMap: nm,
    normalScale: new THREE.Vector2(0.75, 0.75),
  });
  const rustMat = new THREE.MeshPhysicalMaterial({
    color: lin(0x652a18),
    roughness: 0.98,
    sheen: 0.25,
    sheenColor: new THREE.Color(lin(0x9a5036)),
    sheenRoughness: 0.7,
    normalMap: nm,
    normalScale: new THREE.Vector2(0.45, 0.45),
  });
  const creamMat = new THREE.MeshPhysicalMaterial({
    color: lin(0xc8c2b4),
    roughness: 1,
    sheen: 0.25,
    sheenColor: new THREE.Color(lin(0xe8e4d8)),
    sheenRoughness: 0.8,
    normalMap: nm,
    normalScale: new THREE.Vector2(0.4, 0.4),
  });
  const fringeRust = new THREE.MeshStandardMaterial({ color: lin(0xb4502f), roughness: 1, side: THREE.DoubleSide });
  const fringeCream = new THREE.MeshStandardMaterial({ color: lin(0xd8d2c4), roughness: 1, side: THREE.DoubleSide });
  const thread = new THREE.MeshStandardMaterial({ color: lin(0xe7eaee), roughness: 0.8 });
  const feet = lstd(k, 0x121214, 0.5, 0.2);
  onLivingQuality((q) => {
    for (const m of [fabric, rustMat, creamMat]) {
      m.sheen = q === 'high' ? (m === fabric ? 0.3 : 0.25) : 0;
      m.normalMap = q === 'high' ? nm : null;
      m.needsUpdate = true;
    }
  });

  const bag = new Bag();
  const baseAo = (p: THREE.Vector3) => 0.55 + 0.45 * sstep(0.03, 0.34, p.y);

  // plinth, arms, back, seat
  bag.add(fabric, softBoxGeo(1.72, 0.2, 0.84, 0.035, { uv: 12 }), 0, 0.16, 0, { ao: baseAo });
  for (const sx of [-1, 1]) {
    bag.add(fabric, softBoxGeo(0.2, 0.54, 0.86, 0.065, { uv: 12, bulge: 0.006 }), sx * 0.77, 0.33, 0, {
      ao: (p) => baseAo(p) * (0.9 + 0.1 * sstep(0.2, 0.5, p.y)),
    });
  }
  for (const sx of [-1, 1]) {
    bag.add(fabric, softBoxGeo(0.675, 0.46, 0.2, 0.07, { uv: 12, bulge: 0.012 }), sx * 0.338, 0.55, -0.31, {
      rx: -0.1,
      aoLocal: (p) => 0.78 + 0.22 * sstep(-0.23, 0.0, p.y),
    });
    bag.add(fabric, softBoxGeo(0.66, 0.16, 0.62, 0.055, { uv: 12, sag: 0.014, bulge: 0.008 }), sx * 0.336, 0.34, 0.1, {
      aoLocal: (p) => 0.8 + 0.2 * sstep(-0.08, 0.04, p.y),
    });
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      bag.add(feet, k.cyl(0.024, 0.02, 0.07, 8), sx * 0.8, 0.035, sz * 0.38);
    }
  }
  // piped / top-stitched seams (white thread loops)
  const rnd = rng(31);
  const loops: Array<[number, number, number, number, number, 'xz' | 'xy', number]> = [];
  for (const sx of [-1, 1]) {
    loops.push([sx * 0.77, 0.607, 0, 0.13, 0.8, 'xz', 0.04]); // arm tops
    loops.push([sx * 0.77, 0.33, 0.433, 0.13, 0.46, 'xy', 0.04]); // arm fronts
    loops.push([sx * 0.336, 0.0, 0.1, 0.6, 0.56, 'xz', 0.04]); // seat tops
  }
  for (const L of loops) {
    const [cx, cy, cz, lw, ld, plane, r] = L;
    const pts = roundRectLoop(lw, ld, r, (u, v) => {
      if (plane === 'xz') {
        // seat cushions sag slightly in the middle
        const isSeat = cy === 0;
        const tt = v / (0.31);
        const uu = u / 0.33;
        const y = isSeat ? 0.42 - 0.006 * (1 - uu * uu) * (1 - tt * tt) + 0.0015 : cy;
        return new THREE.Vector3(cx + u, y, cz + v);
      }
      return new THREE.Vector3(cx + u, cy + v, cz);
    });
    bag.tube(thread, loopCurve(pts), 0.0017, 56, 3);
  }
  // deep crease between the two back cushions
  bag.add(feet, k.box(0.006, 0.4, 0.05), 0, 0.55, -0.31, { color: 0x555555 });
  bag.flush(g, { cast: true });

  // cushions -------------------------------------------------------
  const cush = new THREE.Group();
  g.add(cush);
  const cb = new Bag();
  const fb = new Bag();
  const qy = new THREE.Quaternion();
  const qx = new THREE.Quaternion();
  const qs = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const Y = new THREE.Vector3(0, 1, 0);
  const X = new THREE.Vector3(1, 0, 0);
  const placeMatrix = (x: number, y: number, z: number, yaw: number, lean: number, spin: number) => {
    qy.setFromAxisAngle(Y, yaw);
    qx.setFromAxisAngle(X, Math.PI / 2 - lean);
    qs.setFromAxisAngle(Y, spin);
    qy.multiply(qx).multiply(qs);
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), qy, one);
  };
  const strip = new THREE.BoxGeometry(0.05, 0.0018, 0.004).translate(0.025, 0, 0);
  const cushion = (
    mat: THREE.Material,
    fmat: THREE.Material,
    w: number,
    d: number,
    thick: number,
    m: THREE.Matrix4,
    edges: Array<'+x' | '-x' | '+z' | '-z'>,
    perEdge: number
  ) => {
    cb.push(mat, pillowGeo(w, d, thick), m, {
      aoLocal: (p) => 0.74 + 0.26 * Math.min(1, (1 - Math.pow(p.x / (w / 2), 2)) * (1 - Math.pow(p.z / (d / 2), 2)) * 3.2),
    });
    const t = new THREE.Matrix4();
    const e = new THREE.Euler();
    const q = new THREE.Quaternion();
    for (const edge of edges) {
      const alongX = edge === '+z' || edge === '-z';
      const len = alongX ? w : d;
      for (let i = 0; i < perEdge; i++) {
        const s = ((i + 0.5) / perEdge - 0.5) * (len * 0.9);
        const sgn = edge[0] === '+' ? 1 : -1;
        const px = alongX ? s : sgn * (w / 2 - 0.004);
        const pz = alongX ? sgn * (d / 2 - 0.004) : s;
        const yaw = (rnd() - 0.5) * 0.5 + (alongX ? (sgn > 0 ? -Math.PI / 2 : Math.PI / 2) : sgn > 0 ? 0 : Math.PI);
        e.set((rnd() - 0.5) * 0.3, yaw, (rnd() - 0.5) * 0.6 - 0.15);
        q.setFromEuler(e);
        t.compose(new THREE.Vector3(px, 0, pz), q, new THREE.Vector3(0.7 + rnd() * 0.6, 1, 0.8 + rnd() * 0.5));
        t.premultiply(m);
        fb.push(fmat, strip, t, { color: 0xffffff });
      }
    }
  };
  cushion(rustMat, fringeRust, 0.43, 0.4, 0.125, placeMatrix(0.46, 0.64, -0.115, -0.3, 0.32, 0.1), ['+x'], 36);
  cushion(
    creamMat,
    fringeCream,
    0.4,
    0.4,
    0.11,
    placeMatrix(-0.04, 0.635, -0.155, 0.12, 0.33, 0.62),
    ['+x', '-x', '+z', '-z'],
    22
  );
  cushion(rustMat, fringeRust, 0.42, 0.38, 0.12, placeMatrix(-0.53, 0.6, -0.135, 0.22, 0.3, -0.08), ['-x'], 32);
  cb.flush(cush, { cast: true });
  fb.flush(cush, { cast: false });

  // soft contact shadows
  contactBlob(k, g, 0, 0, 2.05, 1.2, 0.55);
  contactBlob(k, g, 0, 0.02, 1.7, 0.95, 0.5);
  return g;
}
