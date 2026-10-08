import type { WeaponId } from '@blockfront/sim/combat/weapons'
import { BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three'

// Plain low-poly guns built from boxes, pointing down -Z: wood for stocks and grips, dark
// metal for receivers, barrels and magazines. Each is roughly 0.8–1.2 units long at scale 1.
const wood = new MeshLambertMaterial({ color: '#7a4a24' })
const darkWood = new MeshLambertMaterial({ color: '#5d3719' })
const metal = new MeshLambertMaterial({ color: '#3a3f46' })
const steel = new MeshLambertMaterial({ color: '#8d949c' })
const glass = new MeshLambertMaterial({ color: '#7fb6ff' })

// width, height, depth, x, y, z
type Part = [number, number, number, number, number, number, MeshLambertMaterial]

const PARTS: Record<WeaponId, Part[]> = {
  rifle: [
    [0.06, 0.09, 0.3, 0, -0.01, 0.3, wood],
    [0.07, 0.1, 0.34, 0, 0.03, -0.02, metal],
    [0.05, 0.06, 0.28, 0, 0, -0.3, wood],
    [0.025, 0.025, 0.42, 0, 0.045, -0.5, steel],
    [0.03, 0.04, 0.05, 0, 0.09, -0.08, steel],
    [0.015, 0.035, 0.015, 0, 0.075, -0.66, steel],
    [0.035, 0.1, 0.06, 0, -0.08, 0.12, wood],
    [0.04, 0.14, 0.07, 0, -0.1, -0.04, metal],
    [0.02, 0.03, 0.04, 0, -0.03, 0.05, steel],
  ],
  smg: [
    [0.07, 0.1, 0.3, 0, 0.03, -0.02, metal],
    [0.03, 0.03, 0.2, 0, 0.045, -0.26, steel],
    [0.05, 0.07, 0.1, 0, 0.04, -0.21, metal],
    [0.035, 0.1, 0.06, 0, -0.07, 0.1, darkWood],
    [0.04, 0.2, 0.05, 0, -0.12, -0.05, metal],
    [0.02, 0.02, 0.22, 0, 0.0, 0.26, steel],
    [0.05, 0.06, 0.03, 0, 0.0, 0.38, metal],
    [0.03, 0.04, 0.04, 0, 0.09, -0.06, steel],
  ],
  shotgun: [
    [0.06, 0.1, 0.32, 0, -0.01, 0.3, wood],
    [0.07, 0.09, 0.2, 0, 0.03, 0.02, metal],
    [0.06, 0.06, 0.3, 0, 0.0, -0.28, wood],
    [0.028, 0.028, 0.58, -0.016, 0.055, -0.4, steel],
    [0.028, 0.028, 0.58, 0.016, 0.055, -0.4, steel],
    [0.035, 0.1, 0.06, 0, -0.08, 0.13, wood],
    [0.02, 0.03, 0.04, 0, -0.03, 0.06, steel],
    [0.015, 0.025, 0.015, 0, 0.08, -0.68, steel],
  ],
  sniper: [
    [0.06, 0.1, 0.34, 0, -0.01, 0.32, darkWood],
    [0.07, 0.09, 0.3, 0, 0.03, 0.0, metal],
    [0.05, 0.06, 0.34, 0, 0, -0.32, darkWood],
    [0.022, 0.022, 0.62, 0, 0.045, -0.62, steel],
    [0.035, 0.035, 0.22, 0, 0.11, -0.06, metal],
    [0.045, 0.045, 0.03, 0, 0.11, 0.06, metal],
    [0.045, 0.045, 0.03, 0, 0.11, -0.18, metal],
    [0.03, 0.03, 0.005, 0, 0.11, -0.2, glass],
    [0.035, 0.1, 0.06, 0, -0.08, 0.14, darkWood],
    [0.035, 0.1, 0.05, 0, -0.08, -0.02, metal],
    [0.02, 0.02, 0.1, 0, -0.02, -0.4, steel],
  ],
}

// Z of the barrel tip in model space, for muzzle flashes.
export const MUZZLE_Z: Record<WeaponId, number> = {
  rifle: -0.72,
  smg: -0.37,
  shotgun: -0.7,
  sniper: -0.94,
}

export const MUZZLE_Y: Record<WeaponId, number> = {
  rifle: 0.045,
  smg: 0.045,
  shotgun: 0.055,
  sniper: 0.045,
}

export function buildWeapon(weapon: WeaponId): Group {
  const group = new Group()
  for (const [w, h, d, x, y, z, material] of PARTS[weapon]) {
    const mesh = new Mesh(new BoxGeometry(w, h, d), material)
    mesh.position.set(x, y, z)
    group.add(mesh)
  }
  return group
}
