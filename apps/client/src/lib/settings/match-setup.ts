import type { WeaponId } from '@blockfront/sim/combat/weapons'
import { DEFAULT_MATCH_SETUP, type MatchSetup } from '@blockfront/sim/match/setup'
import { scoreToWin, type Difficulty, type GameMode } from '@blockfront/sim/rules/modes'
import { isRecord, readJson, writeJson, type KeyValueStore } from './storage.ts'

export const SETUP_KEY = 'blockfront:setup'

export const MODES: readonly GameMode[] = ['ctf', 'tdm', 'ffa']
export const DIFFICULTIES: readonly Difficulty[] = ['recruit', 'soldier', 'veteran']
export const TEAM_SIZES: readonly MatchSetup['teamSize'][] = [2, 3, 4, 6]
export const FFA_SIZES: readonly MatchSetup['ffaPlayers'][] = [4, 6, 8]
export const PRIMARIES: readonly WeaponId[] = ['rifle', 'carbine', 'smg', 'shotgun', 'sniper']

// The target a mode card announces for the chosen size (the sim's rule, so the two agree).
export const modeTarget = (mode: GameMode, setup: MatchSetup): number =>
  scoreToWin(mode, setup.teamSize)

const pick = <T>(options: readonly T[], value: unknown, fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback

// The last menu choice, field by field; anything unknown falls back to the one-click default.
// Only seed 1 exists for now.
export function sanitizeSetup(raw: unknown): MatchSetup {
  const source = isRecord(raw) ? raw : {}
  const d = DEFAULT_MATCH_SETUP
  return {
    mode: pick(MODES, source.mode, d.mode),
    difficulty: pick(DIFFICULTIES, source.difficulty, d.difficulty),
    teamSize: pick(TEAM_SIZES, source.teamSize, d.teamSize),
    ffaPlayers: pick(FFA_SIZES, source.ffaPlayers, d.ffaPlayers),
    primary: pick(PRIMARIES, source.primary, d.primary),
    seed: d.seed,
  }
}

export const loadSetup = (store: KeyValueStore | null): MatchSetup =>
  sanitizeSetup(readJson(store, SETUP_KEY))

export const saveSetup = (store: KeyValueStore | null, setup: MatchSetup): void =>
  writeJson(store, SETUP_KEY, setup)
