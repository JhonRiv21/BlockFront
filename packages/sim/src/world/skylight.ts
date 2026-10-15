import { CHUNK_SIZE, WORLD_SIZE } from '../config.ts'
import { FLAG, FLAGS, isOpaque } from './blocks.ts'
import type { World } from './world.ts'

export const MAX_LIGHT = 15

const X = WORLD_SIZE.x
const Y = WORLD_SIZE.y
const Z = WORLD_SIZE.z
const STRIDE_Y = X
const STRIDE_Z = X * Y

export function lightIndex(x: number, y: number, z: number): number {
  return x + y * STRIDE_Y + z * STRIDE_Z
}

const NEIGHBOURS: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

// Growable int queue so the flood fills allocate nothing per cell.
class IntQueue {
  private data = new Int32Array(4096)
  private head = 0
  private tail = 0

  get size(): number {
    return this.tail - this.head
  }

  push(value: number): void {
    if (this.tail === this.data.length) {
      if (this.head > 0) {
        this.data.copyWithin(0, this.head, this.tail)
        this.tail -= this.head
        this.head = 0
      } else {
        const bigger = new Int32Array(this.data.length * 2)
        bigger.set(this.data)
        this.data = bigger
      }
    }
    this.data[this.tail++] = value
  }

  shift(): number {
    return this.data[this.head++]!
  }
}

type Transparent = (x: number, y: number, z: number) => boolean

function worldTransparency(world: World): Transparent {
  return (x, y, z) => !isOpaque(world.getBlock(x, y, z))
}

// Flat opacity copy read straight from the chunk arrays; far cheaper than getBlock per cell.
function bakedTransparency(world: World): Transparent {
  const opaque = new Uint8Array(X * Y * Z)
  const S = CHUNK_SIZE
  for (let cz = 0; cz < world.chunksZ; cz++)
    for (let cy = 0; cy < world.chunksY; cy++)
      for (let cx = 0; cx < world.chunksX; cx++) {
        const data = world.getChunk(cx, cy, cz).data
        for (let z = 0; z < S; z++)
          for (let y = 0; y < S; y++) {
            const row = y * S + z * S * S
            const base = lightIndex(cx * S, cy * S + y, cz * S + z)
            for (let x = 0; x < S; x++) opaque[base + x] = FLAGS[data[row + x]!]! & FLAG.opaque
          }
      }
  return (x, y, z) => opaque[lightIndex(x, y, z)] === 0
}

// Spreads light outward from every queued cell: one less per step, except straight down from a
// full sun cell, which keeps its intensity (that is what makes sun columns).
function propagate(transparent: Transparent, light: Uint8Array, queue: IntQueue): void {
  while (queue.size > 0) {
    const index = queue.shift()
    const level = light[index]!
    if (level <= 1 && level !== MAX_LIGHT) continue
    const x = index % X
    const y = Math.floor(index / STRIDE_Y) % Y
    const z = Math.floor(index / STRIDE_Z)
    for (const [dx, dy, dz] of NEIGHBOURS) {
      const nx = x + dx
      const ny = y + dy
      const nz = z + dz
      if (nx < 0 || ny < 0 || nz < 0 || nx >= X || ny >= Y || nz >= Z) continue
      if (!transparent(nx, ny, nz)) continue
      const next = level === MAX_LIGHT && dy === -1 ? MAX_LIGHT : level - 1
      const nIndex = lightIndex(nx, ny, nz)
      if (light[nIndex]! >= next) continue
      light[nIndex] = next
      queue.push(nIndex)
    }
  }
}

// Full flood fill: sun columns from the top, then BFS into the shade.
export function computeSkylight(world: World): Uint8Array {
  const light = new Uint8Array(X * Y * Z)
  const transparent = bakedTransparency(world)
  const queue = new IntQueue()
  for (let z = 0; z < Z; z++)
    for (let x = 0; x < X; x++) {
      for (let y = Y - 1; y >= 0; y--) {
        if (!transparent(x, y, z)) break
        const index = lightIndex(x, y, z)
        light[index] = MAX_LIGHT
        queue.push(index)
      }
    }
  propagate(transparent, light, queue)
  return light
}

// Re-floods around one edited block. Removing light (a block placed) uses the Seeds of Andromeda
// scheme: clear every cell that was lit from here, remembering the brighter cells at the rim, then
// propagate from the rim. Adding light (a block removed) seeds the cell from its neighbours.
export function updateSkylight(
  world: World,
  light: Uint8Array,
  x: number,
  y: number,
  z: number,
): void {
  const index = lightIndex(x, y, z)
  const transparent = worldTransparency(world)
  const removal = new IntQueue()
  const spread = new IntQueue()

  if (!transparent(x, y, z)) {
    const old = light[index]!
    light[index] = 0
    if (old > 0) {
      removal.push(index * 16 + old)
      unlight(transparent, light, removal, spread)
    }
    return
  }

  // Block removed: light arrives from the neighbours (down from a sun cell keeps 15).
  let best = 0
  for (const [dx, dy, dz] of NEIGHBOURS) {
    const nx = x + dx
    const ny = y + dy
    const nz = z + dz
    if (nx < 0 || ny < 0 || nz < 0 || nx >= X || ny >= Y || nz >= Z) {
      if (dy === 1) best = MAX_LIGHT
      continue
    }
    const level = light[lightIndex(nx, ny, nz)]!
    const candidate = level === MAX_LIGHT && dy === 1 ? MAX_LIGHT : level - 1
    if (candidate > best) best = candidate
  }
  light[index] = best
  if (best > 0) {
    spread.push(index)
    propagate(transparent, light, spread)
  }
}

// Queue entries pack (index * 16 + old level) so the old brightness travels with the cell.
function unlight(
  transparent: Transparent,
  light: Uint8Array,
  removal: IntQueue,
  spread: IntQueue,
): void {
  while (removal.size > 0) {
    const packed = removal.shift()
    const index = Math.floor(packed / 16)
    const old = packed % 16
    const x = index % X
    const y = Math.floor(index / STRIDE_Y) % Y
    const z = Math.floor(index / STRIDE_Z)
    for (const [dx, dy, dz] of NEIGHBOURS) {
      const nx = x + dx
      const ny = y + dy
      const nz = z + dz
      if (nx < 0 || ny < 0 || nz < 0 || nx >= X || ny >= Y || nz >= Z) continue
      const nIndex = lightIndex(nx, ny, nz)
      const level = light[nIndex]!
      if (level === 0) continue
      // A sun column below keeps 15 only while the cell above is still a sun cell.
      const litFromHere = level < old || (old === MAX_LIGHT && dy === -1 && level === MAX_LIGHT)
      if (litFromHere && transparent(nx, ny, nz)) {
        light[nIndex] = 0
        removal.push(nIndex * 16 + level)
      } else if (level >= old || (level === MAX_LIGHT && dy !== -1)) {
        spread.push(nIndex)
      }
    }
  }
  propagate(transparent, light, spread)
}
