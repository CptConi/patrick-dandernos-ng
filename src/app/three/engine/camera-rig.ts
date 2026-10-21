import * as THREE from 'three';

export interface RigPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
export const smoothstep = (t: number): number => {
  const k = clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
};
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

export const makePose = (): RigPose => ({
  position: new THREE.Vector3(),
  target: new THREE.Vector3(),
  fov: 50,
});

export interface MoveOptions {
  duration: number;
  /** Start pose; defaults to the rig's current pose (interruptible moves). */
  from?: RigPose;
  /** Peak height of the arc in meters (default scales with distance). 0 = straight line. */
  lift?: number;
  ease?: (t: number) => number;
  /** The arc control point is clamped to this box so the camera never leaves the room. */
  bounds?: THREE.Box3;
}

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
/** Turns above this get the gentler ease, a lateral arc and a longer duration. */
const BIG_TURN = THREE.MathUtils.degToRad(100);
/** Peak yaw speed (rad/s) the rig tries to respect, and the longest move it will stretch to. */
const MAX_TURN_SPEED = THREE.MathUtils.degToRad(84);
const MAX_DURATION = 3.0;
const MAX_PITCH = THREE.MathUtils.degToRad(35);

const wrapPi = (a: number): number => {
  const w = (a + Math.PI) % TAU;
  return (w < 0 ? w + TAU : w) - Math.PI;
};

/** View direction as yaw (around Y, shortest-arc friendly) + pitch + distance to the look target. */
interface Orient {
  yaw: number;
  pitch: number;
  dist: number;
}

const orientOf = (position: THREE.Vector3, target: THREE.Vector3, out: Orient, fallbackYaw: number): void => {
  const dx = target.x - position.x;
  const dy = target.y - position.y;
  const dz = target.z - position.z;
  const horiz = Math.hypot(dx, dz);
  out.yaw = horiz > 1e-4 ? Math.atan2(dx, dz) : fallbackYaw;
  out.pitch = Math.atan2(dy, Math.max(horiz, 1e-6));
  out.dist = Math.max(0.3, Math.hypot(horiz, dy));
};

/**
 * Camera base state (position / look-at target / fov) animated along a quadratic bezier.
 * The view orientation is NOT a lerp of the target point: it is interpolated as yaw (shortest arc, wrapped) + pitch
 * + look distance, so the camera never rolls or somersaults, whatever the two poses are. Big turns take a gentle
 * arc and a longer, capped-speed rotation.
 * Idle motion (parallax, breathing) and aspect compensation are applied on top by the caller.
 */
export class CameraRig {
  readonly position = new THREE.Vector3();
  readonly target = new THREE.Vector3();
  fov = 50;

  private readonly from = makePose();
  private readonly to = makePose();
  private readonly fromO: Orient = { yaw: 0, pitch: 0, dist: 1 };
  private readonly toO: Orient = { yaw: 0, pitch: 0, dist: 1 };
  private readonly control = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private t = 1;
  private duration = 1;
  private ease: (t: number) => number = easeInOutCubic;
  private turnSign = 0;
  private lastYaw = 0;

  get moving(): boolean {
    return this.t < 1;
  }

  snapTo(pose: RigPose): void {
    this.t = 1;
    this.copyTo(this.to, pose);
    this.position.copy(pose.position);
    this.target.copy(pose.target);
    this.fov = pose.fov;
    orientOf(pose.position, pose.target, this.toO, this.lastYaw);
    this.lastYaw = this.toO.yaw;
  }

  moveTo(pose: RigPose, opts: MoveOptions): void {
    if (opts.from) {
      this.copyTo(this.from, opts.from);
    } else {
      this.from.position.copy(this.position);
      this.from.target.copy(this.target);
      this.from.fov = this.fov;
    }
    this.copyTo(this.to, pose);
    orientOf(this.from.position, this.from.target, this.fromO, this.lastYaw);
    orientOf(this.to.position, this.to.target, this.toO, this.fromO.yaw);
    const dyaw = wrapPi(this.toO.yaw - this.fromO.yaw);
    this.turnSign = dyaw < 0 ? -1 : 1;
    const big = Math.abs(dyaw) > BIG_TURN;

    this.duration = Math.max(0.01, opts.duration);
    if (Math.abs(dyaw) > 0.45) {
      // a long pan: smoothstep peaks at 1.5x the average speed (cubic at 3x), so it can be paced to a speed cap
      this.ease = smoothstep;
      this.duration = Math.min(MAX_DURATION, Math.max(this.duration, (1.5 * Math.abs(dyaw)) / MAX_TURN_SPEED));
    } else {
      this.ease = opts.ease || easeInOutCubic;
    }
    this.t = 0;

    const p0 = this.from.position;
    const p1 = this.to.position;
    const dist = p0.distanceTo(p1);
    const peak = opts.lift !== undefined ? opts.lift : Math.min(0.4, 0.1 + 0.1 * dist);
    // B(0.5) = mid + 0.5 * (control - mid), so the control point is lifted by twice the wanted peak.
    this.control.addVectors(p0, p1).multiplyScalar(0.5);
    if (opts.bounds) {
      const center = opts.bounds.getCenter(new THREE.Vector3());
      this.control.lerp(center, 0.25);
    }
    if (big && opts.lift === undefined) {
      // turning around: travel on an arc through the middle of the room instead of spinning on the spot
      const cx = opts.bounds ? opts.bounds.getCenter(new THREE.Vector3()) : new THREE.Vector3();
      this.control.x += (cx.x - this.control.x) * 0.5;
      this.control.z += (cx.z - this.control.z) * 0.5;
    }
    this.control.addScaledVector(UP, peak * 2);
    if (opts.bounds) {
      opts.bounds.clampPoint(this.control, this.control);
    }
  }

  /** Live re-target of the destination (gallery fit follows the photo aspect / view inset). */
  setDestination(pose: RigPose): void {
    this.copyTo(this.to, pose);
    orientOf(pose.position, pose.target, this.toO, this.lastYaw);
    if (this.t >= 1) {
      this.position.copy(pose.position);
      this.target.copy(pose.target);
      this.fov = pose.fov;
      this.lastYaw = this.toO.yaw;
    }
  }

  update(dt: number): void {
    if (this.t >= 1) {
      this.position.copy(this.to.position);
      this.target.copy(this.to.target);
      this.fov = this.to.fov;
      return;
    }
    this.t = Math.min(1, this.t + dt / this.duration);
    const k = this.ease(this.t);
    // The view leads the position slightly: the camera "looks ahead" while travelling.
    const kt = this.ease(Math.min(1, this.t * 1.06));
    const a = 1 - k;
    const p0 = this.from.position;
    const p1 = this.to.position;
    const c = this.control;
    this.position.set(
      a * a * p0.x + 2 * a * k * c.x + k * k * p1.x,
      a * a * p0.y + 2 * a * k * c.y + k * k * p1.y,
      a * a * p0.z + 2 * a * k * c.z + k * k * p1.z
    );

    const f = this.fromO;
    const o = this.toO;
    // shortest arc, but never reverse the direction chosen at the start (the destination may drift while we move)
    let dyaw = wrapPi(o.yaw - f.yaw);
    if (dyaw * this.turnSign < 0 && Math.abs(dyaw) > Math.PI - 0.35) {
      dyaw += this.turnSign * TAU;
    }
    const yaw = f.yaw + dyaw * kt;
    const lim = Math.max(MAX_PITCH, Math.abs(f.pitch), Math.abs(o.pitch));
    const pitch = clamp(f.pitch + (o.pitch - f.pitch) * kt, -lim, lim);
    const dist = f.dist + (o.dist - f.dist) * kt;
    const cp = Math.cos(pitch);
    this.dir.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
    this.target.copy(this.position).addScaledVector(this.dir, dist);
    this.lastYaw = yaw;
    this.fov = this.from.fov + (this.to.fov - this.from.fov) * k;
  }

  private copyTo(dst: RigPose, src: RigPose): void {
    dst.position.copy(src.position);
    dst.target.copy(src.target);
    dst.fov = src.fov;
  }
}
