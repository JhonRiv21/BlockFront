export const TICK_RATE = 30
export const TICK_SECONDS = 1 / TICK_RATE

export const CHUNK_SIZE = 32

// 96 wide, 128 long, 64 high: 3 × 4 × 2 chunks of 32³. The bases sit 87 blocks apart, the
// range of a Blockade-style map; 192 long (2026-10-20 playtest) felt like a hike.
export const WORLD_SIZE = {
  x: 96,
  y: 64,
  z: 128,
} as const

export const MAX_PLAYERS_PER_TEAM = 8
