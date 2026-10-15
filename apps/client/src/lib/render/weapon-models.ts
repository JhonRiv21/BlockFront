import type { WeaponId } from '@blockfront/sim/combat/weapons'
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NearestFilter,
  PlaneGeometry,
  Vector3,
} from 'three'

// Plain low-poly guns built from boxes and 8-sided cylinders, pointing down -Z: wood for stocks
// and grips, dark metal for receivers, barrels and magazines, with a procedural sight each
// (docs/f2-5-polish.md §4.2). The sight centre of every gun lies exactly on SIGHT[weapon].
const wood = new MeshLambertMaterial({ color: '#7a4a24' })
const darkWood = new MeshLambertMaterial({ color: '#5d3719' })
const metal = new MeshLambertMaterial({ color: '#3a3f46' })
const steel = new MeshLambertMaterial({ color: '#8d949c' })
const black = new MeshLambertMaterial({ color: '#15171b' })
const lens = new MeshLambertMaterial({ color: '#0b1a3a' })
const glass = new MeshBasicMaterial({
  color: '#9fd0ff',
  transparent: true,
  opacity: 0.12,
  depthWrite: false,
  side: DoubleSide,
})
const dotRed = new MeshBasicMaterial({ color: '#ff2a2a', toneMapped: false })
const dotGreen = new MeshBasicMaterial({ color: '#b6ff5a', toneMapped: false })

// width, height, depth, x, y, z
type Part = [number, number, number, number, number, number, MeshLambertMaterial]

const PARTS: Record<WeaponId, Part[]> = {
  rifle: [
    [0.06, 0.09, 0.3, 0, -0.01, 0.3, wood],
    [0.07, 0.1, 0.34, 0, 0.03, -0.02, metal],
    [0.05, 0.06, 0.28, 0, 0, -0.3, wood],
    [0.025, 0.025, 0.42, 0, 0.045, -0.5, steel],
    [0.015, 0.035, 0.015, 0, 0.075, -0.66, steel],
    [0.035, 0.1, 0.06, 0, -0.08, 0.12, wood],
    [0.04, 0.14, 0.07, 0, -0.1, -0.04, metal],
    [0.02, 0.03, 0.04, 0, -0.03, 0.05, steel],
  ],
  carbine: [
    [0.06, 0.08, 0.26, 0, -0.01, 0.28, black],
    [0.07, 0.1, 0.32, 0, 0.03, -0.02, metal],
    [0.055, 0.06, 0.26, 0, 0.0, -0.3, black],
    [0.025, 0.025, 0.36, 0, 0.045, -0.5, steel],
    [0.035, 0.1, 0.06, 0, -0.08, 0.1, black],
    [0.04, 0.16, 0.07, 0, -0.1, -0.05, metal],
    [0.02, 0.03, 0.04, 0, -0.03, 0.04, steel],
    [0.015, 0.03, 0.015, 0, 0.075, -0.6, steel],
  ],
  smg: [
    [0.07, 0.1, 0.3, 0, 0.03, -0.02, metal],
    [0.03, 0.03, 0.2, 0, 0.045, -0.26, steel],
    [0.05, 0.07, 0.1, 0, 0.04, -0.21, metal],
    [0.035, 0.1, 0.06, 0, -0.07, 0.1, darkWood],
    [0.04, 0.2, 0.05, 0, -0.12, -0.05, metal],
    [0.02, 0.02, 0.22, 0, 0.0, 0.26, steel],
    [0.05, 0.06, 0.03, 0, 0.0, 0.38, metal],
  ],
  shotgun: [
    [0.06, 0.1, 0.32, 0, -0.01, 0.3, wood],
    [0.07, 0.09, 0.2, 0, 0.03, 0.02, metal],
    [0.06, 0.06, 0.3, 0, 0.0, -0.28, wood],
    [0.028, 0.028, 0.58, -0.016, 0.055, -0.4, steel],
    [0.028, 0.028, 0.58, 0.016, 0.055, -0.4, steel],
    [0.035, 0.1, 0.06, 0, -0.08, 0.13, wood],
    [0.02, 0.03, 0.04, 0, -0.03, 0.06, steel],
  ],
  pistol: [
    [0.045, 0.07, 0.3, 0, 0.04, -0.05, metal],
    [0.02, 0.02, 0.1, 0, 0.045, -0.24, steel],
    [0.035, 0.11, 0.05, 0, -0.04, 0.08, darkWood],
    [0.03, 0.03, 0.03, 0, -0.01, 0.0, steel],
  ],
  sniper: [
    [0.06, 0.1, 0.34, 0, -0.01, 0.32, darkWood],
    [0.07, 0.09, 0.3, 0, 0.03, 0.0, metal],
    [0.05, 0.06, 0.34, 0, 0, -0.32, darkWood],
    [0.022, 0.022, 0.62, 0, 0.045, -0.62, steel],
    [0.035, 0.1, 0.06, 0, -0.08, 0.14, darkWood],
    [0.035, 0.1, 0.05, 0, -0.08, -0.02, metal],
    [0.02, 0.02, 0.1, 0, -0.02, -0.4, steel],
  ],
}

// Z of the barrel tip in model space, for muzzle flashes.
export const MUZZLE_Z: Record<WeaponId, number> = {
  rifle: -0.72,
  carbine: -0.68,
  smg: -0.37,
  shotgun: -0.7,
  sniper: -0.94,
  pistol: -0.29,
}

export const MUZZLE_Y: Record<WeaponId, number> = {
  rifle: 0.045,
  carbine: 0.045,
  smg: 0.045,
  shotgun: 0.055,
  sniper: 0.045,
  pistol: 0.045,
}

// Point on the line of sight, model space: the camera is placed here while aiming.
export const SIGHT: Record<WeaponId, Vector3> = {
  rifle: new Vector3(0, 0.1, 0.05),
  carbine: new Vector3(0, 0.115, -0.05),
  smg: new Vector3(0, 0.115, -0.02),
  shotgun: new Vector3(0, 0.08, -0.3),
  pistol: new Vector3(0, 0.095, 0.0),
  sniper: new Vector3(0, 0.125, 0.0),
}

function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  material: MeshLambertMaterial | MeshBasicMaterial,
): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  return mesh
}

// Square frame of four thin bars around (x, y, z), in the plane facing the shooter.
function frame(
  size: number,
  bar: number,
  x: number,
  y: number,
  z: number,
  material: MeshLambertMaterial,
): Group {
  const g = new Group()
  g.add(
    box(size, bar, bar, x, y + size / 2, z, material),
    box(size, bar, bar, x, y - size / 2, z, material),
    box(bar, size, bar, x - size / 2, y, z, material),
    box(bar, size, bar, x + size / 2, y, z, material),
  )
  return g
}

function tube(
  radius: number,
  length: number,
  x: number,
  y: number,
  z: number,
  material: MeshLambertMaterial,
): Mesh {
  const mesh = new Mesh(new CylinderGeometry(radius, radius, length, 8), material)
  mesh.rotation.x = Math.PI / 2
  mesh.position.set(x, y, z)
  return mesh
}

let holoTexture: CanvasTexture | null = null

// 64² reticle: ring and centre dot, nearest filtered so the pixels stay crisp.
function holoReticle(): CanvasTexture {
  if (holoTexture) return holoTexture
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, 64, 64)
    ctx.strokeStyle = '#ff5a3c'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(32, 32, 20, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#ff5a3c'
    ctx.fillRect(30, 30, 4, 4)
  }
  holoTexture = new CanvasTexture(canvas)
  holoTexture.magFilter = NearestFilter
  holoTexture.minFilter = NearestFilter
  return holoTexture
}

function buildSight(weapon: WeaponId): Group {
  const g = new Group()
  const s = SIGHT[weapon]
  switch (weapon) {
    case 'rifle': {
      // Peep: rear ring and front post with a 2 px emissive dot.
      const ring = new Mesh(new CylinderGeometry(0.022, 0.022, 0.008, 8, 1, true), steel)
      ring.rotation.x = Math.PI / 2
      ring.position.set(s.x, s.y, s.z)
      ring.material = new MeshLambertMaterial({ color: '#8d949c', side: DoubleSide })
      g.add(ring, box(0.006, 0.006, 0.006, 0, s.y, -0.66, dotGreen))
      break
    }
    case 'carbine': {
      g.add(frame(0.06, 0.006, s.x, s.y, s.z, black))
      const pane = new Mesh(new PlaneGeometry(0.054, 0.054), glass)
      pane.position.set(s.x, s.y, s.z)
      g.add(pane, box(0.004, 0.004, 0.004, s.x, s.y, s.z, dotRed))
      break
    }
    case 'smg': {
      // Holographic: a hood of boxes and the reticle on a pane inside.
      g.add(
        box(0.07, 0.006, 0.07, s.x, s.y + 0.03, s.z, black),
        box(0.006, 0.06, 0.07, s.x - 0.032, s.y, s.z, black),
        box(0.006, 0.06, 0.07, s.x + 0.032, s.y, s.z, black),
        box(0.07, 0.012, 0.07, s.x, s.y - 0.03, s.z, black),
      )
      const pane = new Mesh(
        new PlaneGeometry(0.056, 0.056),
        new MeshBasicMaterial({
          map: holoReticle(),
          transparent: true,
          toneMapped: false,
          side: DoubleSide,
          depthWrite: false,
        }),
      )
      pane.position.set(s.x, s.y, s.z)
      g.add(pane)
      break
    }
    case 'shotgun': {
      const bead = new Mesh(new CylinderGeometry(0.008, 0.008, 0.008, 8), steel)
      bead.position.set(0, s.y, -0.68)
      g.add(bead)
      break
    }
    case 'pistol': {
      g.add(
        box(0.006, 0.02, 0.01, -0.012, s.y, 0.06, steel),
        box(0.006, 0.02, 0.01, 0.012, s.y, 0.06, steel),
        box(0.006, 0.02, 0.01, 0, s.y, -0.17, steel),
      )
      break
    }
    case 'sniper': {
      g.add(
        tube(0.018, 0.24, 0, s.y, 0.0, black),
        tube(0.026, 0.05, 0, s.y, -0.14, black),
        tube(0.024, 0.04, 0, s.y, 0.13, black),
        box(0.012, 0.03, 0.02, 0, s.y - 0.03, -0.06, metal),
        box(0.012, 0.03, 0.02, 0, s.y - 0.03, 0.06, metal),
        box(0.016, 0.016, 0.016, 0, s.y + 0.024, 0.0, metal),
        box(0.016, 0.016, 0.016, 0.024, s.y, 0.0, metal),
      )
      const lensMesh = new Mesh(new CylinderGeometry(0.024, 0.024, 0.004, 8), lens)
      lensMesh.rotation.x = Math.PI / 2
      lensMesh.position.set(0, s.y, -0.165)
      g.add(lensMesh)
      break
    }
  }
  return g
}

// Index into PARTS of the magazine (animated during reloads), or -1.
const MAGAZINE_PART: Record<WeaponId, number> = {
  rifle: 6,
  carbine: 5,
  smg: 4,
  shotgun: -1,
  pistol: -1,
  sniper: -1,
}

// Where the hands go, model space: right on the grip, left on the fore grip.
export const GRIPS: Record<WeaponId, { right: Vector3; left: Vector3 }> = {
  rifle: { right: new Vector3(0, -0.1, 0.12), left: new Vector3(-0.02, -0.03, -0.3) },
  carbine: { right: new Vector3(0, -0.1, 0.1), left: new Vector3(-0.02, -0.03, -0.3) },
  smg: { right: new Vector3(0, -0.09, 0.1), left: new Vector3(-0.02, -0.03, -0.2) },
  shotgun: { right: new Vector3(0, -0.1, 0.13), left: new Vector3(-0.02, -0.03, -0.28) },
  pistol: { right: new Vector3(0, -0.07, 0.08), left: new Vector3(-0.03, -0.08, 0.06) },
  sniper: { right: new Vector3(0, -0.1, 0.14), left: new Vector3(-0.02, -0.03, -0.32) },
}

export function buildWeapon(weapon: WeaponId): Group {
  const group = new Group()
  PARTS[weapon].forEach(([w, h, d, x, y, z, material], index) => {
    const part = box(w, h, d, x, y, z, material)
    if (index === MAGAZINE_PART[weapon]) part.name = 'magazine'
    group.add(part)
  })
  group.add(buildSight(weapon))
  return group
}
