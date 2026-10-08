import type { GameConfig, GameEvent, Snapshot } from '@blockfront/sim/game'
import type { InputFrame } from '@blockfront/sim/input'

export type UpdateListener = (snapshot: Snapshot, events: GameEvent[]) => void

// The client only sends InputFrames and receives snapshots plus events. The simulation runs
// behind this interface: in a worker for matches against bots, over a socket for rooms.
export interface Transport {
  start(config: GameConfig, localPlayerId: number): void
  sendInput(frame: InputFrame): void
  onUpdate(listener: UpdateListener): void
  dispose(): void
}
