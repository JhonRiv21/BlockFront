import { detectLocale, LOCALES, type Locale, type StringKey } from './strings.ts'

// Reactive so a language selector can switch it live later; starts from the browser.
class LocaleState {
  current = $state<Locale>(detectLocale(navigator.languages ?? [navigator.language]))

  set(locale: Locale): void {
    this.current = locale
    document.documentElement.lang = locale
  }
}

export const locale = new LocaleState()
document.documentElement.lang = locale.current

export function t(key: StringKey, values?: Record<string, string | number>): string {
  let text: string = LOCALES[locale.current][key]
  if (values) {
    for (const [name, value] of Object.entries(values))
      text = text.replace(`{${name}}`, String(value))
  }
  return text
}
