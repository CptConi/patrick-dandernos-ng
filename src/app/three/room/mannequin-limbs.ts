import * as THREE from 'three';
import { ArmPose, LegPose } from './mannequin-pose';
import { V3, prof, tube } from './mannequin-surf';

/** Hands (long tapering fingers, gentle curl) and black stilettos. */

/** Matrix taking hand-local coordinates (Y fingers, Z back of the hand, origin at the wrist) to the figure frame. */
export function handMatrix(arm: ArmPose): THREE.Matrix4 {
  const y = arm.fwd.clone().normalize();
  const z = arm.up.clone().addScaledVector(y, -arm.up.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(arm.W);
}

/** Palm, four fingers and a thumb. `ts` = +1 when the thumb sits at local +X (left hand), -1 for the right. */
export function handGeos(arm: ArmPose, ts: number, hi: boolean): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const nu = hi ? 14 : 8;
  out.push(
    tube([V3(0, -0.016, 0), V3(0, 0.0, 0.0015), V3(0, 0.045, 0.0025), V3(0, 0.088, 0.0005)], {
      nu: hi ? 20 : 12,
      nv: hi ? 14 : 8,
      hint: V3(1, 0, 0),
      a: prof([[0, 0.0245], [0.18, 0.0285], [0.55, 0.0365], [0.82, 0.0375], [1, 0.034]]),
      b: prof([[0, 0.0125], [0.4, 0.0135], [0.8, 0.0125], [1, 0.0105]]),
      pow: () => 2.5,
      capEnd: 0.55,
    })
  );
  const xs = [0.0265, 0.0092, -0.0085, -0.0245];
  const spread = [0.045, 0.0, -0.04, -0.1];
  const len = [0.076, 0.086, 0.078, 0.064];
  const mult = [0.8, 0.9, 1.05, 1.25];
  for (let i = 0; i < 4; i++) {
    const L = len[i];
    const seg = [0.46 * L, 0.3 * L, 0.24 * L];
    let th = -arm.curl[0] * mult[i];
    const a = spread[i] * ts;
    const pts = [V3(ts * xs[i], 0.087, 0.0)];
    for (let s = 0; s < 3; s++) {
      const d = V3(Math.sin(a) * Math.cos(th), Math.cos(a) * Math.cos(th), Math.sin(th)).normalize();
      pts.push(pts[s].clone().addScaledVector(d, seg[s]));
      if (s < 2) {
        th -= arm.curl[s + 1] * mult[i];
      }
    }
    out.push(
      tube(pts, {
        nu,
        nv: hi ? 12 : 6,
        hint: V3(1, 0, 0),
        a: prof([[0, 0.0084], [0.45, 0.0074], [0.75, 0.0063], [1, 0.0052]]),
        b: prof([[0, 0.0078], [0.45, 0.0069], [0.75, 0.0058], [1, 0.0049]]),
        capEnd: 1,
        capRows: 4,
      })
    );
  }
  out.push(
    tube([V3(ts * 0.02, 0.012, -0.006), V3(ts * 0.036, 0.034, -0.011), V3(ts * 0.046, 0.058, -0.012), V3(ts * 0.0505, 0.079, -0.011)], {
      nu,
      nv: hi ? 12 : 6,
      hint: V3(1, 0, 0),
      a: prof([[0, 0.0125], [0.4, 0.0105], [0.75, 0.0088], [1, 0.0072]]),
      b: prof([[0, 0.0115], [0.4, 0.0098], [0.75, 0.0082], [1, 0.0068]]),
      capEnd: 1,
      capRows: 4,
    })
  );
  return out;
}

/* ---------- shoe ---------- */

/** Ankle centre in the shoe frame (origin on the floor under the heel tip, +Z toe, +Y up). */
export const SHOE_ANKLE = V3(0, 0.168, 0.05);

/** Black pump with a pointed toe and a 9 cm stiletto; the instep stays ivory (bare foot). */
export function shoeGeos(hi: boolean): THREE.BufferGeometry[] {
  const geos: THREE.BufferGeometry[] = [];
  const pts = [V3(0, 0.115, 0.012), V3(0, 0.116, 0.045), V3(0, 0.09, 0.095), V3(0, 0.057, 0.15), V3(0, 0.031, 0.195), V3(0, 0.03, 0.235), V3(0, 0.032, 0.248)];
  const upper = tube(pts, {
    nu: hi ? 36 : 16,
    nv: hi ? 40 : 18,
    hint: V3(1, 0, 0),
    a: prof([[0, 0.02], [0.05, 0.026], [0.14, 0.0285], [0.35, 0.0305], [0.585, 0.0335], [0.775, 0.0325], [0.86, 0.0235], [0.945, 0.009], [1, 0.003]]),
    b: prof([[0, 0.026], [0.14, 0.03], [0.35, 0.0275], [0.585, 0.0235], [0.775, 0.0175], [0.86, 0.0135], [0.945, 0.0105], [1, 0.007]]),
    pow: () => 2.5,
    capStart: 0.7,
    capEnd: 0.5,
    // planar top-down projection: the shoe texture carries the oval opening of the vamp (instep)
    uv: (u, v, p) => [p.x / 0.09 + 0.5, p.z / 0.27],
  });
  geos.push(upper);
  // stiletto heel (all black: its uvs sit in the black corner of the shoe texture)
  const heel =
    tube([V3(0, 0.094, 0.034), V3(0, 0.05, 0.024), V3(0, 0.003, 0.0135)], {
      nu: hi ? 16 : 8,
      nv: hi ? 14 : 6,
      hint: V3(1, 0, 0),
      a: prof([[0, 0.0145], [0.35, 0.0105], [1, 0.0058]]),
      b: prof([[0, 0.0155], [0.35, 0.0115], [1, 0.0058]]),
      capEnd: 0.5,
      capRows: 3,
      uv: () => [0.02, 0.02],
    });
  geos.push(heel);
  return geos;
}

/** Placement of a shoe so that its ankle lands on `leg.A` with the shank aligned to the leg. */
export function shoeMatrix(leg: LegPose, yaw: number, plantar: number): THREE.Matrix4 {
  const shank = leg.K.clone().sub(leg.A).normalize();
  const qAlign = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), shank);
  const qLocal = new THREE.Quaternion().setFromEuler(new THREE.Euler(plantar, yaw, 0, 'YXZ'));
  const q = qAlign.multiply(qLocal);
  const m = new THREE.Matrix4().compose(V3(0, 0, 0), q, V3(1, 1, 1));
  const ankle = SHOE_ANKLE.clone().applyMatrix4(m);
  m.setPosition(leg.A.clone().sub(ankle));
  return m;
}

/** Bare ankle + instep skin inside the shoe. */
export function ankleGeo(leg: LegPose, hi: boolean): THREE.BufferGeometry {
  const { K, A } = leg;
  const dir = A.clone().sub(K);
  const path = [K.clone().addScaledVector(dir, 0.72), K.clone().addScaledVector(dir, 0.88), A.clone().addScaledVector(dir, 0.04)];
  return tube(path, {
    nu: hi ? 18 : 10,
    nv: hi ? 10 : 5,
    hint: V3(0, 0, 1),
    a: prof([[0, 0.03], [0.5, 0.026], [0.85, 0.0235], [1, 0.0225]]),
    b: prof([[0, 0.031], [0.5, 0.0275], [0.85, 0.0255], [1, 0.0245]]),
    capEnd: 0.9,
  });
}
