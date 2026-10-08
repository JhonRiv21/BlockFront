import type { GameConfig } from '@blockfront/sim/game'
import type { InputFrame } from '@blockfront/sim/input'
import type { SimRequest, SimResponse } from './sim-messages.ts'
import type { Transport, UpdateListener } from './transport.ts'

// Runs the Game in a dedicated worker at 30 Hz; the main thread never touches game state.
export class LocalTransport implements Transport {
  private readonly worker: Worker
  private listener: UpdateListener | null = null
  private readonly stepSamples: number[] = []

  constructor() {
    this.worker = new Worker(new URL('./sim.worker.ts', import.meta.url), {
      type: 'module',
      name: 'sim',
    })
    this.worker.onmessage = (event: MessageEvent<SimResponse>) => {
      const { snapshot, events, stepMs } = event.data
      this.stepSamples.push(stepMs)
      if (this.stepSamples.length > 90) this.stepSamples.shift()
      this.listener?.(snapshot, events)
    }
    this.worker.onerror = (event) => {
      console.error('sim worker failed', event.message)
    }
  }

  // Average and maximum Game.step time over the last 3 s.
  stepStats(): { avgMs: number; maxMs: number } {
    if (this.stepSamples.length === 0) return { avgMs: 0, maxMs: 0 }
    const avgMs = this.stepSamples.reduce((a, b) => a + b, 0) / this.stepSamples.length
    return { avgMs, maxMs: Math.max(...this.stepSamples) }
  }

  start(config: GameConfig, localPlayerId: number): void {
    this.post({ type: 'start', config, localPlayerId })
  }

  sendInput(frame: InputFrame): void {
    this.post({ type: 'input', frame })
  }

  onUpdate(listener: UpdateListener): void {
    this.listener = listener
  }

  dispose(): void {
    this.listener = null
    this.worker.terminate()
  }

  private post(message: SimRequest): void {
    this.worker.postMessage(message)
  }
}
