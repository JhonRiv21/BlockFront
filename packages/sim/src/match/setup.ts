import type { WeaponId } from '../combat/weapons.ts'
import type { Difficulty, GameMode } from '../rules/modes.ts'
import type { GameConfig, PlayerConfig } from './types.ts'

// What the menu chooses (docs/final-scope.md §1).
export interface MatchSetup {
  mode: GameMode
  difficulty: Difficulty
  // CTF and TDM: players per team, the human in blue included.
  teamSize: 2 | 3 | 4 | 6
  // FFA: players in total, the human included.
  ffaPlayers: 4 | 6 | 8
  primary: WeaponId
  // Only 1 for now: the client generates its world once.
  seed: number
}

// The one-click "Play" (§5): TDM 4v4 on Soldier.
export const DEFAULT_MATCH_SETUP: MatchSetup = {
  mode: 'tdm',
  difficulty: 'soldier',
  teamSize: 4,
  ffaPlayers: 6,
  primary: 'rifle',
  seed: 1,
}

export const LOCAL_PLAYER_ID = 1

// The human is id 1 in blue; bots follow as 2, 3, … (allies first, then red). Names are ids the
// client translates: 'you' and 'bot-<id>'. In FFA the colour means nothing to the rules; the
// bots are red so the current renderer draws them as enemies.
export function matchPlayers(setup: MatchSetup): PlayerConfig[] {
  const human: PlayerConfig = {
    id: LOCAL_PLAYER_ID,
    team: 'blue',
    name: 'you',
    primary: setup.primary,
  }
  const bot = (id: number, team: PlayerConfig['team']): PlayerConfig => ({
    id,
    team,
    name: `bot-${id}`,
    bot: { difficulty: setup.difficulty },
  })
  const players = [human]
  if (setup.mode === 'ffa') {
    for (let i = 1; i < setup.ffaPlayers; i++) players.push(bot(LOCAL_PLAYER_ID + i, 'red'))
    return players
  }
  for (let i = 1; i < setup.teamSize; i++) players.push(bot(LOCAL_PLAYER_ID + i, 'blue'))
  for (let i = 0; i < setup.teamSize; i++)
    players.push(bot(LOCAL_PLAYER_ID + setup.teamSize + i, 'red'))
  return players
}

export function createGameConfig(setup: MatchSetup): GameConfig {
  return { seed: setup.seed, mode: setup.mode, players: matchPlayers(setup) }
}
