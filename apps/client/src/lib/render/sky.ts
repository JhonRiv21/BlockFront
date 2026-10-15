import {
  BackSide,
  Color,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type PerspectiveCamera,
  type Scene,
} from 'three'

export const SKY_ZENITH = new Color('#3f7fd9')
export const SKY_HORIZON = new Color('#b9d7f2')
export const SUN_DIRECTION = new Vector3(0.45, 0.8, 0.35).normalize()

const vertexShader = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = position;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  // Push to the far plane so the dome never occludes anything.
  gl_Position.z = gl_Position.w * 0.99999;
}
`

const fragmentShader = /* glsl */ `
uniform vec3 zenithColor;
uniform vec3 horizonColor;
uniform vec3 sunDirection;
varying vec3 vDirection;
void main() {
  vec3 dir = normalize(vDirection);
  float t = clamp(dir.y, 0.0, 1.0);
  vec3 color = mix(horizonColor, zenithColor, pow(t, 0.55));
  // Below the horizon the sky keeps the horizon colour: the terrain covers it anyway.
  float sun = dot(dir, sunDirection);
  color += vec3(1.0, 0.95, 0.8) * smoothstep(0.9985, 0.9995, sun) * 1.5;
  color += vec3(1.0, 0.9, 0.7) * pow(max(sun, 0.0), 24.0) * 0.18;
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

// Gradient dome with a sun disc that follows the camera. The fog uses the horizon colour.
export class Sky {
  readonly mesh: Mesh

  constructor(private readonly scene: Scene) {
    this.mesh = new Mesh(
      new SphereGeometry(1, 24, 12),
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        side: BackSide,
        depthWrite: false,
        depthTest: false,
        uniforms: {
          zenithColor: { value: SKY_ZENITH.clone() },
          horizonColor: { value: SKY_HORIZON.clone() },
          sunDirection: { value: SUN_DIRECTION.clone() },
        },
      }),
    )
    this.mesh.renderOrder = -100
    this.mesh.frustumCulled = false
    this.mesh.scale.setScalar(10)
    scene.add(this.mesh)
  }

  update(camera: PerspectiveCamera): void {
    this.mesh.position.copy(camera.position)
  }

  dispose(): void {
    this.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    ;(this.mesh.material as ShaderMaterial).dispose()
  }
}
