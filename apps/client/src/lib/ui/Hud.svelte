<script lang="ts">
  import { hudState } from './hud-state.svelte.ts'
  import Compass from './Compass.svelte'
  import DeathScreen from './DeathScreen.svelte'
  import GameHud from './GameHud.svelte'
  import MainMenu from './MainMenu.svelte'
  import MatchEnd from './MatchEnd.svelte'
  import Overlays from './Overlays.svelte'
  import PausePanel from './PausePanel.svelte'
  import Scoreboard from './Scoreboard.svelte'
  import SettingsPanel from './SettingsPanel.svelte'
  import LoadingScreen from './LoadingScreen.svelte'
  import { settingsState } from '../settings/settings-state.svelte.ts'
  import { t } from '../i18n/locale.svelte.ts'

  const loaded = $derived(hudState.loadStage === 'done')
  const settingsShown = $derived(hudState.settingsOpen && hudState.phase !== 'playing')
</script>

<!-- 9×9 pixel heart: outline, fill and a highlight texel. Drawn once, reused with <use>. -->
<svg class="absolute size-0" aria-hidden="true">
  <defs>
    <symbol id="heart" viewBox="0 0 9 9">
      <path
        fill="currentColor"
        d="M1 1h2v1h1v1h1V2h1V1h2v1h1v3H8v1H7v1H6v1H5v1H4V8H3V7H2V6H1V5H0V2h1z"
      />
      <path fill="rgba(255,255,255,0.45)" d="M1 2h1v1H1zM2 1h1v1H2z" />
    </symbol>
    <!-- 9×9 pixel air bubble as in Minecraft: pale blue outline, see-through inside, a white
         highlight texel top-left and a darker shade bottom-right. -->
    <symbol id="bubble" viewBox="0 0 9 9">
      <path
        fill="currentColor"
        d="M3 0h3v1H3zM2 1h1v1H2zM6 1h1v1H6zM1 2h1v1H1zM7 2h1v1H7zM0 3h1v3H0zM8 3h1v3H8zM1 6h1v1H1zM7 6h1v1H7zM2 7h1v1H2zM6 7h1v1H6zM3 8h3v1H3z"
      />
      <path fill="rgba(255,255,255,0.9)" d="M2 2h1v1H2zM3 1h1v1H3zM1 3h1v2H1z" />
      <path fill="rgba(30,90,140,0.55)" d="M6 6h1v1H6zM5 7h1v1H5zM7 4h1v2H7z" />
    </symbol>
  </defs>
</svg>

<div class="pointer-events-none fixed inset-0 font-hud text-hud select-none">
  <Overlays />
  {#if hudState.phase !== 'menu'}
    <GameHud />
    {#if hudState.hasSnapshot}
      <Compass />
    {/if}
    {#if !hudState.alive && hudState.matchState !== 'ended'}
      <DeathScreen />
    {/if}
    {#if hudState.showScoreboard && hudState.matchState !== 'ended'}
      <Scoreboard />
    {/if}
    {#if hudState.matchState === 'ended'}
      <MatchEnd />
    {/if}
  {/if}
  {#if hudState.phase === 'paused' && !settingsShown}
    <PausePanel />
  {/if}
  {#if hudState.phase === 'menu' && loaded && !settingsShown}
    <MainMenu />
  {/if}
  {#if settingsShown}
    <SettingsPanel />
  {/if}
  {#if settingsState.values.showFps && !hudState.showStats}
    <div
      class="absolute top-4 right-4 rounded-md bg-hud-panel px-2.5 py-1 text-base font-semibold tabular-nums"
    >
      {t('hud.fps', { n: hudState.fps })}
    </div>
  {/if}
  {#if !loaded && hudState.phase === 'menu'}
    <LoadingScreen />
  {/if}
</div>
