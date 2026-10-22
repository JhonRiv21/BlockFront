<script lang="ts">
  import { hudState } from './hud-state.svelte.ts'
  import { t } from '../i18n/locale.svelte.ts'
  import { itemLabel, PRIMARIES } from './labels.ts'
</script>

<!-- Main menu: one click to play. Settings, controls and credits arrive in F3. -->
<div class="absolute inset-0 bg-black/40"></div>
<div
  class="absolute top-1/2 left-1/2 flex w-[min(92vw,34rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-4 rounded-lg bg-hud-panel px-8 py-8 text-center"
>
  <h1 class="text-4xl font-bold tracking-wide">Blockfront</h1>
  <p class="text-sm text-hud-muted">{t('menu.subtitle')}</p>
  <span class="mt-2 text-xs text-hud-muted">{t('hud.primaryWeapon')}</span>
  <div class="pointer-events-auto flex flex-wrap justify-center gap-1.5">
    {#each PRIMARIES as weapon (weapon)}
      <button
        type="button"
        class="rounded-md border-2 px-3 py-1.5 text-sm {weapon === hudState.menuPrimary
          ? 'border-hud bg-hud/90 font-semibold text-hud-ink'
          : 'border-hud-muted/30 bg-hud-panel text-hud hover:border-hud'}"
        onclick={() => (hudState.menuPrimary = weapon)}>{itemLabel(weapon)}</button
      >
    {/each}
  </div>
  <button
    type="button"
    class="pointer-events-auto mt-2 rounded-md bg-hud px-10 py-3 text-lg font-bold text-hud-ink hover:bg-white"
    onclick={() => hudState.startMatch(hudState.menuPrimary)}>{t('menu.play')}</button
  >
  <div class="mt-2 text-xs text-hud-muted">
    <p>{t('hint.move')}</p>
    <p>{t('hint.slots')}</p>
    <p>{t('hint.mouse')}</p>
  </div>
</div>
