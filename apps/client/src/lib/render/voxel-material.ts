import { WORLD_SIZE } from '@blockfront/sim/config'
import { PALETTE, PALETTE_SIZE, blockTint } from '@blockfront/sim/world/blocks'
import {
  Color,
  type Data3DTexture,
  type DataArrayTexture,
  DoubleSide,
  GLSL3,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from 'three'
import { SKY_HORIZON, SKY_ZENITH, SUN_DIRECTION } from './sky.ts'

// Shared GLSL for the three voxel materials: array-texture sampling, per-voxel tint, skylight
// from the 3D texture, hemisphere + sun lighting, spherical fog, tone mapping.
const lightingPars = /* glsl */ `
precision highp sampler2DArray;
precision highp sampler3D;
uniform sampler2DArray blockTextures;
uniform sampler3D skylight;
uniform vec3 worldSize;
uniform vec3 tints[${PALETTE_SIZE}];
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 skyColor;
uniform vec3 groundColor;
uniform float skyIntensity;
uniform float tintStrength;
uniform float aoStrength;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

// Skylight at the cell in front of the face, linear-filtered: soft shadows for free.
float sampleSky(vec3 worldPosition, vec3 n) {
  vec3 uvw = (worldPosition + n * 0.5) / worldSize;
  return texture(skylight, uvw).r * (255.0 / 15.0);
}

vec3 shade(vec3 base, vec3 n, vec3 worldPosition, float ao, float sky) {
  vec3 cell = floor(worldPosition - n * 0.5);
  float tint = 1.0 + (hash13(cell) - 0.5) * tintStrength;
  // Shade never goes fully black: tunnels and canopies stay readable up close.
  float skyFactor = mix(0.3, 1.0, sky * skyIntensity);
  vec3 ambient = mix(groundColor, skyColor, n.y * 0.5 + 0.5) * skyFactor;
  float diffuse = max(dot(n, sunDirection), 0.0) * skyFactor * skyFactor;
  float occlusion = mix(1.0 - aoStrength, 1.0, ao * ao);
  return base * tint * (ambient + sunColor * diffuse) * occlusion;
}
`

const fogPars = /* glsl */ `
#include <fog_pars_fragment>
`

const fogAndOutput = /* glsl */ `
  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`

const cubeVertex = /* glsl */ `
in float layer;
in float blockId;
in float ao;
out vec3 vWorldPosition;
out vec3 vNormal;
flat out float vLayer;
flat out float vBlockId;
out float vAo;
#include <fog_pars_vertex>
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = normal;
  vLayer = layer;
  vBlockId = blockId;
  vAo = ao / 3.0;
  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;
  #ifdef USE_FOG
    vFogDepth = length(mvPosition.xyz);
  #endif
}
`

function cubeFragment(): string {
  return /* glsl */ `
${lightingPars}
${fogPars}
in vec3 vWorldPosition;
in vec3 vNormal;
flat in float vLayer;
flat in float vBlockId;
in float vAo;
out vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
void main() {
  vec3 n = normalize(vNormal);
  // UV from the position on the face: one texture repeat per block, no attribute needed.
  vec2 uv = abs(n.x) > 0.5 ? vWorldPosition.zy : abs(n.y) > 0.5 ? vWorldPosition.xz : vWorldPosition.xy;
  vec4 texel = texture(blockTextures, vec3(uv, vLayer));
  vec3 base = texel.rgb * tints[int(vBlockId + 0.5)];
  float sky = sampleSky(vWorldPosition, n);
  vec3 color = shade(base, n, vWorldPosition, vAo, sky);
  gl_FragColor = vec4(color, 1.0);
${fogAndOutput}
}
`
}

// uv is one of Three's built-in attributes, so it is not declared here.
const decorVertex = /* glsl */ `
in float layer;
uniform float time;
out vec3 vWorldPosition;
out vec2 vUv;
flat out float vLayer;
#include <fog_pars_vertex>
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  // Gentle wind on the top vertices only.
  float sway = sin(time * 1.7 + worldPosition.x * 0.9 + worldPosition.z * 1.3) * 0.045 * uv.y;
  worldPosition.x += sway;
  worldPosition.z += sway * 0.6;
  vWorldPosition = worldPosition.xyz;
  vUv = uv;
  vLayer = layer;
  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;
  #ifdef USE_FOG
    vFogDepth = length(mvPosition.xyz);
  #endif
}
`

const decorFragment = /* glsl */ `
${lightingPars}
${fogPars}
in vec3 vWorldPosition;
in vec2 vUv;
flat in float vLayer;
out vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
void main() {
  vec4 texel = texture(blockTextures, vec3(vUv, vLayer));
  if (texel.a < 0.5) discard;
  // Plants are lit like a horizontal surface at their own cell.
  vec3 n = vec3(0.0, 1.0, 0.0);
  vec3 cellCenter = floor(vWorldPosition) + 0.5;
  float sky = texture(skylight, cellCenter / worldSize).r * (255.0 / 15.0);
  vec3 color = shade(texel.rgb, n, cellCenter - vec3(0.0, 0.5, 0.0), 1.0, sky) * 1.15;
  gl_FragColor = vec4(color, 1.0);
${fogAndOutput}
}
`

export interface VoxelMaterialOptions {
  blockTextures: DataArrayTexture
  skylight: Data3DTexture
}

function tintTable(): Vector3[] {
  const colour = new Color()
  return PALETTE.map((_, id) => {
    colour.setHex(blockTint(id))
    return new Vector3(colour.r, colour.g, colour.b)
  })
}

function sharedUniforms(options: VoxelMaterialOptions) {
  return UniformsUtils.merge([
    UniformsLib.fog,
    {
      blockTextures: { value: options.blockTextures },
      skylight: { value: options.skylight },
      worldSize: { value: new Vector3(WORLD_SIZE.x, WORLD_SIZE.y, WORLD_SIZE.z) },
      tints: { value: tintTable() },
      sunDirection: { value: SUN_DIRECTION.clone() },
      sunColor: { value: new Color('#fff1d6').multiplyScalar(0.95) },
      skyColor: { value: SKY_ZENITH.clone().lerp(SKY_HORIZON, 0.5).multiplyScalar(0.6) },
      groundColor: { value: new Color('#5b4a36').multiplyScalar(0.45) },
      skyIntensity: { value: 1 },
      tintStrength: { value: 0.12 },
      aoStrength: { value: 0.5 },
    },
  ])
}

export function createVoxelMaterial(options: VoxelMaterialOptions): ShaderMaterial {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: cubeVertex,
    fragmentShader: cubeFragment(),
    fog: true,
    uniforms: sharedUniforms(options),
  })
}

export function createDecorMaterial(options: VoxelMaterialOptions): ShaderMaterial {
  const uniforms = sharedUniforms(options)
  uniforms.time = { value: 0 }
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: decorVertex,
    fragmentShader: decorFragment,
    fog: true,
    side: DoubleSide,
    uniforms,
  })
}
