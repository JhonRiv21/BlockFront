import { WORLD_SIZE } from '@blockfront/sim/config'
import {
  Color,
  type Data3DTexture,
  DoubleSide,
  GLSL3,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from 'three'
import { SKY_HORIZON, SKY_ZENITH, SUN_DIRECTION } from './sky.ts'

// Water surface: two scrolling noise layers bend the normal, Fresnel blends toward the sky
// colour at grazing angles, and the skylight darkens shaded water. Base colour #3F76E4.
const vertexShader = /* glsl */ `
out vec3 vWorldPosition;
out vec3 vNormal;
#include <fog_pars_vertex>
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = normal;
  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;
  #ifdef USE_FOG
    vFogDepth = length(mvPosition.xyz);
  #endif
}
`

const fragmentShader = /* glsl */ `
precision highp sampler3D;
uniform sampler3D skylight;
uniform vec3 worldSize;
uniform vec3 waterColor;
uniform vec3 skyColor;
uniform vec3 sunDirection;
uniform float time;
uniform float opacity;
in vec3 vWorldPosition;
in vec3 vNormal;
out vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
#include <fog_pars_fragment>

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec3 n = normalize(vNormal);
  vec2 p = vWorldPosition.xz;
  // Two layers moving in different directions.
  float h1 = valueNoise(p * 0.9 + vec2(time * 0.35, time * 0.2));
  float h2 = valueNoise(p * 2.3 - vec2(time * 0.5, -time * 0.3));
  vec3 bent = n;
  if (abs(n.y) > 0.5) {
    bent = normalize(n + vec3((h1 - 0.5) * 0.5 + (h2 - 0.5) * 0.3, 0.0, (h2 - 0.5) * 0.5 + (h1 - 0.5) * 0.3));
  }
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  float fresnel = pow(1.0 - max(dot(bent, viewDir), 0.0), 3.0);
  float sky = texture(skylight, (vWorldPosition + n * 0.5) / worldSize).r * (255.0 / 15.0);
  float light = mix(0.35, 1.0, sky);
  float sun = pow(max(dot(reflect(-sunDirection, bent), viewDir), 0.0), 48.0) * sky;
  vec3 color = mix(waterColor * (0.85 + 0.3 * h1), skyColor, fresnel * 0.6) * light + vec3(1.0, 0.95, 0.85) * sun * 0.5;
  gl_FragColor = vec4(color, clamp(opacity + fresnel * 0.2, 0.0, 0.85));
  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export function createWaterMaterial(skylight: Data3DTexture): ShaderMaterial {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader,
    fragmentShader,
    fog: true,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        skylight: { value: skylight },
        worldSize: { value: new Vector3(WORLD_SIZE.x, WORLD_SIZE.y, WORLD_SIZE.z) },
        waterColor: { value: new Color('#3f76e4') },
        skyColor: { value: SKY_ZENITH.clone().lerp(SKY_HORIZON, 0.4) },
        sunDirection: { value: SUN_DIRECTION.clone() },
        time: { value: 0 },
        opacity: { value: 0.66 },
      },
    ]),
  })
}
