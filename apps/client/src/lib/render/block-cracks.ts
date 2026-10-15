import { LAYER_COUNT } from '@blockfront/sim/world/blocks'
import {
  BoxGeometry,
  type DataArrayTexture,
  DynamicDrawUsage,
  GLSL3,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  ShaderMaterial,
  type Scene,
} from 'three'

export const CRACK_STAGES = 10
export const CRACK_LAYER_BASE = LAYER_COUNT
const MAX_CRACKED = 256

const vertexShader = /* glsl */ `
in float stage;
out vec3 vLocal;
out vec3 vNormal;
flat out float vStage;
void main() {
  vLocal = position + 0.5;
  vNormal = normal;
  vStage = stage;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`

const fragmentShader = /* glsl */ `
precision highp sampler2DArray;
uniform sampler2DArray blockTextures;
uniform float crackBase;
in vec3 vLocal;
in vec3 vNormal;
flat in float vStage;
out vec4 pc_fragColor;
void main() {
  vec3 n = abs(vNormal);
  vec2 uv = n.x > 0.5 ? vLocal.zy : n.y > 0.5 ? vLocal.xz : vLocal.xy;
  vec4 texel = texture(blockTextures, vec3(uv, crackBase + vStage));
  if (texel.a < 0.5) discard;
  pc_fragColor = vec4(0.0, 0.0, 0.0, 0.55);
}
`

// Cracks over damaged blocks (docs §6.1): ten stages from the block HP, one instanced shell
// per damaged block, textured from the crack layers of the block array texture.
export class BlockCracks {
  private readonly mesh: InstancedMesh
  private readonly stages: InstancedBufferAttribute
  private readonly damaged = new Map<number, { x: number; y: number; z: number; hp: number }>()
  private readonly matrix = new Matrix4()
  private dirty = false

  constructor(
    private readonly scene: Scene,
    blockTextures: DataArrayTexture,
  ) {
    const geometry = new BoxGeometry(1.004, 1.004, 1.004)
    this.stages = new InstancedBufferAttribute(new Float32Array(MAX_CRACKED), 1)
    this.stages.setUsage(DynamicDrawUsage)
    geometry.setAttribute('stage', this.stages)
    this.mesh = new InstancedMesh(
      geometry,
      new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -2,
        uniforms: {
          blockTextures: { value: blockTextures },
          crackBase: { value: CRACK_LAYER_BASE },
        },
      }),
      MAX_CRACKED,
    )
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    scene.add(this.mesh)
  }

  damage(x: number, y: number, z: number, hp: number): void {
    const key = blockKey(x, y, z)
    if (hp >= 100) this.damaged.delete(key)
    else {
      if (!this.damaged.has(key) && this.damaged.size >= MAX_CRACKED) {
        const oldest = this.damaged.keys().next().value
        if (oldest !== undefined) this.damaged.delete(oldest)
      }
      this.damaged.set(key, { x, y, z, hp })
    }
    this.dirty = true
  }

  // Any change of the block (broken, replaced) clears its cracks.
  clear(x: number, y: number, z: number): void {
    if (this.damaged.delete(blockKey(x, y, z))) this.dirty = true
  }

  update(): void {
    if (!this.dirty) return
    this.dirty = false
    let i = 0
    for (const { x, y, z, hp } of this.damaged.values()) {
      this.matrix.makeTranslation(x + 0.5, y + 0.5, z + 0.5)
      this.mesh.setMatrixAt(i, this.matrix)
      // 100 HP → 10 stages; stage 0 at the first scratch, 9 just before breaking.
      this.stages.setX(i, Math.min(CRACK_STAGES - 1, Math.floor(((100 - hp) / 100) * CRACK_STAGES)))
      i++
    }
    this.mesh.count = i
    this.mesh.instanceMatrix.needsUpdate = true
    this.stages.needsUpdate = true
  }

  dispose(): void {
    this.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    ;(this.mesh.material as ShaderMaterial).dispose()
  }
}

function blockKey(x: number, y: number, z: number): number {
  return x + y * 128 + z * 128 * 64
}
