export interface StepResult {
  steps: number
  alpha: number
}

export class FixedStep {
  private accumulator = 0

  constructor(
    readonly stepSeconds: number,
    readonly maxStepsPerFrame: number,
  ) {}

  advance(elapsedSeconds: number): StepResult {
    if (Number.isFinite(elapsedSeconds) && elapsedSeconds > 0) {
      this.accumulator += elapsedSeconds
    }
    let steps = Math.floor(this.accumulator / this.stepSeconds + 1e-9)
    if (steps > this.maxStepsPerFrame) {
      // After a stall (tab in background, breakpoint) catching up would freeze the frame.
      steps = this.maxStepsPerFrame
      this.accumulator = 0
    } else {
      this.accumulator = Math.max(0, this.accumulator - steps * this.stepSeconds)
    }
    return { steps, alpha: this.accumulator / this.stepSeconds }
  }
}
