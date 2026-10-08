import { BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three'

// Plain low-poly rifle built from boxes, pointing down -Z: stock and grip in wood, receiver,
// barrel and magazine in dark metal. Scale 1 is about 0.9 units long.
export function buildRifle(): Group {
  const group = new Group()
  const wood = new MeshLambertMaterial({ color: '#7a4a24' })
  const metal = new MeshLambertMaterial({ color: '#3a3f46' })
  const steel = new MeshLambertMaterial({ color: '#8d949c' })

  const parts: [number, number, number, number, number, number, MeshLambertMaterial][] = [
    // width, height, depth, x, y, z
    [0.06, 0.09, 0.3, 0, -0.01, 0.3, wood], // stock
    [0.07, 0.1, 0.34, 0, 0.03, -0.02, metal], // receiver
    [0.05, 0.06, 0.28, 0, 0.0, -0.3, wood], // fore grip
    [0.025, 0.025, 0.42, 0, 0.045, -0.5, steel], // barrel
    [0.03, 0.04, 0.05, 0, 0.09, -0.08, steel], // rear sight
    [0.015, 0.035, 0.015, 0, 0.075, -0.66, steel], // front sight
    [0.035, 0.1, 0.06, 0, -0.08, 0.12, wood], // grip
    [0.04, 0.14, 0.07, 0, -0.1, -0.04, metal], // magazine
    [0.02, 0.03, 0.04, 0, -0.03, 0.05, steel], // trigger guard
  ]
  for (const [w, h, d, x, y, z, material] of parts) {
    const mesh = new Mesh(new BoxGeometry(w, h, d), material)
    mesh.position.set(x, y, z)
    group.add(mesh)
  }
  return group
}

export const RIFLE_MUZZLE_Z = -0.72
