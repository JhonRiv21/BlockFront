import { TICK_SECONDS } from '@blockfront/sim/config'
import { Game } from '@blockfront/sim/game'
import type { InputFrame } from '@blockfront/sim/input'
import { FixedStep } from '@blockfront/sim/time/fixed-step'
import type { SimRequest, SimResponse } from './sim-messages.ts'

const scope = self as unknown as DedicatedWorkerGlobalScope
const POLL_MS = 4

let game: Game | null = null
let localPlayerId = 0
let inputQueue: InputFrame[] = []
let lastInput: InputFrame | null = null
const clock = new FixedStep(TICK_SECONDS, 5)
let lastTime = 0
let paused = false
// One timer for the life of the worker: start, stop and restart never stack another.
let timer: ReturnType<typeof setInterval> | null = null

function tick(): void {
  if (!game || paused) return
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

function stop(): void {
  if (timer !== null) clearInterval(timer)
  timer = null
  game = null
  inputQueue = []
  lastInput = null
  paused = false
}

scope.onmessage = (event: MessageEvent<SimRequest>) => {
  const message = event.data
  switch (message.type) {
    case 'start':
      stop()
      game = new Game(message.config)
      localPlayerId = message.localPlayerId
      lastTime = performance.now()
      clock.reset()
      timer = setInterval(tick, POLL_MS)
      break
    case 'input':
      inputQueue.push(message.frame)
      // A stalled main thread must not build a backlog that replays later.
      if (inputQueue.length > 4) inputQueue.splice(0, inputQueue.length - 4)
      break
    case 'pause':
      paused = true
      break
    case 'resume':
      // No catch-up for the time paused: the clock restarts from now.
      paused = false
      lastTime = performance.now()
      clock.reset()
      inputQueue = []
      break
    case 'stop':
      stop()
      break
  }
}
