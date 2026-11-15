<script lang="ts">
  import { hudState } from './hud-state.svelte.ts'
  import { t } from '../i18n/locale.svelte.ts'
  import { causeLabel, displayName } from './labels.ts'
  import PrimaryPicker from './PrimaryPicker.svelte'

  // The primary picked here (click or 1-5) arrives with the next life; the sim enforces it. CTF
  // brings players back in waves, TDM and FFA one by one. The pointer is free while dead.
</script>

<div
  class="absolute top-1/2 left-1/2 flex w-[min(92vw,36rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 rounded-md bg-hud-panel px-6 py-4 text-center"
>
  {#if hudState.killedBy && hudState.killedBy !== 'you'}
    <p class="text-2xl font-bold text-team-red-ink">
      {t('death.by', { name: displayName(hudState.killedBy) })}
    </p>
  {:else}
    <p class="text-2xl font-bold text-team-red-ink">{t('death.self')}</p>
  {/if}
  {#if hudState.killedWith}
    <p class="text-base text-hud-muted">
      {t('death.with', { tool: causeLabel(hudState.killedWith) })}
    </p>
  {/if}
  <div class="mt-1 flex gap-6 text-base tabular-nums">
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
    {hudState.matchMode === 'ctf'
      ? t('death.nextWave', { s: Math.ceil(hudState.respawnIn) })
      : t('hud.respawnIn', { s: Math.ceil(hudState.respawnIn) })}
  </p>
  <span class="mt-1 text-sm text-hud-muted">{t('death.loadout')}</span>
  <PrimaryPicker keys />
</div>
