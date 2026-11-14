<script lang="ts">
  import type { MatchSetup } from '@blockfront/sim/match/setup'
  import { hudState } from './hud-state.svelte.ts'
  import { menuState } from './menu-state.svelte.ts'
  import { t } from '../i18n/locale.svelte.ts'
  import { itemLabel } from './labels.ts'
  import {
    DIFFICULTIES,
    FFA_SIZES,
    MODES,
    modeTarget,
    PRIMARIES,
    TEAM_SIZES,
  } from '../settings/match-setup.ts'
  import ChoiceButton from './ChoiceButton.svelte'

  // Main menu: mode, size, difficulty and primary, all remembered; Play is one click away with
  // the last choice (TDM 4v4 Soldier the first time).
  const setup = $derived(menuState.setup)
  const choose = (patch: Partial<MatchSetup>) => menuState.choose(patch)
</script>

<div class="absolute inset-0 bg-black/45"></div>
<div
  class="pointer-events-auto absolute top-1/2 left-1/2 flex max-h-[96vh] w-[min(94vw,52rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto rounded-lg bg-hud-panel px-8 py-7"
>
  <header class="text-center">
    <h1 class="text-5xl font-bold tracking-wide">Blockfront</h1>
    <p class="mt-1 text-base text-hud-muted">{t('menu.subtitle')}</p>
  </header>

  <section class="flex flex-col gap-2">
    <h2 class="text-sm font-semibold tracking-widest text-hud-muted uppercase">
      {t('menu.mode')}
    </h2>
    <div class="grid gap-2 sm:grid-cols-3">
      {#each MODES as mode (mode)}
        <button
          type="button"
          aria-pressed={setup.mode === mode}
          class="flex flex-col gap-1 rounded-md border-2 px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hud {setup.mode ===
          mode
            ? 'border-hud bg-hud/15'
            : 'border-hud-muted/40 bg-hud-solid/60 hover:border-hud'}"
          onclick={() => choose({ mode })}
        >
          <span class="text-lg font-bold">{t(`mode.${mode}`)}</span>
          <span class="text-sm leading-snug text-hud-muted"
            >{t(`mode.${mode}.desc`, { n: modeTarget(mode, setup) })}</span
          >
        </button>
      {/each}
    </div>
  </section>

  <div class="grid gap-5 sm:grid-cols-2">
    <section class="flex flex-col gap-2">
      <h2 class="text-sm font-semibold tracking-widest text-hud-muted uppercase">
        {t('menu.size')}
      </h2>
      <div class="flex flex-wrap gap-1.5">
        {#if setup.mode === 'ffa'}
          {#each FFA_SIZES as size (size)}
            <ChoiceButton
              selected={setup.ffaPlayers === size}
              onclick={() => choose({ ffaPlayers: size })}
              >{t('menu.players', { n: size })}</ChoiceButton
            >
          {/each}
        {:else}
          {#each TEAM_SIZES as size (size)}
            <ChoiceButton
              selected={setup.teamSize === size}
              onclick={() => choose({ teamSize: size })}>{size}v{size}</ChoiceButton
            >
          {/each}
        {/if}
      </div>
    </section>
    <section class="flex flex-col gap-2">
      <h2 class="text-sm font-semibold tracking-widest text-hud-muted uppercase">
        {t('menu.difficulty')}
      </h2>
      <div class="flex flex-wrap gap-1.5">
        {#each DIFFICULTIES as difficulty (difficulty)}
          <ChoiceButton
            selected={setup.difficulty === difficulty}
            onclick={() => choose({ difficulty })}>{t(`difficulty.${difficulty}`)}</ChoiceButton
          >
        {/each}
      </div>
    </section>
  </div>

  <section class="flex flex-col gap-2">
    <h2 class="text-sm font-semibold tracking-widest text-hud-muted uppercase">
      {t('hud.primaryWeapon')}
    </h2>
    <div class="flex flex-wrap gap-1.5">
      {#each PRIMARIES as weapon (weapon)}
        <ChoiceButton
          selected={setup.primary === weapon}
          onclick={() => choose({ primary: weapon })}>{itemLabel(weapon)}</ChoiceButton
        >
      {/each}
    </div>
  </section>

  <div class="flex flex-wrap items-center justify-center gap-3">
    <button
      type="button"
      class="rounded-md bg-hud px-14 py-3 text-xl font-bold text-hud-ink hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hud"
      onclick={() => hudState.startMatch(menuState.current())}>{t('menu.play')}</button
    >
    <button
      type="button"
      class="rounded-md border-2 border-hud-muted/40 px-6 py-3 text-lg hover:border-hud focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hud"
      onclick={() => (hudState.settingsOpen = true)}>{t('menu.settings')}</button
    >
  </div>

  <div class="text-center text-sm leading-relaxed text-hud-muted">
    <p>{t('hint.move')}</p>
    <p>{t('hint.slots')}</p>
    <p>{t('hint.mouse')}</p>
  </div>
</div>
