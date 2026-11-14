import { TICK_SECONDS } from '@blockfront/sim/config'
import { Game } from '@blockfront/sim/game'
import type { InputFrame } from '@blockfront/sim/input'
import { FixedStep } from '@blockfront/sim/time/fixed-step'
import { applyDamage } from '@blockfront/sim/match/damage'
import { createWeaponState } from '@blockfront/sim/combat/weapon-state'
import { ITEMS } from '@blockfront/sim/combat/weapons'
import type { DevOp, SimRequest, SimResponse } from './sim-messages.ts'

const scope = self as unknown as DedicatedWorkerGlobalScope
const POLL_MS = 4

let game: Game | null = null
let localPlayerId = 0
let inputQueue: InputFrame[] = []
let lastInput: InputFrame | null = null
const clock = new FixedStep(TICK_SECONDS, 5)
let lastTime = 0
let paused = false
// Dev pokes wait for the next step so the events they raise travel with that tick.
const pendingDev: DevOp[] = []
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
    while (pendingDev.length) applyDev(pendingDev.shift()!)
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
  pendingDev.length = 0
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
    case 'dev':
      if (import.meta.env.DEV) pendingDev.push(message.op)
      break
  }
}

// QA pokes on the local player. Stripped from production builds with the DEV guard above.
function applyDev(op: DevOp): void {
  const player = game?.players.get(localPlayerId)
  if (!game || !player) return
  switch (op.kind) {
    case 'teleport':
      player.state.pos = [op.x, op.y, op.z]
      player.state.vel = [0, 0, 0]
      break
    case 'give':
      if (op.item === 'blocks') player.blocks = Math.min(50, player.blocks + op.n)
      else if (op.item === 'grenades') player.grenades += op.n
      else if (op.item === 'tnt') player.tnt += op.n
      else if (op.item === 'ladders') player.ladders += op.n
      else if (op.item === 'bandages')
        player.bandages = Math.min(ITEMS.bandage.max, player.bandages + op.n)
      else {
        player.weapon = createWeaponState(player.weapon.weapon)
        player.pistol = createWeaponState('pistol')
      }
      break
    case 'setHp':
      player.hp = Math.max(1, Math.min(100, op.hp))
      break
    case 'kill':
      player.protectedUntil = 0
      applyDamage(game, player, player, 1000, 'torso', 'fall')
      break
    case 'addDummy': {
      const id = 100 + game.players.size
      game.addPlayer({ id, team: op.team, name: op.name, dummy: true, spawn: [op.x, op.z] })
      break
    }
  }
}
