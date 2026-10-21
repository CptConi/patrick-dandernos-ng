import * as THREE from 'three';
import { ROOM, roofHeight } from '../room/shell';

/** Free space kept between the camera and the walls (m). */
export const WALL_MARGIN = 0.3;
/** Free space kept between the camera and the roof slopes, measured perpendicular to the slope (m). */
export const ROOF_MARGIN = 0.36;
/** Lowest camera height (m). */
export const FLOOR_MIN = 0.25;

/** cos of the roof pitch: a vertical gap g above the camera is g * SLOPE_COS away from the slope. */
const SLOPE_COS = ROOM.halfW / Math.hypot(ROOM.halfW, ROOM.ridgeH - ROOM.wallH);

const clampNum = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/** Highest camera height at x (follows the gable profile). */
export const ceilingAt = (x: number): number =>
  Math.max(FLOOR_MIN, roofHeight(clampNum(x, -ROOM.halfW, ROOM.halfW)) - ROOF_MARGIN / SLOPE_COS);

/** True when `p` is inside the camera volume (room box under the gabled roof, with margins). */
export const insideRoom = (p: THREE.Vector3, eps = 1e-4): boolean =>
  p.x >= -ROOM.halfW + WALL_MARGIN - eps &&
  p.x <= ROOM.halfW - WALL_MARGIN + eps &&
  p.z >= ROOM.zFar + WALL_MARGIN - eps &&
  p.z <= ROOM.zEnt - WALL_MARGIN + eps &&
  p.y >= FLOOR_MIN - eps &&
  p.y <= ceilingAt(p.x) + eps;

/** Single place that keeps the camera inside the room: walls, floor and the two roof slopes. Mutates and returns `p`. */
export const clampToRoom = (p: THREE.Vector3): THREE.Vector3 => {
  p.x = clampNum(p.x, -ROOM.halfW + WALL_MARGIN, ROOM.halfW - WALL_MARGIN);
  p.z = clampNum(p.z, ROOM.zFar + WALL_MARGIN, ROOM.zEnt - WALL_MARGIN);
  p.y = clampNum(p.y, FLOOR_MIN, ceilingAt(p.x));
  return p;
};

const probe = new THREE.Vector3();

/**
 * Largest factor f in [1, want] such that `target + (pos - target) * f` is still inside the camera volume
 * (the volume is convex, so a bisection is exact). Returns 1 when the pose cannot be pulled back at all.
 */
export const maxPullBack = (target: THREE.Vector3, pos: THREE.Vector3, want: number): number => {
  const at = (f: number) => probe.subVectors(pos, target).multiplyScalar(f).add(target);
  if (want <= 1 || !insideRoom(at(1), 0.05)) {
    return 1;
  }
  if (insideRoom(at(want))) {
    return want;
  }
  let lo = 1;
  let hi = want;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (insideRoom(at(mid))) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
};
