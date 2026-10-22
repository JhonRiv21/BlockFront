<script lang="ts">
  import { hudState } from './hud-state.svelte.ts'
  import { t } from '../i18n/locale.svelte.ts'
  import { causeLabel, displayName, itemLabel, PRIMARIES } from './labels.ts'

  // The primary picked here arrives with the next wave; the sim enforces it.
</script>

<div
  class="absolute top-1/2 left-1/2 flex w-[min(92vw,30rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 rounded-md bg-hud-panel px-6 py-4 text-center"
>
  {#if hudState.killedBy && hudState.killedBy !== 'you'}
    <p class="text-2xl font-bold text-team-red">
      {t('death.by', { name: displayName(hudState.killedBy) })}
    </p>
  {:else}
    <p class="text-2xl font-bold text-team-red">{t('death.self')}</p>
  {/if}
  {#if hudState.killedWith}
    <p class="text-sm text-hud-muted">
      {t('death.with', { tool: causeLabel(hudState.killedWith) })}
    </p>
  {/if}
  <div class="mt-1 flex gap-6 text-sm tabular-nums">
    <span
      ><span class="text-hud-muted">{t('death.dealt')}</span>
      <span class="font-semibold">{Math.round(hudState.dealtThisLife)}</span></span
    >
    <span
      ><span class="text-hud-muted">{t('death.taken')}</span>
      <span class="font-semibold">{Math.round(hudState.takenThisLife)}</span></span
    >
  </div>
  <p class="mt-1 text-lg font-semibold tabular-nums">
    {t('death.nextWave', { s: Math.ceil(hudState.respawnIn) })}
  </p>
  <span class="mt-1 text-xs text-hud-muted">{t('death.loadout')}</span>
  <div class="pointer-events-auto flex flex-wrap justify-center gap-1.5">
    {#each PRIMARIES as weapon (weapon)}
      <button
        type="button"
        class="rounded-md border-2 px-3 py-1.5 text-sm {weapon === hudState.menuPrimary
          ? 'border-hud bg-hud/90 font-semibold text-hud-ink'
          : 'border-hud-muted/30 bg-hud-panel text-hud hover:border-hud'}"
        onclick={() => hudState.selectPrimary(weapon)}>{itemLabel(weapon)}</button
      >
    {/each}
  </div>
</div>
