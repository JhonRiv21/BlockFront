import { describe, expect, it } from 'vitest'
import { TICK_RATE, WORLD_SIZE } from '../config.ts'
import { Game, type GameEvent } from '../game.ts'
import { createInputFrame } from '../input.ts'

// Written from Jhon's playtest request (2026-11-14): walking off the edge of the map into the
// void kills, as in Minecraft. Spawn protection does not save you, and an enemy who hit you
// just before gets the kill, as with a fall.

function game(): Game {
  return new Game({
    seed: 1,
    players: [
      { id: 1, team: 'blue', name: 'me' },
      { id: 2, team: 'red', name: 'dummy', dummy: true },
    ],
  })
}

function run(g: Game, ticks: number): GameEvent[] {
  const events: GameEvent[] = []
  for (let i = 0; i < ticks; i++) events.push(...g.step(new Map([[1, createInputFrame()]])))
  return events
}

const entity = (g: Game, id: number) => g.players.get(id)!

// Just past the east edge of the map, at about ground height: nothing below.
function offTheEdge(g: Game, id: number): void {
  entity(g, id).state.pos = [WORLD_SIZE.x + 2, 24, WORLD_SIZE.z / 2]
  entity(g, id).state.vel = [0, 0, 0]
}

const deaths = (events: GameEvent[]) =>
  events.filter((e): e is Extract<GameEvent, { type: 'death' }> => e.type === 'death')

describe('falling into the void', () => {
  it('kills a player who falls off the edge of the map, as a fall', () => {
    const g = game()
    run(g, 5)
    entity(g, 1).protectedUntil = 0
    offTheEdge(g, 1)
    const events = run(g, 4 * TICK_RATE)
    const death = deaths(events).find((e) => e.victim === 1)
    expect(death).toBeDefined()
    expect(death!.tool).toBe('fall')
    expect(entity(g, 1).alive).toBe(false)
  })

  it('kills through spawn protection', () => {
    const g = game()
    run(g, 5)
    entity(g, 1).protectedUntil = g.tick + 100 * TICK_RATE
    offTheEdge(g, 1)
    const events = run(g, 4 * TICK_RATE)
    expect(deaths(events).some((e) => e.victim === 1)).toBe(true)
  })

  it('gives the kill to an enemy who hit the player just before', () => {
    const g = game()
    run(g, 5)
    entity(g, 1).protectedUntil = 0
    entity(g, 1).lastAttacker = 2
    entity(g, 1).lastAttackedTick = g.tick
    offTheEdge(g, 1)
    const events = run(g, 4 * TICK_RATE)
    const death = deaths(events).find((e) => e.victim === 1)
    expect(death?.attacker).toBe(2)
  })

  it('does not kill anyone standing on the map', () => {
    const g = game()
    const events = run(g, 4 * TICK_RATE)
    expect(deaths(events)).toEqual([])
  })
})
