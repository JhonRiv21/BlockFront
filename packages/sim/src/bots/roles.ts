import type { WeaponId } from '../combat/weapons.ts'
import type { Rng } from '../rng.ts'
import type { Difficulty, GameMode } from '../rules/modes.ts'

// CTF roles a team commander hands out (docs/final-scope.md §4). 'flex' balances: it recovers
// the own flag when it is away, escorts an allied carrier and otherwise holds midfield.
// TDM and FFA bots all roam.
export type BotRole = 'attack' | 'defend' | 'flex' | 'roam'

// Roles for a team of n bots, in the order the commander hands them out: with 2, one attacks
// and one balances; with more, about half attack, a quarter defend and the rest balance.
export function teamRoles(mode: GameMode, n: number): BotRole[] {
  if (mode !== 'ctf') return Array.from({ length: n }, () => 'roam')
  if (n <= 1) return n === 1 ? ['attack'] : []
  if (n === 2) return ['attack', 'flex']
  const attack = Math.round(n / 2)
  const defend = Math.max(1, Math.round(n / 4))
  const roles: BotRole[] = []
  for (let i = 0; i < n; i++)
    roles.push(i < attack ? 'attack' : i < attack + defend ? 'defend' : 'flex')
  return roles
}

type Weights = Partial<Record<WeaponId, number>>

const PRIMARY_WEIGHTS: Record<BotRole, Weights> = {
  attack: { rifle: 40, carbine: 40, smg: 20 },
  defend: { shotgun: 40, rifle: 25, carbine: 25, smg: 10 },
  flex: { rifle: 40, carbine: 40, smg: 10, shotgun: 10 },
  roam: { rifle: 38, carbine: 38, smg: 14, shotgun: 10 },
}

// Rifle and carbine most often, the shotgun for defenders, the sniper only on Veteran and at
// most one per team.
export function choosePrimary(
  rng: Rng,
  role: BotRole,
  difficulty: Difficulty,
  teamHasSniper: boolean,
): WeaponId {
  const weights: Weights = { ...PRIMARY_WEIGHTS[role] }
  if (difficulty === 'veteran' && !teamHasSniper && role !== 'attack')
    weights.sniper = role === 'defend' ? 30 : 8
  const entries = Object.entries(weights) as [WeaponId, number][]
  const total = entries.reduce((sum, [, w]) => sum + w, 0)
  let roll = rng.next() * total
  for (const [weapon, w] of entries) {
    roll -= w
    if (roll < 0) return weapon
  }
  return entries[entries.length - 1]![0]
}
