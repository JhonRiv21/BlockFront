import { describe, expect, it } from 'vitest'
import {
  BLOCK,
  BLOCKS,
  FACE,
  FACE_LAYER,
  FLAG,
  FLAGS,
  LAYER,
  isOpaque,
  isSolid,
  renderKind,
} from './blocks.ts'

// Written from docs/f2-5-polish.md §1.1: a block registry compiled into typed tables,
// FACE_LAYER = Uint8Array(256 * 6) and FLAGS = Uint8Array(256).

describe('block registry tables', () => {
  it('compiles to the typed tables of the spec', () => {
    expect(FACE_LAYER).toBeInstanceOf(Uint8Array)
    expect(FACE_LAYER.length).toBe(256 * 6)
    expect(FLAGS).toBeInstanceOf(Uint8Array)
    expect(FLAGS.length).toBe(256)
  })

  it('air renders nothing and is neither solid nor opaque', () => {
    expect(renderKind(BLOCK.air)).toBe('none')
    expect(isSolid(BLOCK.air)).toBe(false)
    expect(isOpaque(BLOCK.air)).toBe(false)
    expect(FLAGS[BLOCK.air]).toBe(0)
  })

  it('grass: grass_top above, grass_side around, dirt below', () => {
    expect(FACE_LAYER[BLOCK.grass * 6 + FACE.top]).toBe(LAYER.grassTop)
    expect(FACE_LAYER[BLOCK.grass * 6 + FACE.bottom]).toBe(LAYER.dirt)
    for (const face of [FACE.east, FACE.west, FACE.south, FACE.north]) {
      expect(FACE_LAYER[BLOCK.grass * 6 + face]).toBe(LAYER.grassSide)
    }
  })

  it('log: rings on top and bottom, bark on the sides', () => {
    expect(FACE_LAYER[BLOCK.log * 6 + FACE.top]).toBe(LAYER.logRings)
    expect(FACE_LAYER[BLOCK.log * 6 + FACE.bottom]).toBe(LAYER.logRings)
    expect(FACE_LAYER[BLOCK.log * 6 + FACE.east]).toBe(LAYER.bark)
  })

  it('leaves are opaque solid cubes', () => {
    expect(renderKind(BLOCK.leaves)).toBe('cube')
    expect(isSolid(BLOCK.leaves)).toBe(true)
    expect(isOpaque(BLOCK.leaves)).toBe(true)
  })

  it('tall grass and flowers render as a cross, with no collision and no opacity', () => {
    for (const id of [BLOCK.tallGrass, BLOCK.flower, BLOCK.flowerYellow]) {
      expect(renderKind(id)).toBe('cross')
      expect(isSolid(id)).toBe(false)
      expect(isOpaque(id)).toBe(false)
    }
  })

  it('water is a liquid that neither blocks movement nor light', () => {
    expect(renderKind(BLOCK.water)).toBe('liquid')
    expect(FLAGS[BLOCK.water]! & FLAG.liquid).not.toBe(0)
    expect(isSolid(BLOCK.water)).toBe(false)
    expect(isOpaque(BLOCK.water)).toBe(false)
  })

  it('bedrock is solid and opaque', () => {
    expect(isSolid(BLOCK.bedrock)).toBe(true)
    expect(isOpaque(BLOCK.bedrock)).toBe(true)
  })

  it('player blocks use the plain layer with a colour tint', () => {
    for (const id of [BLOCK.blue, BLOCK.red]) {
      const def = BLOCKS[id]!
      expect(def.faces.top).toBe(LAYER.plain)
      expect(def.faces.side).toBe(LAYER.plain)
      expect(def.tint).toBeDefined()
      expect(def.tint).not.toBe(0xffffff)
    }
    expect(BLOCKS[BLOCK.blue]!.tint).not.toBe(BLOCKS[BLOCK.red]!.tint)
  })

  it('every registered block has six faces and the same table flags', () => {
    for (const def of BLOCKS) {
      if (!def) continue
      for (let face = 0; face < 6; face++) {
        expect(FACE_LAYER[def.id * 6 + face]).toBeGreaterThanOrEqual(0)
      }
      expect(isSolid(def.id)).toBe(def.solid)
      expect(isOpaque(def.id)).toBe(def.opaque)
    }
  })
})
