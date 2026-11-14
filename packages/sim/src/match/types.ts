import type { HitZone, ToolId, WeaponId } from '../combat/weapons.ts'
import type { Vec3 } from '../physics/sweep.ts'
import type { BlockId } from '../world/blocks.ts'
import type { FlagState, MatchState, Winner } from '../rules/ctf.ts'
import type { Difficulty, GameMode } from '../rules/modes.ts'

export type Team = 'blue' | 'red'
export type DamageSource = ToolId | 'drowning' | 'fall'

export interface PlayerConfig {
  id: number
  team: Team
  name: string
  // Dev and QA only: stands still and keeps its last input.
  dummy?: boolean
  // A bot plays through ordinary InputFrames; without one (S1) it stands still.
  bot?: { difficulty: Difficulty }
  primary?: WeaponId
  spawn?: [number, number]
}

export interface GameConfig {
  seed: number
  // Absent means CTF.
  mode?: GameMode
  players: PlayerConfig[]
  // Dev aid: a primary change applies at once instead of at the next respawn.
  instantLoadout?: boolean
}

export type GameEvent =
  | { type: 'block'; x: number; y: number; z: number; id: BlockId }
  | { type: 'blockDamaged'; x: number; y: number; z: number; hp: number; normal: Vec3 }
  | { type: 'shot'; player: number; tool: ToolId; origin: Vec3; dir: Vec3 }
  | {
      type: 'hit'
      attacker: number
      victim: number
      zone: HitZone
      damage: number
      tool: DamageSource
    }
  | { type: 'death'; victim: number; attacker: number; tool: DamageSource }
  | { type: 'respawn'; player: number }
  | { type: 'landed'; player: number; height: number }
  | { type: 'grenade'; player: number; grenade: number }
  | { type: 'explosion'; x: number; y: number; z: number }
  // Trigger pulled on an empty magazine.
  | { type: 'dryfire'; player: number }
  // `team` is the flag's team; `player` who acted (0 for the 20 s auto return).
  | {
      type: 'flag'
      action: 'taken' | 'dropped' | 'returned' | 'captured'
      team: Team
      player: number
    }
  // `winnerPlayer` names the FFA winner (winner 'player'); 0 otherwise.
  | { type: 'matchEnd'; winner: Winner; winnerPlayer: number }
  | { type: 'restock'; player: number }
  | { type: 'heal'; player: number }
  | { type: 'loot'; player: number; chest: number }
  | { type: 'chestRefill'; chest: number }

export interface PlayerSnapshot {
  id: number
  team: Team
  name: string
  pos: Vec3
  yaw: number
  pitch: number
  crouching: boolean
  onGround: boolean
  eyeHeight: number
  inWater: boolean
  onLadder: boolean
  eyeInWater: boolean
  air: number
  hp: number
  alive: boolean
  respawnIn: number
  slot: number
  weapon: WeaponId
  mag: number
  reserve: number
  reloading: boolean
  pistolMag: number
  pistolReserve: number
  pistolReloading: boolean
  // Reload of the weapon in hand (slots 1 and 2): seconds left and the total it started with.
  reloadLeft: number
  reloadTotal: number
  spread: number
  // Aim-down-sights progress 0..1 and whether the weapon in hand has a scope.
  ads: number
  blocks: number
  blockColor: number
  grenades: number
  cooking: number
  // Seconds the grenade has been held, for the predicted arc.
  charge: number
  protected: boolean
  carrying: boolean
  kills: number
  deaths: number
  captures: number
  returns: number
  suicides: number
  // Points toward the win: captures in CTF, kills minus suicides in TDM and FFA.
  score: number
  damageDealt: number
  // This life: damage given and taken, and who ended it (0 while alive).
  dealtThisLife: number
  takenThisLife: number
  killedBy: number
  killedWith: DamageSource | ''
  tnt: number
  ladders: number
  bandages: number
  // Bandage channel progress 0..1.
  healing: number
}

export interface FlagSnapshot {
  team: Team
  state: FlagState
  pos: Vec3
  home: Vec3
  carrier: number
}

export interface MatchSnapshot {
  mode: GameMode
  state: MatchState
  // Team scores: captures in CTF, kills in TDM; both 0 in FFA (see PlayerSnapshot.score).
  scoreBlue: number
  scoreRed: number
  scoreToWin: number
  timeLeft: number
  winner: Winner | null
  winnerPlayer: number
  mvp: number | null
}

export interface ChestSnapshot {
  id: number
  pos: Vec3
  full: boolean
}

export interface GrenadeSnapshot {
  id: number
  pos: Vec3
}

export interface Snapshot {
  tick: number
  players: PlayerSnapshot[]
  grenades: GrenadeSnapshot[]
  // Empty outside CTF.
  flags: FlagSnapshot[]
  chests: ChestSnapshot[]
  match: MatchSnapshot
}
