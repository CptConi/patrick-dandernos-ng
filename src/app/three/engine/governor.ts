export interface GovernorStep {
  name: string;
  /** Apply the degradation. Return false when it does not apply (already at that level): the next step runs instead. */
  apply(): boolean;
}

/**
 * Tiny adaptive-quality governor. Averages the frame time over `window` frames; when it exceeds
 * `limitMs` it applies the next degradation step. It never goes back up.
 */
export class FrameGovernor {
  enabled = true;
  private frames = 0;
  private sum = 0;
  private next = 0;

  constructor(
    private readonly steps: GovernorStep[],
    private readonly limitMs = 24,
    private readonly window = 90
  ) {}

  /** Feed one frame duration in ms. Hitches (tab switch, shader compile) are ignored. */
  sample(ms: number): void {
    if (!this.enabled || this.next >= this.steps.length || ms > 250) {
      return;
    }
    this.frames++;
    this.sum += ms;
    if (this.frames < this.window) {
      return;
    }
    const avg = this.sum / this.frames;
    this.frames = 0;
    this.sum = 0;
    if (avg <= this.limitMs) {
      return;
    }
    while (this.next < this.steps.length) {
      const step = this.steps[this.next++];
      if (step.apply()) {
        console.info(`[studio] adaptive quality: avg frame ${avg.toFixed(1)} ms -> ${step.name}`);
        return;
      }
    }
  }
}
