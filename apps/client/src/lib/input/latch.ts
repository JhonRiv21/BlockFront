// Press and release bookkeeping for keys and buttons. A press shorter than one sim tick must
// still reach the sim, so a code counts as held until the tick after it was pressed, even if it
// was released in between ("latched").
export class Latch {
  private readonly held = new Set<string>()
  private readonly latched = new Set<string>()
  private readonly pressed = new Set<string>()

  press(code: string): void {
    if (!this.held.has(code)) this.pressed.add(code)
    this.held.add(code)
    this.latched.add(code)
  }

  release(code: string): void {
    this.held.delete(code)
  }

  // Held right now, or tapped since the last tick ended.
  isHeld(code: string): boolean {
    return this.held.has(code) || this.latched.has(code)
  }

  // True once per physical press.
  takePressed(code: string): boolean {
    return this.pressed.delete(code)
  }

  // Called after the input for a tick has been built: taps have been delivered.
  endTick(): void {
    this.latched.clear()
  }

  clear(): void {
    this.held.clear()
    this.latched.clear()
    this.pressed.clear()
  }
}
