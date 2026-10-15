import {
  DataArrayTexture,
  NearestFilter,
  NearestMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three'
import { bakeTextures, TEXEL_SIZE, TOTAL_LAYERS } from './bake-textures.ts'

// Uploads the baked layers as one array texture with mipmaps, so distant blocks do not shimmer.
export function createBlockTextures(): { texture: DataArrayTexture; bakeMs: number } {
  const start = performance.now()
  const data = bakeTextures()
  const bakeMs = performance.now() - start
  const texture = new DataArrayTexture(data, TEXEL_SIZE, TEXEL_SIZE, TOTAL_LAYERS)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.magFilter = NearestFilter
  texture.minFilter = NearestMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return { texture, bakeMs }
}
