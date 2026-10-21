import * as THREE from 'three';
import { Assembly, Kit, Xf } from './kit';
import { contactBlob, lin, lstd, makeWood, onLivingQuality } from './living-util';

export interface ArtistMannequinOpts {
  /** Standing height of the figure (metres, default 0.5: a desk-top lay figure). */
  height?: number;
}

type Rot = [number, number, number];

interface Placed {
  node: THREE.Object3D;
  mat: THREE.Material;
  geo: THREE.BufferGeometry;
}

/**
 * Artist's lay figure: a jointed beechwood drawing mannequin (egg head, ball joints, tapered limbs, mitten hands) held
 * by a black steel tripod stand with a pole clamped around its waist. Brass pivot screws on every joint.
 * Built at 1 m tall in a small kinematic rig (baked into three merged meshes), then scaled to `opts.height`.
 * Origin on the surface the stand rests on, the figure faces +Z. Left / right below are the figure's own (+x = left).
 */
export function buildArtistMannequin(k: Kit, opts: ArtistMannequinOpts = {}): THREE.Group {
  const height = opts.height ?? 0.5;
  const g = new THREE.Group();
  g.name = 'artistMannequin';
  g.userData.height = height;

  /* ----- materials ----- */
  const wood = makeWood(k, 313, '#dcb985', '#a47a45', { w: 256, h: 256, grain: 170, vertical: true });
  const woodMat = new THREE.MeshPhysicalMaterial({
    color: lin(0xffffff),
    map: wood.map,
    normalMap: wood.normal,
    normalScale: new THREE.Vector2(0.22, 0.22),
    roughness: 0.52,
    clearcoat: 0.35,
    clearcoatRoughness: 0.32,
  });
  const jointMat = new THREE.MeshPhysicalMaterial({
    color: lin(0xe0b890),
    map: wood.map,
    normalMap: wood.normal,
    normalScale: new THREE.Vector2(0.22, 0.22),
    roughness: 0.5,
    clearcoat: 0.4,
    clearcoatRoughness: 0.3,
  });
  onLivingQuality((q) => {
    const hi = q === 'high';
    for (const m of [woodMat, jointMat]) {
      m.clearcoat = hi ? (m === woodMat ? 0.35 : 0.4) : 0;
      m.normalMap = hi ? wood.normal : null;
      m.needsUpdate = true;
    }
  });
  const brass = lstd(k, 0xb58f4a, 0.28, 0.9);
  const steel = lstd(k, 0x15161a, 0.35, 0.6);

  /* ----- geometry ----- */
  const lathe = (key: string, pts: number[][], seg = 18) =>
    k.geo(key, () => new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg));
  /** Tapered limb hanging from the origin down to -len, with a slight muscle belly. */
  const limb = (key: string, r0: number, r1: number, len: number, belly: number) =>
    k.geo(key, () => {
      const pts: THREE.Vector2[] = [];
      const n = 8;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        pts.push(new THREE.Vector2(r0 + (r1 - r0) * t + belly * Math.sin(Math.PI * t), t * len));
      }
      return new THREE.LatheGeometry(pts, 14).translate(0, -len, 0);
    });
  const egg = k.geo('amq-egg', () => {
    const pts: THREE.Vector2[] = [];
    const n = 20;
    for (let i = 0; i <= n; i++) {
      const phi = (i / n) * Math.PI;
      pts.push(new THREE.Vector2(Math.max(0.0008, 0.0545 * Math.sin(phi) * (1 - 0.15 * Math.cos(phi))), 0.0725 * (1 - Math.cos(phi))));
    }
    return new THREE.LatheGeometry(pts, 24);
  });
  const chest = lathe('amq-chest', [
    [0.001, 0], [0.045, 0], [0.06, 0.015], [0.072, 0.05], [0.082, 0.095], [0.087, 0.14], [0.079, 0.172], [0.056, 0.19], [0.03, 0.2], [0.001, 0.205],
  ]);
  const pelvis = lathe('amq-pelvis', [
    [0.001, -0.042], [0.05, -0.042], [0.075, -0.022], [0.087, 0.01], [0.085, 0.04], [0.07, 0.068], [0.05, 0.086], [0.001, 0.09],
  ]);

  /* ----- rig ----- */
  const rig = new THREE.Group();
  g.add(rig);
  const placed: Placed[] = [];
  const joint = (parent: THREE.Object3D, x: number, y: number, z: number, r: Rot = [0, 0, 0]): THREE.Object3D => {
    const n = new THREE.Object3D();
    n.position.set(x, y, z);
    n.rotation.set(r[0], r[1], r[2]);
    parent.add(n);
    return n;
  };
  const part = (n: THREE.Object3D, mat: THREE.Material, geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, o: Xf = {}) => {
    const c = new THREE.Object3D();
    c.position.set(x, y, z);
    c.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
    c.scale.set(o.sx === undefined ? 1 : o.sx, o.sy === undefined ? 1 : o.sy, o.sz === undefined ? 1 : o.sz);
    n.add(c);
    placed.push({ node: c, mat, geo });
    return c;
  };
  /** Ball joint + brass pivot screw on its outer side (`side` = -1 / +1 along x). */
  const ball = (n: THREE.Object3D, r: number, side: number) => {
    part(n, jointMat, k.sphere(r, 14, 10));
    part(n, brass, k.cyl(r * 0.34, r * 0.34, r * 0.62, 8), side * r * 0.92, 0, 0, { rz: Math.PI / 2 });
    part(n, brass, k.cyl(r * 0.2, r * 0.2, r * 0.7, 6), side * r * 0.97, 0, 0, { rz: Math.PI / 2 });
  };

  const P = joint(rig, 0, 0.505, 0, [0, 0.1, -0.05]);
  part(P, woodMat, pelvis, 0, 0, 0, { sz: 0.72 });

  // legs: weight on the right one, the left knee relaxed and its foot on the toes
  const legs: Array<{ side: number; hip: Rot; knee: Rot; ankle: Rot }> = [
    { side: 1, hip: [-0.3, 0, 0.13], knee: [0.58, 0, 0], ankle: [0.5, 0, -0.05] },
    { side: -1, hip: [0.02, 0, 0.1], knee: [0.04, 0, 0], ankle: [-0.06, 0, -0.05] },
  ];
  const feet: THREE.Object3D[] = [];
  for (const L of legs) {
    const hip = joint(P, L.side * 0.056, 0, 0, L.hip);
    ball(hip, 0.03, L.side);
    part(hip, woodMat, limb('amq-thigh', 0.027, 0.02, 0.24, 0.004));
    const knee = joint(hip, 0, -0.24, 0, L.knee);
    ball(knee, 0.024, L.side);
    part(knee, woodMat, limb('amq-shin', 0.021, 0.0155, 0.215, 0.004));
    const ankle = joint(knee, 0, -0.215, 0, L.ankle);
    ball(ankle, 0.018, L.side);
    feet.push(part(ankle, woodMat, k.rbox(0.052, 0.034, 0.12, 0.014), 0, -0.033, 0.032));
  }

  // torso
  const W = joint(P, 0, 0.105, 0, [0.04, -0.22, 0.12]);
  ball(W, 0.032, 1);
  part(W, jointMat, k.cyl(0.03, 0.03, 0.04, 10), 0, 0.0, 0);
  const C = joint(W, 0, 0.012, 0);
  part(C, woodMat, chest, 0, 0, 0, { sz: 0.66 });

  // neck + head: tilted towards the desk, looking slightly down
  const N = joint(C, 0, 0.212, 0, [0.14, -0.3, 0]);
  ball(N, 0.02, 1);
  part(N, woodMat, k.cyl(0.017, 0.019, 0.04, 10), 0, 0.02, 0);
  const H = joint(N, 0, 0.034, 0.004, [0.05, 0, 0.2]);
  part(H, woodMat, egg, 0, 0, 0.008, { sz: 1.1 });

  // arms: the left one waves, the right hand rests on the hip
  const arm = (side: number, sh: Rot, el: Rot, wr: Rot) => {
    const S = joint(C, side * 0.108, 0.176, 0, sh);
    ball(S, 0.026, side);
    part(S, woodMat, limb('amq-uarm', 0.022, 0.0165, 0.15, 0.003));
    const E = joint(S, 0, -0.15, 0, el);
    ball(E, 0.02, side);
    part(E, woodMat, limb('amq-farm', 0.0165, 0.0125, 0.135, 0.003));
    const Wr = joint(E, 0, -0.135, 0, wr);
    ball(Wr, 0.0135, side);
    // mitten hand + thumb
    part(Wr, woodMat, k.sphere(0.03, 12, 10), 0, -0.05, 0, { sx: 0.82, sy: 1.65, sz: 0.4 });
    part(Wr, woodMat, k.sphere(0.011, 8, 6), -side * 0.0215, -0.034, 0.006, { sy: 1.7, rz: -side * 0.35 });
  };
  arm(1, [-0.3, 0.1, 2.2], [0, 0, 0.85], [0, 0, 0.5]);
  arm(-1, [0.2, 0, -0.75], [-0.35, 0, 1.6], [0, 0, 0.35]);

  /* ----- bake the posed rig ----- */
  rig.updateMatrixWorld(true);
  let minY = Infinity;
  const v = new THREE.Vector3();
  for (const f of feet) {
    const p = placed.find((q) => q.node === f);
    if (p) {
      const pos = p.geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        minY = Math.min(minY, v.fromBufferAttribute(pos, i).applyMatrix4(f.matrixWorld).y);
      }
    }
  }
  const PLATE = 0.057;
  rig.position.y = PLATE - (isFinite(minY) ? minY : 0);
  rig.updateMatrixWorld(true);
  const a = new Assembly();
  for (const p of placed) {
    a.add(p.mat, p.geo.clone().applyMatrix4(p.node.matrixWorld));
  }

  /* ----- stand: tripod, round plate, pole clamped around the waist ----- */
  const waistY = rig.position.y + 0.505 + 0.105;
  a.add(steel, k.cyl(0.14, 0.14, 0.014, 32), 0, PLATE - 0.007, 0);
  a.add(brass, new THREE.TorusGeometry(0.14, 0.0035, 6, 40), 0, PLATE, 0, { rx: Math.PI / 2 });
  for (let i = 0; i < 3; i++) {
    const t = Math.PI + ((i - 1) * 2 * Math.PI) / 3;
    const ex = Math.sin(t) * 0.215;
    const ez = Math.cos(t) * 0.215;
    a.rod(steel, 0, 0.044, 0, ex, 0.008, ez, 0.0075, 6);
    a.add(steel, k.sphere(0.011, 8, 6), ex, 0.008, ez, { sy: 0.7 });
  }
  a.add(steel, k.cyl(0.03, 0.036, 0.03, 14), 0, 0.03, 0);
  a.rod(steel, 0, PLATE, -0.118, 0, waistY + 0.04, -0.118, 0.0058, 8);
  a.add(brass, k.cyl(0.011, 0.011, 0.02, 10), 0, PLATE + 0.01, -0.118);
  a.add(brass, k.sphere(0.0085, 8, 6), 0, waistY + 0.042, -0.118);
  a.rod(steel, 0, waistY, -0.118, 0, waistY, -0.052, 0.0048, 6);
  a.add(brass, new THREE.TorusGeometry(0.054, 0.0045, 6, 28), 0, waistY, 0, { rx: Math.PI / 2 });
  a.add(brass, k.box(0.016, 0.016, 0.02), 0, waistY, -0.055);
  a.flush(g, { cast: true });

  contactBlob(k, g, 0, -0.01, 0.62, 0.6, 0.6);
  g.scale.setScalar(height);
  return g;
}
