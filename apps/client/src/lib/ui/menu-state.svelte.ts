import type { MatchSetup } from '@blockfront/sim/match/setup'
import { browserStorage } from '../settings/storage.ts'
import { loadSetup, sanitizeSetup, saveSetup } from '../settings/match-setup.ts'

// The main menu's choice, remembered between visits.
class MenuState {
  setup = $state<MatchSetup>(loadSetup(browserStorage()))

  choose(patch: Partial<MatchSetup>): void {
    this.setup = sanitizeSetup({ ...this.setup, ...patch })
    saveSetup(browserStorage(), this.setup)
  }

  // A plain copy: the reactive proxy cannot be posted to the sim worker.
  current(): MatchSetup {
    return $state.snapshot(this.setup)
  }
}

export const menuState = new MenuState()
