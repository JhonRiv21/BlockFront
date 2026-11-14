import { describe, expect, it } from 'vitest'
import { findPath, type Cell, type NavWorld } from './navigation.ts'

// Written from docs/final-scope.md §4 (Navegación): A* over the voxel grid with walking, a
// 1-block jump, drops of up to 3 and swimming, water costing more, and a node budget. A node
// is the cell the feet stand in; the body takes two cells.
// Written with the implementation in context (same session); the cases come from the spec.

type Grid = (x: number, y: number, z: number) => boolean

function world(solid: Grid, liquid: Grid = () => false): NavWorld {
  return { isSolid: solid, isLiquid: liquid }
}

// Bedrock-like floor at y = 0 everywhere; feet stand at y = 1.
const floor: Grid = (_x, y) => y <= 0
const or =
  (...grids: Grid[]): Grid =>
  (x, y, z) =>
    grids.some((g) => g(x, y, z))

const options = { maxNodes: 20000 }

function crosses(cells: Cell[], test: (c: Cell) => boolean): boolean {
  return cells.some(test)
}

describe('A* on the voxel grid', () => {
  it('walks across flat ground and ends on the goal', () => {
    const result = findPath(world(floor), [2, 1, 2], [12, 1, 2], options)
    expect(result.status).toBe('found')
    expect(result.cells.at(-1)).toEqual([12, 1, 2])
  })

  it('climbs a one-block step, but not a two-block wall', () => {
    const step = or(floor, (x, y) => x >= 6 && y <= 1)
    const up = findPath(world(step), [2, 1, 2], [10, 2, 2], options)
    expect(up.status).toBe('found')
    expect(up.cells.at(-1)).toEqual([10, 2, 2])
    // Consecutive cells never rise more than one block.
    let previous: Cell = [2, 1, 2]
    for (const cell of up.cells) {
      expect(cell[1] - previous[1]).toBeLessThanOrEqual(1)
      previous = cell
    }

    // A cliff two blocks high along the whole width.
    const cliff = or(floor, (x, y) => x >= 6 && y <= 2)
    const blocked = findPath(world(cliff), [2, 1, 2], [10, 3, 2], { maxNodes: 3000 })
    expect(blocked.status).not.toBe('found')
  })

  it('drops up to three blocks, not four', () => {
    // A ledge at x < 6; the ground beyond is 3 (then 4) blocks lower.
    const ledge = (height: number) => or(floor, (x, y) => x < 6 && y <= height)
    const three = findPath(world(ledge(3)), [2, 4, 2], [10, 1, 2], options)
    expect(three.status).toBe('found')
    const four = findPath(world(ledge(4)), [2, 5, 2], [10, 1, 2], { maxNodes: 3000 })
    expect(four.status).not.toBe('found')
  })

  it('goes round a wall and never through it', () => {
    const wall: Grid = (x, y, z) => x === 6 && y >= 1 && y <= 4 && z <= 10
    const result = findPath(world(or(floor, wall)), [2, 1, 5], [10, 1, 5], options)
    expect(result.status).toBe('found')
    expect(crosses(result.cells, ([x, y, z]) => wall(x, y, z) || wall(x, y + 1, z))).toBe(false)
    // It has to pass the wall's open end.
    expect(crosses(result.cells, ([, , z]) => z > 10)).toBe(true)
  })

  it('reports no route out of a closed pen', () => {
    const ring = (a: number, b: number) => (a === 0 || a === 6) && b >= 0 && b <= 6
    const pen: Grid = (x, y, z) => y >= 1 && y <= 3 && (ring(x, z) || ring(z, x))
    const result = findPath(world(or(floor, pen)), [3, 1, 3], [20, 1, 20], options)
    expect(result.status).toBe('none')
    expect(result.cells).toEqual([])
    expect(result.expanded).toBeLessThan(options.maxNodes)
  })

  describe('water', () => {
    // Banks stand at y = 2 (solid up to 1); the river x 4..9 has its bed at 0 and water at 1.
    const river: Grid = (x, y) => x >= 4 && x <= 9 && y === 1
    const banks = (bridgeZ: number | null): Grid =>
      or(floor, (x, y, z) => y <= 1 && (x < 4 || x > 9 || z === bridgeZ))
    const wet = (cells: Cell[]) => crosses(cells, ([x, y, z]) => river(x, y, z))

    it('swims across when there is no dry way', () => {
      const result = findPath(world(banks(null), river), [2, 2, 8], [12, 2, 8], options)
      expect(result.status).toBe('found')
      expect(result.cells.at(-1)).toEqual([12, 2, 8])
      expect(wet(result.cells)).toBe(true)
    })

    it('prefers a short dry detour over a swim', () => {
      // A bridge 3 blocks to the side: 6 extra blocks on foot beat 6 blocks of water.
      const solid = banks(11)
      const liquid: Grid = (x, y, z) => river(x, y, z) && z !== 11
      const result = findPath(world(solid, liquid), [2, 2, 8], [12, 2, 8], options)
      expect(result.status).toBe('found')
      expect(crosses(result.cells, ([x, y, z]) => liquid(x, y, z))).toBe(false)
    })

    it('but swims rather than walk a long way round', () => {
      const solid = banks(60)
      const liquid: Grid = (x, y, z) => river(x, y, z) && z !== 60
      const result = findPath(world(solid, liquid), [2, 2, 8], [12, 2, 8], options)
      expect(result.status).toBe('found')
      expect(crosses(result.cells, ([x, y, z]) => liquid(x, y, z))).toBe(true)
    })
  })

  it('stops at the node budget with a partial path toward the goal', () => {
    const result = findPath(world(floor), [2, 1, 2], [90, 1, 120], { maxNodes: 50 })
    expect(result.status).toBe('partial')
    expect(result.expanded).toBeLessThanOrEqual(50)
    const end = result.cells.at(-1)!
    const distance = (c: Cell) => Math.hypot(90 - c[0], 120 - c[2])
    expect(distance(end)).toBeLessThan(distance([2, 1, 2]))
  })
})
