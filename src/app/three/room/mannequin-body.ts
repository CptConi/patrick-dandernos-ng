import * as THREE from 'three';
import { ArmPose, armPath } from './mannequin-pose';
import { V3, gauss, prof, sstep, surface, tube } from './mannequin-surf';

/** Bare satin body of the mannequin: torso with bust / collarbones (seen through the neckline). */

/** Body ring knots (y -> half width, front depth, back depth, centre z): the S-curve of a relaxed seated spine. */
export const BODY_A = prof([[0.58, 0.158], [0.66, 0.168], [0.75, 0.166], [0.83, 0.15], [0.9, 0.123], [0.98, 0.127], [1.06, 0.137], [1.13, 0.141], [1.19, 0.146], [1.23, 0.145], [1.25, 0.13], [1.268, 0.1], [1.285, 0.077], [1.3, 0.062], [1.32, 0.05]]);
export const BODY_BF = prof([[0.58, 0.1], [0.66, 0.106], [0.75, 0.103], [0.83, 0.093], [0.9, 0.08], [0.98, 0.082], [1.06, 0.089], [1.13, 0.097], [1.19, 0.083], [1.235, 0.068], [1.265, 0.055], [1.29, 0.05], [1.32, 0.05]]);
export const BODY_BK = prof([[0.58, 0.1], [0.66, 0.114], [0.75, 0.111], [0.83, 0.091], [0.9, 0.077], [0.98, 0.077], [1.06, 0.076], [1.13, 0.073], [1.19, 0.071], [1.235, 0.065], [1.265, 0.058], [1.29, 0.053], [1.32, 0.05]]);
export const BODY_CZ = prof([[0.58, -0.045], [0.66, -0.04], [0.78, -0.03], [0.9, -0.014], [0.98, -0.014], [1.08, -0.028], [1.18, -0.044], [1.26, -0.034], [1.32, -0.03]]);

export function skinTorsoGeo(hi: boolean): THREE.BufferGeometry {
  const y0 = 0.58;
  const y1 = 1.31;
  return surface(hi ? 40 : 24, hi ? 28 : 16, (u, v, out) => {
    const y = y0 + (y1 - y0) * v;
    const phi = Math.PI * 2 * u;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    const n = 2.25;
    const cx = Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    const sx = Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    const x = BODY_A(y) * sx;
    let z = BODY_CZ(y) + (c >= 0 ? BODY_BF(y) : BODY_BK(y)) * cx;
    if (c > 0) {
      // bust and collarbones
      const ax = Math.abs(x);
      z += 0.017 * Math.exp(-(((ax - 0.054) / 0.042) ** 2) - ((y - 1.115) / 0.045) ** 2) * sstep(0.1, 0.5, c);
      const clav = 0.0032 * gauss(y, 1.258 + 0.05 * ax, 0.0085) * sstep(0.02, 0.05, ax) * (1 - sstep(0.12, 0.16, ax));
      z += clav * sstep(0.2, 0.6, c);
      z -= 0.003 * gauss(ax, 0, 0.012) * gauss(y, 1.248, 0.012) * sstep(0.2, 0.6, c);
    }
    out.set(x, y, z);
  });
}

/** Slender bare arm (covered by the sleeve down to the wrist). */
export function skinArmGeo(arm: ArmPose, hi: boolean): THREE.BufferGeometry {
  const { E, W } = arm;
  const dirF = W.clone().sub(E).normalize();
  const path = armPath(arm);
  path.push(W.clone().addScaledVector(dirF, 0.014));
  return tube(path, {
    nu: hi ? 16 : 10,
    nv: hi ? 30 : 16,
    hint: V3(0, 0, -1),
    a: prof([[0, 0.03], [0.1, 0.034], [0.25, 0.034], [0.5, 0.029], [0.62, 0.03], [0.84, 0.0235], [1, 0.0185]]),
    b: prof([[0, 0.03], [0.1, 0.034], [0.25, 0.034], [0.5, 0.03], [0.62, 0.031], [0.84, 0.0255], [1, 0.0245]]),
    capStart: 1,
  });
}
