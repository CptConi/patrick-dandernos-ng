import * as THREE from 'three';
import { V3 } from './mannequin-surf';

/**
 * Skeleton of the seated mannequin (local frame: origin on the floor under the stool, figure faces +Z,
 * her left side is +X). Shared by the body, cloth and prop builders so every part agrees on the pose.
 */

export const SEAT = 0.615;
export const HIP_Y = SEAT + 0.083;

/** Head frame: origin at the skull centre, +Y up, +Z forward. */
export const HEAD = {
  pos: V3(0.004, 1.478, 0.036),
  pitch: 0.05,
  yaw: 0.17,
  roll: -0.06,
};

export function headMatrix(): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(HEAD.pitch, HEAD.yaw, HEAD.roll, 'YXZ'));
  return new THREE.Matrix4().compose(HEAD.pos, q, new THREE.Vector3(1, 1, 1));
}

export interface ArmPose {
  /** shoulder joint, elbow, wrist */
  S: THREE.Vector3;
  E: THREE.Vector3;
  W: THREE.Vector3;
  /** direction of the hand (wrist -> middle finger) and of the back of the hand */
  fwd: THREE.Vector3;
  up: THREE.Vector3;
  /** finger flexion at MCP / PIP / DIP (radians) */
  curl: [number, number, number];
}

export const ARM: { L: ArmPose; R: ArmPose } = {
  L: {
    S: V3(0.165, 1.2, -0.012),
    E: V3(0.19, 0.94, -0.07),
    W: V3(0.136, 0.757, 0.1),
    fwd: V3(0.03, -0.28, 0.95).normalize(),
    up: V3(0.18, 1, 0.28).normalize(),
    curl: [0.05, 0.24, 0.32],
  },
  R: {
    S: V3(-0.165, 1.214, -0.018),
    E: V3(-0.19, 0.95, 0.02),
    W: V3(-0.035, 0.83, 0.165),
    fwd: V3(0.55, 0.1, 0.83).normalize(),
    up: V3(0.0, 1, -0.1).normalize(),
    curl: [0.08, 0.28, 0.34],
  },
};

export interface LegPose {
  /** hip joint and the spine of the thigh down to the knee */
  thigh: THREE.Vector3[];
  K: THREE.Vector3;
  A: THREE.Vector3;
}

/** Her left leg is under (foot planted), her right leg crosses over it at the knee and dangles. */
export const LEG: { L: LegPose; R: LegPose } = {
  L: {
    thigh: [V3(0.088, HIP_Y, -0.02), V3(0.092, HIP_Y - 0.001, 0.12), V3(0.097, HIP_Y - 0.012, 0.2), V3(0.101, HIP_Y - 0.048, 0.3), V3(0.105, SEAT - 0.015, 0.43)],
    K: V3(0.105, SEAT - 0.015, 0.43),
    A: V3(0.098, 0.168, 0.4),
  },
  R: {
    thigh: [V3(-0.088, HIP_Y, -0.02), V3(-0.078, HIP_Y + 0.01, 0.08), V3(-0.03, 0.745, 0.18), V3(0.04, 0.772, 0.27), V3(0.088, 0.765, 0.35), V3(0.108, 0.745, 0.46)],
    K: V3(0.108, 0.745, 0.46),
    A: V3(0.14, 0.375, 0.63),
  },
};

/** Centre line of an arm (and of its sleeve): inside the torso at the shoulder, elbow, cuff 4 cm short of the wrist. */
export function armPath(arm: ArmPose): THREE.Vector3[] {
  const { S, E, W } = arm;
  const dirF = W.clone().sub(E).normalize();
  const Wc = W.clone().addScaledVector(dirF, -0.04);
  const out = Math.sign(S.x);
  return [
    S.clone().add(V3(-out * 0.07, 0.006, 0)),
    S.clone().lerp(E, 0.45).add(V3(out * 0.012, 0, -0.004)),
    E.clone().add(V3(out * 0.006, 0, -0.006)),
    E.clone().lerp(Wc, 0.5),
    Wc,
  ];
}
