import { PALETTE, PALETTE_SIZE } from '@blockfront/sim/world/palette'
import { Color, ShaderMaterial, UniformsLib, UniformsUtils, Vector3 } from 'three'

const vertexShader = /* glsl */ `
attribute float blockId;
attribute float ao;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying float vBlockId;
varying float vAo;

#include <fog_pars_vertex>

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = normal;
  vBlockId = blockId;
  vAo = ao / 3.0;
  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`

const fragmentShader = /* glsl */ `
uniform vec3 palette[${PALETTE_SIZE}];
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 skyColor;
uniform vec3 groundColor;
uniform float tintStrength;
uniform float aoStrength;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying float vBlockId;
varying float vAo;

#include <fog_pars_fragment>

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 base = palette[int(vBlockId + 0.5)];

  // Per-voxel tint from the cell behind the face, so merged quads still show individual blocks.
  vec3 cell = floor(vWorldPosition - n * 0.5);
  float tint = 1.0 + (hash13(cell) - 0.5) * tintStrength;

  vec3 ambient = mix(groundColor, skyColor, n.y * 0.5 + 0.5);
  float diffuse = max(dot(n, sunDirection), 0.0);
  float occlusion = mix(1.0 - aoStrength, 1.0, vAo * vAo);
  vec3 color = base * tint * (ambient + sunColor * diffuse) * occlusion;

  gl_FragColor = vec4(color, 1.0);
  #include <fog_fragment>
  #include <colorspace_fragment>
}
`

function paletteToLinear(): Float32Array {
  const data = new Float32Array(PALETTE_SIZE * 3)
  const color = new Color()
  PALETTE.forEach((hex, i) => {
    color.setHex(hex)
    data[i * 3] = color.r
    data[i * 3 + 1] = color.g
    data[i * 3 + 2] = color.b
  })
  return data
}

export function createVoxelMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    fog: true,
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        palette: { value: paletteToLinear() },
        sunDirection: { value: new Vector3(0.45, 0.8, 0.35).normalize() },
        sunColor: { value: new Color('#fff1d6').multiplyScalar(0.9) },
        skyColor: { value: new Color('#cfe3ff').multiplyScalar(0.55) },
        groundColor: { value: new Color('#5b4a36').multiplyScalar(0.45) },
        tintStrength: { value: 0.14 },
        aoStrength: { value: 0.6 },
      },
    ]),
  })
}
