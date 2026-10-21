import { clamp } from './camera-rig';

const DEG = Math.PI / 180;
/** Largest view offsets the tilt can add on top of the rig pose. */
export const TILT_YAW_MAX = 24 * DEG;
export const TILT_PITCH_MAX = 10 * DEG;
/** Device degrees ignored around the baseline, and view degrees produced per device degree beyond it. */
const DEADZONE = 1.5;
const YAW_GAIN = 1.3;
const PITCH_GAIN = 0.7;
/** Low-pass of the raw sensor, settling time of the critically damped follower, fade in / out of the whole effect (s). */
const SENSOR_TAU = 0.06;
const SMOOTH_TIME = 0.22;
const FADE_IN = 0.5;
const FADE_OUT = 0.18;
/** The neutral posture follows the device slowly, and is dragged along when the tilt goes past the useful range. */
const RECENTER_TAU = 30;
const RANGE_YAW = TILT_YAW_MAX / DEG / YAW_GAIN + DEADZONE;
const RANGE_PITCH = TILT_PITCH_MAX / DEG / PITCH_GAIN + DEADZONE;

const screenAngle = (): number => {
  const so = (screen as any).orientation;
  const a = so && typeof so.angle === 'number' ? so.angle : typeof (window as any).orientation === 'number' ? (window as any).orientation : 0;
  return ((Math.round(a / 90) * 90) % 360 + 360) % 360;
};

/** Critically damped follower (no overshoot, velocity-continuous). */
const smoothDamp = (cur: number, target: number, vel: { v: number }, smoothTime: number, dt: number): number => {
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const temp = (vel.v + omega * change) * dt;
  vel.v = (vel.v - omega * temp) * e;
  return target + (change + temp) * e;
};

/**
 * Device-tilt look-around. Reads `deviceorientation` (gamma = left-right tilt, beta = forward-back tilt; the two swap
 * with the screen rotation) relative to a baseline captured on the first event, and turns it into a yaw / pitch offset
 * (radians) for the camera: tilting the right edge down looks right, tilting the top edge away looks up.
 */
export class TiltController {
  /** Current view offsets (rad), already scaled by the fade. */
  yaw = 0;
  pitch = 0;
  /** 0..1 fade of the whole effect. */
  amount = 0;

  private on = false;
  private simulated = false;
  private have = false;
  private rawG = 0;
  private rawB = 0;
  private angle = 0;
  /** Neutral posture in the user frame (degrees: right-tilt, up-tilt); null until captured. */
  private anchor: { r: number; u: number } | null = null;
  private lp = { r: 0, u: 0 };
  private yawSm = 0;
  private pitchSm = 0;
  private readonly yawVel = { v: 0 };
  private readonly pitchVel = { v: 0 };

  private readonly onEvent = (e: DeviceOrientationEvent): void => {
    if (typeof e.gamma !== 'number' || typeof e.beta !== 'number') {
      return;
    }
    this.rawG = e.gamma;
    this.rawB = e.beta;
    this.have = true;
  };

  get enabled(): boolean {
    return this.on;
  }

  set(enabled: boolean): void {
    if (enabled === this.on) {
      return;
    }
    this.on = enabled;
    if (enabled) {
      window.addEventListener('deviceorientation', this.onEvent, { passive: true } as AddEventListenerOptions);
    } else {
      window.removeEventListener('deviceorientation', this.onEvent);
      this.simulated = false;
    }
    this.have = false;
    this.anchor = null;
    this.angle = screenAngle();
  }

  /** Test helper: pretend the device is tilted by (gamma, beta) degrees away from its neutral posture. */
  simulate(gamma: number, beta: number): void {
    if (!this.on) {
      this.set(true);
    }
    this.simulated = true;
    this.angle = 0;
    this.rawG = gamma;
    this.rawB = beta;
    this.have = true;
    this.anchor = { r: 0, u: 0 };
  }

  dispose(): void {
    this.set(false);
  }

  /** Raw reading in the user's frame (degrees, right-tilt / up-tilt) for the current screen rotation. */
  private reading(): { r: number; u: number } {
    const g = this.rawG;
    const b = this.rawB;
    switch (this.angle) {
      case 90:
        return { r: b, u: g };
      case 180:
        return { r: -g, u: b };
      case 270:
        return { r: -b, u: -g };
      default:
        return { r: g, u: -b };
    }
  }

  /** `allow` false fades the offset out (station transition, slideshow, reduced motion); the sensor keeps being tracked. */
  update(dt: number, allow: boolean): void {
    if (this.on && !this.simulated) {
      const angle = screenAngle();
      if (angle !== this.angle) {
        this.angle = angle;
        this.anchor = null;
      }
    }
    let targetYaw = 0;
    let targetPitch = 0;
    if (this.on && this.have) {
      const now = this.reading();
      if (!this.anchor) {
        this.anchor = { r: now.r, u: now.u };
        this.lp.r = 0;
        this.lp.u = 0;
      }
      const a = this.anchor;
      const k = 1 - Math.exp(-dt / SENSOR_TAU);
      this.lp.r += (clamp(now.r - a.r, -90, 90) - this.lp.r) * k;
      this.lp.u += (clamp(now.u - a.u, -90, 90) - this.lp.u) * k;
      if (!this.simulated) {
        // neutral posture: slow drift towards the current one, and dragged along past the end of the range
        const kc = 1 - Math.exp(-dt / RECENTER_TAU);
        a.r += this.lp.r * kc;
        a.u += this.lp.u * kc;
        const overR = Math.abs(this.lp.r) - RANGE_YAW;
        const overU = Math.abs(this.lp.u) - RANGE_PITCH;
        if (overR > 0) {
          a.r += Math.sign(this.lp.r) * overR;
          this.lp.r -= Math.sign(this.lp.r) * overR;
        }
        if (overU > 0) {
          a.u += Math.sign(this.lp.u) * overU;
          this.lp.u -= Math.sign(this.lp.u) * overU;
        }
      }
      const dead = (v: number) => Math.sign(v) * Math.max(0, Math.abs(v) - DEADZONE);
      targetYaw = clamp(dead(this.lp.r) * YAW_GAIN * DEG, -TILT_YAW_MAX, TILT_YAW_MAX);
      targetPitch = clamp(dead(this.lp.u) * PITCH_GAIN * DEG, -TILT_PITCH_MAX, TILT_PITCH_MAX);
    }
    this.yawSm = smoothDamp(this.yawSm, targetYaw, this.yawVel, SMOOTH_TIME, dt);
    this.pitchSm = smoothDamp(this.pitchSm, targetPitch, this.pitchVel, SMOOTH_TIME, dt);

    const want = this.on && allow ? 1 : 0;
    this.amount += (want - this.amount) * (1 - Math.exp(-dt / (want > this.amount ? FADE_IN : FADE_OUT)));
    if (want === 0 && this.amount < 0.001) {
      this.amount = 0;
    }
    this.yaw = this.yawSm * this.amount;
    this.pitch = this.pitchSm * this.amount;
  }
}
