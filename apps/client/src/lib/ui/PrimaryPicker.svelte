<script lang="ts">
  import { hudState } from './hud-state.svelte.ts'
  import { itemLabel } from './labels.ts'
  import { PRIMARIES } from '../settings/match-setup.ts'
  import ChoiceButton from './ChoiceButton.svelte'

  // Death screen: number keys pick too, so their numbers are shown.
  let { keys = false }: { keys?: boolean } = $props()
</script>

<div class="flex flex-wrap justify-center gap-1.5">
  {#each PRIMARIES as weapon, i (weapon)}
    <ChoiceButton
      selected={weapon === hudState.menuPrimary}
      onclick={() => hudState.selectPrimary(weapon)}
      >{#if keys}<span class="mr-1.5 opacity-60">{i + 1}</span>{/if}{itemLabel(
        weapon,
      )}</ChoiceButton
    >
  {/each}
</div>
