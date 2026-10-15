import type { Material, WebGLProgramParametersWithUniforms } from 'three'

// Three's fog uses the camera-axis depth, so a flat "wall" of fog swings with the view. Replace
// the depth with the true distance so the fog is a sphere around the eye.
export const SPHERICAL_FOG_VERTEX = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = length( mvPosition.xyz );
#endif
`

export function useSphericalFog(material: Material): void {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.vertexShader = shader.vertexShader.replace('#include <fog_vertex>', SPHERICAL_FOG_VERTEX)
  }
  material.customProgramCacheKey = () => 'spherical-fog'
}
