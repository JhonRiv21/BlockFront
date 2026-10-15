import { CHUNK_SIZE } from '../config.ts'
import { FACE_LAYER, FLAG, FLAGS, isCross, isLiquid } from './blocks.ts'

// Input: the chunk plus a one-voxel border from its neighbours, so faces on the chunk edge are
// culled and shaded exactly like interior ones. Coordinates run from -1 to CHUNK_SIZE.
export const PADDED_SIZE = CHUNK_SIZE + 2

export function paddedIndex(x: number, y: number, z: number): number {
  return x + 1 + (y + 1) * PADDED_SIZE + (z + 1) * PADDED_SIZE * PADDED_SIZE
}

// Greedy-meshed faces: cubes in the opaque pass, water in the liquid pass.
export interface SurfaceMesh {
  positions: Float32Array
  normals: Int8Array
  layers: Uint8Array
  blockIds: Uint8Array
  ao: Uint8Array
  indices: Uint32Array
  quadCount: number
}

// Cross quads (tall grass, flowers) with explicit UVs, outside the greedy pass.
export interface DecorMesh {
  positions: Float32Array
  uvs: Float32Array
  layers: Uint8Array
  indices: Uint32Array
  quadCount: number
}

export interface ChunkMesh extends SurfaceMesh {
  liquid: SurfaceMesh
  decor: DecorMesh
}

// The water surface sits at 8/9 of the block, as in Minecraft.
export const LIQUID_SURFACE = 8 / 9

const STRIDE = [1, PADDED_SIZE, PADDED_SIZE * PADDED_SIZE] as const

// Per-vertex AO as in 0fps: two touching sides fully occlude, otherwise count the neighbours.
function vertexAo(side1: boolean, side2: boolean, corner: boolean): number {
  if (side1 && side2) return 0
  return 3 - (Number(side1) + Number(side2) + Number(corner))
}

class SurfaceBuilder {
  positions: number[] = []
  normals: number[] = []
  layers: number[] = []
  blockIds: number[] = []
  ao: number[] = []
  indices: number[] = []
  quadCount = 0

  // Corners in order: (0,0) (w,0) (w,h) (0,h) in (u,v) space; ao[] matches that order.
  addQuad(
    corners: readonly (readonly [number, number, number])[],
    normal: readonly [number, number, number],
    layer: number,
    blockId: number,
    ao: readonly [number, number, number, number],
    flipWinding: boolean,
  ): void {
    const base = this.positions.length / 3
    const order = flipWinding ? [0, 3, 2, 1] : [0, 1, 2, 3]
    for (const c of order) {
      const corner = corners[c]!
      this.positions.push(corner[0], corner[1], corner[2])
      this.normals.push(normal[0], normal[1], normal[2])
      this.layers.push(layer)
      this.blockIds.push(blockId)
      this.ao.push(ao[c]!)
    }
    // Put the diagonal through the brighter pair so AO never leaves a dark band across the quad.
    const a0 = ao[order[0]!]!
    const a1 = ao[order[1]!]!
    const a2 = ao[order[2]!]!
    const a3 = ao[order[3]!]!
    if (a0 + a2 >= a1 + a3) {
      this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    } else {
      this.indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base)
    }
    this.quadCount++
  }

  build(): SurfaceMesh {
    return {
      positions: Float32Array.from(this.positions),
      normals: Int8Array.from(this.normals),
      layers: Uint8Array.from(this.layers),
      blockIds: Uint8Array.from(this.blockIds),
      ao: Uint8Array.from(this.ao),
      indices: Uint32Array.from(this.indices),
      quadCount: this.quadCount,
    }
  }
}

type Pass = 'opaque' | 'liquid'

// Which side of the a|b boundary owns a visible face in this pass: 'front' (a's +d face),
// 'back' (b's -d face) or none.
// 0 = no face, 1 = front (a's +d face), 2 = back (b's -d face). Flags only, no object lookups.
function faceBetween(aFlags: number, bFlags: number, ownerBit: number): number {
  if (ownerBit === FLAG.cube) {
    if (aFlags & FLAG.cube && !(bFlags & FLAG.opaque)) return 1
    if (bFlags & FLAG.cube && !(aFlags & FLAG.opaque)) return 2
    return 0
  }
  const aLiquid = aFlags & FLAG.liquid
  const bLiquid = bFlags & FLAG.liquid
  if (aLiquid && !bLiquid && !(bFlags & FLAG.opaque)) return 1
  if (bLiquid && !aLiquid && !(aFlags & FLAG.opaque)) return 2
  return 0
}

// Greedy meshing (0fps) over the three axes; a mask cell carries block id, side and AO pattern,
// and only identical cells are merged into one quad. The texture layer comes from the face.
function sweep(voxels: Uint8Array, pass: Pass): SurfaceMesh {
  const S = CHUNK_SIZE
  const builder = new SurfaceBuilder()
  const mask = new Int32Array(S * S)
  const pos: [number, number, number] = [0, 0, 0]
  const occludes = (index: number) => ((FLAGS[voxels[index] ?? 0] ?? 0) & FLAG.opaque) !== 0
  const ownerBit = pass === 'opaque' ? FLAG.cube : FLAG.liquid

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3
    const v = (d + 2) % 3
    const du = STRIDE[u]!
    const dv = STRIDE[v]!
    const dd = STRIDE[d]!

    for (let slice = -1; slice < S; slice++) {
      let n = 0
      for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) {
          pos[d] = slice
          pos[u] = i
          pos[v] = j
          const index = paddedIndex(pos[0], pos[1], pos[2])
          const a = voxels[index] ?? 0
          const b = voxels[index + dd] ?? 0
          const side = faceBetween(FLAGS[a] ?? 0, FLAGS[b] ?? 0, ownerBit)
          // Faces owned by a block in the padding belong to the neighbour chunk.
          if (side === 0 || (side === 2 ? slice + 1 >= S : slice < 0)) {
            mask[n++] = 0
            continue
          }
          const backface = side === 2
          const airIndex = backface ? index : index + dd
          const blockId = backface ? b : a
          const sideNeg = (step: number) => occludes(airIndex - step)
          const sidePos = (step: number) => occludes(airIndex + step)
          const cornerAt = (su: number, sv: number) => occludes(airIndex + su * du + sv * dv)
          const ao00 = vertexAo(sideNeg(du), sideNeg(dv), cornerAt(-1, -1))
          const ao10 = vertexAo(sidePos(du), sideNeg(dv), cornerAt(1, -1))
          const ao11 = vertexAo(sidePos(du), sidePos(dv), cornerAt(1, 1))
          const ao01 = vertexAo(sideNeg(du), sidePos(dv), cornerAt(-1, 1))
          mask[n++] =
            blockId |
            (ao00 << 8) |
            (ao10 << 10) |
            (ao11 << 12) |
            (ao01 << 14) |
            ((backface ? 1 : 0) << 16)
        }
      }

      n = 0
      for (let j = 0; j < S; j++) {
        for (let i = 0; i < S;) {
          const cell = mask[n]!
          if (cell === 0) {
            i++
            n++
            continue
          }
          let w = 1
          while (i + w < S && mask[n + w] === cell) w++
          let h = 1
          outer: for (; j + h < S; h++) {
            for (let k = 0; k < w; k++) {
              if (mask[n + k + h * S] !== cell) break outer
            }
          }

          const backface = (cell >> 16) & 1
          const blockId = cell & 0xff
          const ao: [number, number, number, number] = [
            (cell >> 8) & 3,
            (cell >> 10) & 3,
            (cell >> 12) & 3,
            (cell >> 14) & 3,
          ]
          const origin: [number, number, number] = [0, 0, 0]
          origin[d] = slice + 1
          origin[u] = i
          origin[v] = j
          // Water tops drop to the liquid surface height.
          if (pass === 'liquid' && d === 1 && !backface) origin[1] = slice + LIQUID_SURFACE
          const alongU: [number, number, number] = [0, 0, 0]
          alongU[u] = w
          const alongV: [number, number, number] = [0, 0, 0]
          alongV[v] = h
          const corners = [
            origin,
            [origin[0] + alongU[0], origin[1] + alongU[1], origin[2] + alongU[2]],
            [
              origin[0] + alongU[0] + alongV[0],
              origin[1] + alongU[1] + alongV[1],
              origin[2] + alongU[2] + alongV[2],
            ],
            [origin[0] + alongV[0], origin[1] + alongV[1], origin[2] + alongV[2]],
          ] as const
          const normal: [number, number, number] = [0, 0, 0]
          normal[d] = backface ? -1 : 1
          const face = d * 2 + backface
          const layer = FACE_LAYER[blockId * 6 + face] ?? 0
          builder.addQuad(corners, normal, layer, blockId, ao, backface === 1)

          for (let l = 0; l < h; l++) for (let k = 0; k < w; k++) mask[n + k + l * S] = 0
          i += w
          n += w
        }
      }
    }
  }

  return builder.build()
}

// Two diagonal quads per cross block, straight from the voxel grid.
function meshDecor(voxels: Uint8Array): DecorMesh {
  const S = CHUNK_SIZE
  const positions: number[] = []
  const uvs: number[] = []
  const layers: number[] = []
  const indices: number[] = []
  let quadCount = 0
  const addQuad = (corners: [number, number, number][], layer: number) => {
    const base = positions.length / 3
    const uv = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]
    corners.forEach((corner, i) => {
      positions.push(corner[0], corner[1], corner[2])
      uvs.push(uv[i]![0]!, uv[i]![1]!)
      layers.push(layer)
    })
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    quadCount++
  }
  for (let z = 0; z < S; z++)
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const id = voxels[paddedIndex(x, y, z)] ?? 0
        if (!isCross(id)) continue
        const layer = FACE_LAYER[id * 6] ?? 0
        addQuad(
          [
            [x, y, z],
            [x + 1, y, z + 1],
            [x + 1, y + 1, z + 1],
            [x, y + 1, z],
          ],
          layer,
        )
        addQuad(
          [
            [x + 1, y, z],
            [x, y, z + 1],
            [x, y + 1, z + 1],
            [x + 1, y + 1, z],
          ],
          layer,
        )
      }
  return {
    positions: Float32Array.from(positions),
    uvs: Float32Array.from(uvs),
    layers: Uint8Array.from(layers),
    indices: Uint32Array.from(indices),
    quadCount,
  }
}

export function meshChunk(voxels: Uint8Array): ChunkMesh {
  const opaque = sweep(voxels, 'opaque')
  let hasLiquid = false
  for (let i = 0; i < voxels.length && !hasLiquid; i++) hasLiquid = isLiquid(voxels[i] ?? 0)
  const liquid = hasLiquid
    ? sweep(voxels, 'liquid')
    : {
        positions: new Float32Array(0),
        normals: new Int8Array(0),
        layers: new Uint8Array(0),
        blockIds: new Uint8Array(0),
        ao: new Uint8Array(0),
        indices: new Uint32Array(0),
        quadCount: 0,
      }
  return { ...opaque, liquid, decor: meshDecor(voxels) }
}
