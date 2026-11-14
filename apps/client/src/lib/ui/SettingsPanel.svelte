<script lang="ts">
  import { hudState } from './hud-state.svelte.ts'
  import { locale, t } from '../i18n/locale.svelte.ts'
  import type { StringKey } from '../i18n/strings.ts'
  import { settingsState } from '../settings/settings-state.svelte.ts'
  import { SETTING_RANGES, type Settings } from '../settings/settings.ts'
  import ChoiceButton from './ChoiceButton.svelte'

  // Settings from the menu and the pause panel; every change is saved and applied at once.
  type SliderKey = keyof typeof SETTING_RANGES
  type ToggleKey = 'invertY' | 'showFps' | 'reduceMotion'
  const values = $derived(settingsState.values)

  const format: Record<SliderKey, (value: number) => string> = {
    sensitivity: (v) => `${v.toFixed(2)}×`,
    adsSensitivity: (v) => `${v.toFixed(2)}×`,
    fov: (v) => `${Math.round(v)}°`,
    volumeMaster: (v) => `${Math.round(v * 100)} %`,
    volumeWeapons: (v) => `${Math.round(v * 100)} %`,
    volumeWorld: (v) => `${Math.round(v * 100)} %`,
  }
  const sections: { title: StringKey; sliders: SliderKey[]; toggles: ToggleKey[] }[] = [
    {
      title: 'settings.controls',
      sliders: ['sensitivity', 'adsSensitivity'],
      toggles: ['invertY'],
    },
    { title: 'settings.video', sliders: ['fov'], toggles: ['showFps', 'reduceMotion'] },
    {
      title: 'settings.audio',
      sliders: ['volumeMaster', 'volumeWeapons', 'volumeWorld'],
      toggles: [],
    },
  ]
  const setNumber = (key: SliderKey, event: Event) =>
    settingsState.set(key, Number((event.currentTarget as HTMLInputElement).value))
  const setToggle = (key: ToggleKey, value: boolean) => settingsState.set(key, value)
  const setLanguage = (language: Settings['language']) => settingsState.set('language', language)
  const close = () => (hudState.settingsOpen = false)
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape') close()
  }}
/>

<div class="absolute inset-0 bg-black/45"></div>
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="settings-title"
  class="pointer-events-auto absolute top-1/2 left-1/2 flex max-h-[94vh] w-[min(94vw,40rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto rounded-lg bg-hud-panel px-7 py-6"
>
  <h2 id="settings-title" class="text-2xl font-bold">{t('settings.title')}</h2>
  {#each sections as section (section.title)}
    <section class="flex flex-col gap-3">
      <h3 class="text-sm font-semibold tracking-widest text-hud-muted uppercase">
        {t(section.title)}
      </h3>
      {#each section.sliders as key (key)}
        <label class="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 text-base">
          <span>{t(`settings.${key}`)}</span>
          <span class="text-right text-hud-muted tabular-nums">{format[key](values[key])}</span>
          <input
            type="range"
            class="col-span-2 w-full accent-hud"
            min={SETTING_RANGES[key].min}
            max={SETTING_RANGES[key].max}
            step={SETTING_RANGES[key].step}
            value={values[key]}
            oninput={(event) => setNumber(key, event)}
          />
        </label>
      {/each}
      {#each section.toggles as key (key)}
        <div class="flex items-center justify-between gap-4 text-base">
          <span>{t(`settings.${key}`)}</span>
          <div class="flex shrink-0 gap-1.5">
            <ChoiceButton selected={values[key]} onclick={() => setToggle(key, true)}
              >{t('settings.on')}</ChoiceButton
            >
            <ChoiceButton selected={!values[key]} onclick={() => setToggle(key, false)}
              >{t('settings.off')}</ChoiceButton
            >
          </div>
        </div>
      {/each}
    </section>
  {/each}
  <section class="flex items-center justify-between gap-4 text-base">
    <span>{t('settings.language')}</span>
    <div class="flex gap-1.5">
      <ChoiceButton selected={locale.current === 'es'} onclick={() => setLanguage('es')}
        >Español</ChoiceButton
      >
      <ChoiceButton selected={locale.current === 'en'} onclick={() => setLanguage('en')}
        >English</ChoiceButton
      >
    </div>
  </section>
  <div class="flex flex-wrap justify-between gap-3">
    <button
      type="button"
      class="rounded-md border-2 border-hud-muted/40 px-5 py-2 text-base hover:border-hud focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hud"
      onclick={() => settingsState.reset()}>{t('settings.reset')}</button
    >
    <button
      type="button"
      class="rounded-md bg-hud px-8 py-2 text-lg font-bold text-hud-ink hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hud"
      onclick={close}>{t('settings.back')}</button
    >
  </div>
</div>
