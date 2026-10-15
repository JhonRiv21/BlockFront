import { describe, expect, it } from 'vitest'
import { buildSides, GRENADE_ART, rasterize, SHOVEL_ART, sideFaces } from './sprite-geometry.ts'

// Written from docs/f2-6-feel.md §1: side faces only where an opaque pixel meets a
// transparent one. One pixel alone gives 4, a line of 3 gives 8, and there are no faces
// between opaque neighbours.

describe('sideFaces', () => {
  it('one pixel alone has four sides', () => {
    const alpha = new Uint8Array(16 * 16)
    alpha[5 + 5 * 16] = 1
    expect(sideFaces(alpha, 16, 16)).toHaveLength(4)
  })

  it('a horizontal line of three pixels has eight', () => {
    const alpha = new Uint8Array(16 * 16)
    for (let x = 4; x < 7; x++) alpha[x + 8 * 16] = 1
    const faces = sideFaces(alpha, 16, 16)
    expect(faces).toHaveLength(8)
    expect(faces.filter((f) => f.dir === 'left')).toHaveLength(1)
    expect(faces.filter((f) => f.dir === 'right')).toHaveLength(1)
    expect(faces.filter((f) => f.dir === 'top')).toHaveLength(3)
  })

  it('never puts a face between two opaque neighbours', () => {
    const alpha = new Uint8Array(16 * 16).fill(1)
    // A full sprite only has its 64 outer edges.
    expect(sideFaces(alpha, 16, 16)).toHaveLength(64)
  })

  it('a pixel on the sprite border still gets its outer side', () => {
    const alpha = new Uint8Array(16 * 16)
    alpha[0] = 1
    expect(sideFaces(alpha, 16, 16)).toHaveLength(4)
  })
})

describe('buildSides', () => {
  it('makes one quad per side face with darkened vertex colours', () => {
    const alpha = new Uint8Array(4)
    alpha[0] = 1
    const colors = new Uint32Array([0xff8000, 0, 0, 0])
    const geometry = buildSides(sideFaces(alpha, 2, 2), colors, 2, 2, 1 / 16, 0.5)
    expect(geometry.positions.length).toBe(4 * 4 * 3)
    expect(geometry.indices.length).toBe(4 * 6)
    expect(geometry.colors[0]).toBeCloseTo(0.5, 6)
    expect(geometry.colors[1]).toBeCloseTo(0.5 * (0x80 / 255), 6)
    expect(geometry.colors[2]).toBe(0)
    for (let i = 2; i < geometry.positions.length; i += 3) {
      expect(Math.abs(geometry.positions[i]!)).toBeCloseTo(1 / 32, 9)
    }
  })
})

describe('sprite art', () => {
  it('is 16×16 and uses only palette characters', () => {
    for (const art of [SHOVEL_ART, GRENADE_ART]) {
      expect(art.rows).toHaveLength(16)
      for (const row of art.rows) {
        expect(row).toHaveLength(16)
        for (const ch of row) expect(ch === '.' || ch in art.palette).toBe(true)
      }
      const { alpha } = rasterize(art)
      expect(alpha.reduce((a, b) => a + b, 0)).toBeGreaterThan(20)
    }
  })

  it('the shovel runs diagonally from bottom-left to top-right with a margin', () => {
    const { alpha } = rasterize(SHOVEL_ART)
    const at = (x: number, y: number) => alpha[x + y * 16]
    expect(at(2, 1)).toBe(1)
    expect(at(10, 13)).toBe(1)
    for (let x = 0; x < 16; x++) expect(at(x, 15)).toBe(0)
  })
})
