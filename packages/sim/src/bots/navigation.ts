import { WORLD_SIZE } from '../config.ts'
import type { Vec3 } from '../physics/sweep.ts'

// Grid A* for bots (docs/final-scope.md §4): a node is the cell the feet occupy. Moves walk
// (diagonals only on the level), jump one block, drop up to three (deeper into water) and swim
// along the water surface, which costs more.

export interface NavWorld {
  isSolid(x: number, y: number, z: number): boolean
  isLiquid(x: number, y: number, z: number): boolean
  // Solid blocks not to stand on (tree tops); absent means any solid will do.
  noFooting?(x: number, y: number, z: number): boolean
}

export type Cell = [number, number, number]

export interface PathResult {
  // 'partial' ran out of nodes and leads to the expanded cell closest to the goal.
  status: 'found' | 'partial' | 'none'
  cells: Cell[]
  expanded: number
}

export interface PathOptions {
  maxNodes: number
  // Heuristic weight: above 1 trades optimality for fewer expansions.
  weight?: number
}

export const NAV_COST = {
  diagonal: Math.SQRT2,
  jump: 1,
  dropPerBlock: 0.5,
  waterFactor: 3,
  waterExit: 2,
  safeDrop: 3,
  waterDrop: 8,
} as const

const SX = WORLD_SIZE.x
const SZ = WORLD_SIZE.z
const SY = WORLD_SIZE.y

export function cellKey(x: number, y: number, z: number): number {
  return x + z * SX + y * SX * SZ
}

export function keyCell(key: number): Cell {
  const x = key % SX
  const z = Math.floor(key / SX) % SZ
  const y = Math.floor(key / (SX * SZ))
  return [x, y, z]
}

function inside(x: number, y: number, z: number): boolean {
  return x >= 0 && z >= 0 && y >= 1 && x < SX && z < SZ && y < SY - 2
}

// Two free cells for the body and something to hold it: ground below or the water surface.
export function standable(w: NavWorld, x: number, y: number, z: number): boolean {
  if (!inside(x, y, z) || w.isSolid(x, y, z) || w.isSolid(x, y + 1, z)) return false
  if (w.isSolid(x, y - 1, z)) return !w.noFooting?.(x, y - 1, z)
  return w.isLiquid(x, y, z) && !w.isLiquid(x, y + 1, z)
}

// The standable cell nearest to a point: its own column first (up to 6 above, 10 below,
// nearest first, the surface when under water), then rings around it.
export function nearestStandable(w: NavWorld, pos: Vec3, radius = 3): Cell | null {
  const bx = Math.floor(pos[0])
  const by = Math.floor(pos[1] + 0.01)
  const bz = Math.floor(pos[2])
  const column = (x: number, z: number): Cell | null => {
    for (let d = 0; d <= 10; d++) {
      if (d <= 6 && standable(w, x, by + d, z)) return [x, by + d, z]
      if (d > 0 && standable(w, x, by - d, z)) return [x, by - d, z]
    }
    return null
  }
  const own = column(bx, bz)
  if (own) return own
  for (let r = 1; r <= radius; r++) {
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
        const found = column(bx + dx, bz + dz)
        if (found) return found
      }
  }
  return null
}

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

type Visit = (x: number, y: number, z: number, cost: number) => void

function bodyClear(w: NavWorld, x: number, y: number, z: number): boolean {
  return !w.isSolid(x, y, z) && !w.isSolid(x, y + 1, z)
}

export function neighbours(w: NavWorld, x: number, y: number, z: number, visit: Visit): void {
  const wet = w.isLiquid(x, y, z)
  for (let i = 0; i < DIRS.length; i++) {
    const [dx, dz] = DIRS[i]!
    const nx = x + dx
    const nz = z + dz
    if (i >= 4) {
      // Diagonals only on the level and never across a corner.
      if (!bodyClear(w, x + dx, y, z) || !bodyClear(w, x, y, z + dz)) continue
      if (!standable(w, nx, y, nz)) continue
      const factor = wet || w.isLiquid(nx, y, nz) ? NAV_COST.waterFactor : 1
      visit(nx, y, nz, NAV_COST.diagonal * factor)
      continue
    }
    if (standable(w, nx, y, nz)) {
      const factor = wet || w.isLiquid(nx, y, nz) ? NAV_COST.waterFactor : 1
      visit(nx, y, nz, factor)
      continue
    }
    if (w.isSolid(nx, y, nz) || w.isSolid(nx, y + 1, nz)) {
      // Something in the way: a one-block step with headroom above (also the way out of water).
      if (w.isSolid(x, y + 2, z) || !standable(w, nx, y + 1, nz)) continue
      visit(nx, y + 1, nz, 1 + (wet ? NAV_COST.waterExit : NAV_COST.jump))
      continue
    }
    // An open edge: fall to the first thing below, within the safe height (deeper into water).
    for (let k = 1; k <= NAV_COST.waterDrop; k++) {
      const ny = y - k
      if (ny < 1 || w.isSolid(nx, ny, nz)) break
      if (!standable(w, nx, ny, nz)) continue
      const wetLanding = w.isLiquid(nx, ny, nz) || w.isLiquid(nx, ny - 1, nz)
      if (k <= NAV_COST.safeDrop || wetLanding)
        visit(nx, ny, nz, (1 + NAV_COST.dropPerBlock * k) * (wetLanding ? NAV_COST.waterFactor : 1))
      break
    }
  }
}

// Binary min-heap of node keys ordered by f; ties break on insertion order so the search is the
// same on every run.
class OpenHeap {
  private keys: number[] = []
  private f: number[] = []
  private order: number[] = []
  private counter = 0

  get size(): number {
    return this.keys.length
  }

  push(key: number, f: number): void {
    this.keys.push(key)
    this.f.push(f)
    this.order.push(this.counter++)
    this.up(this.keys.length - 1)
  }

  pop(): number {
    const top = this.keys[0]!
    const lastKey = this.keys.pop()!
    const lastF = this.f.pop()!
    const lastOrder = this.order.pop()!
    if (this.keys.length > 0) {
      this.keys[0] = lastKey
      this.f[0] = lastF
      this.order[0] = lastOrder
      this.down(0)
    }
    return top
  }

  private less(a: number, b: number): boolean {
    return this.f[a]! < this.f[b]! || (this.f[a] === this.f[b] && this.order[a]! < this.order[b]!)
  }

  private swap(a: number, b: number): void {
    ;[this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!]
    ;[this.f[a], this.f[b]] = [this.f[b]!, this.f[a]!]
    ;[this.order[a], this.order[b]] = [this.order[b]!, this.order[a]!]
  }

  private up(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (!this.less(i, parent)) return
      this.swap(i, parent)
      i = parent
    }
  }

  private down(i: number): void {
    const n = this.keys.length
    for (;;) {
      const l = i * 2 + 1
      const r = l + 1
      let best = i
      if (l < n && this.less(l, best)) best = l
      if (r < n && this.less(r, best)) best = r
      if (best === i) return
      this.swap(i, best)
      i = best
    }
  }
}

function octile(ax: number, az: number, bx: number, bz: number): number {
  const dx = Math.abs(ax - bx)
  const dz = Math.abs(az - bz)
  return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)
}

// Open-addressed table of the nodes one search touches, cleared by bumping a generation, so
// a search allocates nothing per node. Lookups are exact: results match a plain map.
const TABLE_BITS = 17
const TABLE_SIZE = 1 << TABLE_BITS
const TABLE_LIMIT = Math.floor(TABLE_SIZE * 0.7)

class NodeTable {
  readonly keys = new Int32Array(TABLE_SIZE)
  readonly g = new Float64Array(TABLE_SIZE)
  readonly parent = new Int32Array(TABLE_SIZE)
  readonly closed = new Uint8Array(TABLE_SIZE)
  private readonly stamp = new Uint32Array(TABLE_SIZE)
  private gen = 0
  count = 0

  reset(): void {
    this.gen++
    this.count = 0
  }

  // The slot of a key, added (with g = ∞) if this search has not touched it yet.
  slot(key: number): number {
    let i = Math.imul(key, 0x9e3779b1) >>> (32 - TABLE_BITS)
    for (;;) {
      if (this.stamp[i] !== this.gen) {
        this.stamp[i] = this.gen
        this.keys[i] = key
        this.g[i] = Infinity
        this.parent[i] = -1
        this.closed[i] = 0
        this.count++
        return i
      }
      if (this.keys[i] === key) return i
      i = (i + 1) & (TABLE_SIZE - 1)
    }
  }
}

let table: NodeTable | null = null

export function findPath(w: NavWorld, start: Cell, goal: Cell, options: PathOptions): PathResult {
  const weight = options.weight ?? 1
  const nodes = (table ??= new NodeTable())
  nodes.reset()
  const [gx, gy, gz] = goal
  const goalKey = cellKey(gx, gy, gz)
  const h = (x: number, y: number, z: number) => octile(x, z, gx, gz) + Math.abs(y - gy) * 0.25
  const startKey = cellKey(...start)
  nodes.g[nodes.slot(startKey)] = 0
  const open = new OpenHeap()
  open.push(startKey, h(...start) * weight)
  let best = startKey
  let bestH = h(...start)
  let expanded = 0
  let base = 0
  let current = startKey
  const visit: Visit = (nx, ny, nz, cost) => {
    const next = cellKey(nx, ny, nz)
    const i = nodes.slot(next)
    if (nodes.closed[i]) return
    const tentative = base + cost
    if (nodes.g[i]! <= tentative) return
    nodes.g[i] = tentative
    nodes.parent[i] = current
    open.push(next, tentative + h(nx, ny, nz) * weight)
  }
  while (open.size > 0) {
    const key = open.pop()
    const i = nodes.slot(key)
    if (nodes.closed[i]) continue
    if (key === goalKey) return { status: 'found', cells: rebuild(nodes, key), expanded }
    if (expanded >= options.maxNodes || nodes.count > TABLE_LIMIT)
      return { status: 'partial', cells: rebuild(nodes, best), expanded }
    nodes.closed[i] = 1
    expanded++
    const x = key % SX
    const z = Math.floor(key / SX) % SZ
    const y = Math.floor(key / (SX * SZ))
    const here = h(x, y, z)
    if (here < bestH) {
      bestH = here
      best = key
    }
    base = nodes.g[i]!
    current = key
    neighbours(w, x, y, z, visit)
  }
  return { status: 'none', cells: [], expanded }
}

function rebuild(nodes: NodeTable, end: number): Cell[] {
  const cells: Cell[] = []
  let key = end
  for (;;) {
    const parent = nodes.parent[nodes.slot(key)]!
    if (parent < 0) break
    cells.push(keyCell(key))
    key = parent
  }
  return cells.reverse()
}
