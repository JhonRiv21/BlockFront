import { BoxGeometry, Mesh, MeshBasicMaterial, type Scene } from 'three'

interface Fuse {
  mesh: Mesh
  age: number
}

// Primed TNT, Minecraft style: the block flashes white, faster as the fuse runs down. One
// overlay cube per primed block, keyed by position, until the block goes.
export class TntFuses {
  private readonly fuses = new Map<number, Fuse>()
  private readonly geometry = new BoxGeometry(1.02, 1.02, 1.02)

  constructor(
    private readonly scene: Scene,
    private readonly fuseSeconds: number,
  ) {}

  prime(x: number, y: number, z: number): void {
    const key = this.key(x, y, z)
    if (this.fuses.has(key)) return
    const mesh = new Mesh(
      this.geometry,
      new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }),
    )
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5)
    this.scene.add(mesh)
    this.fuses.set(key, { mesh, age: 0 })
  }

  clear(x: number, y: number, z: number): void {
    const key = this.key(x, y, z)
    const fuse = this.fuses.get(key)
    if (!fuse) return
    this.scene.remove(fuse.mesh)
    ;(fuse.mesh.material as MeshBasicMaterial).dispose()
    this.fuses.delete(key)
  }

  clearAll(): void {
    for (const fuse of this.fuses.values()) {
      this.scene.remove(fuse.mesh)
      ;(fuse.mesh.material as MeshBasicMaterial).dispose()
    }
    this.fuses.clear()
  }

  update(dt: number): void {
    for (const fuse of this.fuses.values()) {
      fuse.age += dt
      const t = Math.min(1, fuse.age / this.fuseSeconds)
      // 2 flashes a second at first, 8 at the end; each flash is a hard white half-period.
      const hz = 2 + 6 * t * t
      const on = Math.sin(fuse.age * hz * Math.PI * 2) > 0
      ;(fuse.mesh.material as MeshBasicMaterial).opacity = on ? 0.65 : 0
    }
  }

  dispose(): void {
    for (const [key] of this.fuses) {
      const fuse = this.fuses.get(key)!
      this.scene.remove(fuse.mesh)
      ;(fuse.mesh.material as MeshBasicMaterial).dispose()
    }
    this.fuses.clear()
    this.geometry.dispose()
  }

  private key(x: number, y: number, z: number): number {
    return x + y * 4096 + z * 4096 * 4096
  }
}
