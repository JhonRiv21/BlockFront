import { TICK_SECONDS } from '@blockfront/sim/config'
import { Game } from '@blockfront/sim/game'
import type { InputFrame } from '@blockfront/sim/input'
import { FixedStep } from '@blockfront/sim/time/fixed-step'
import type { SimRequest, SimResponse } from './sim-messages.ts'

const scope = self as unknown as DedicatedWorkerGlobalScope
const POLL_MS = 4

let game: Game | null = null
let localPlayerId = 0
const inputQueue: InputFrame[] = []
let lastInput: InputFrame | null = null
const clock = new FixedStep(TICK_SECONDS, 5)
let lastTime = 0

function tick(): void {
  if (!game) return
  const now = performance.now()
  const { steps } = clock.advance((now - lastTime) / 1000)
  lastTime = now
  for (let i = 0; i < steps; i++) {
    const frame = inputQueue.shift() ?? lastInput
    if (frame) lastInput = frame
    const inputs = new Map<number, InputFrame>()
    if (frame) inputs.set(localPlayerId, frame)
    const start = performance.now()
    const events = game.step(inputs)
    const stepMs = performance.now() - start
    const response: SimResponse = { type: 'update', snapshot: game.snapshot(), events, stepMs }
    scope.postMessage(response)
  }
}

scope.onmessage = (event: MessageEvent<SimRequest>) => {
  const message = event.data
  if (message.type === 'start') {
    game = new Game(message.config)
    localPlayerId = message.localPlayerId
    lastTime = performance.now()
    setInterval(tick, POLL_MS)
  } else if (message.type === 'input') {
    inputQueue.push(message.frame)
    // A stalled main thread must not build a backlog that replays later.
    if (inputQueue.length > 4) inputQueue.splice(0, inputQueue.length - 4)
  }
}
