import { EN_MESSAGES, type MessageKey, type MessageParams } from "./messages";
import { TRANSLATIONS } from "./translations";

export const SUPPORTED_LOCALES = [
  "en", "am", "ar", "be", "bn", "ca", "cs", "da", "de", "el", "en-GB", "es",
  "fa", "fi", "fr", "ga", "he", "hu", "id", "it", "ja", "ka", "kh", "ko", "lv",
  "ms", "ne", "nl", "no", "pl", "pt", "pt-BR", "ro", "ru", "sa", "sk", "sq", "sr",
  "sv", "th", "tr", "uk", "uz", "vi", "zh", "zh-TW",
] as const;

export type SupportedLocale = typeof SUPPORTED_LOCALES[number];

const SUPPORTED_LOCALE_SET = new Set<string>(SUPPORTED_LOCALES);
const SUPPORTED_LOCALE_ALIASES = new Map(
  SUPPORTED_LOCALES.map((locale) => [locale.toLowerCase(), locale] as const),
);
const INTL_LOCALE_OVERRIDES: Partial<Record<SupportedLocale, string>> = {
  kh: "km",
  zh: "zh-CN",
};

export function resolveLocale(locale: string): SupportedLocale {
  if (SUPPORTED_LOCALE_SET.has(locale)) return locale as SupportedLocale;
  const normalized = locale.replace("_", "-");
  const exactAlias = SUPPORTED_LOCALE_ALIASES.get(normalized.toLowerCase());
  if (exactAlias) return exactAlias;
  const base = normalized.split("-")[0];
  const baseAlias = SUPPORTED_LOCALE_ALIASES.get(base.toLowerCase());
  if (baseAlias) return baseAlias;
  return "en";
}

export class I18n {
  readonly locale: SupportedLocale;
  readonly intlLocale: string;

  constructor(locale: string) {
    this.locale = resolveLocale(locale);
    this.intlLocale = INTL_LOCALE_OVERRIDES[this.locale] ?? this.locale;
  }

  t(key: MessageKey, params: MessageParams = {}): string {
    const template = TRANSLATIONS[this.locale]?.[key] ?? EN_MESSAGES[key];
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match);
  }

  formatWeekday(date: Date): string {
    try {
      return new Intl.DateTimeFormat(this.intlLocale, { weekday: "short" }).format(date);
    } catch {
      return new Intl.DateTimeFormat("en", { weekday: "short" }).format(date);
    }
  }
}

export function createI18n(locale: string): I18n {
  return new I18n(locale);
}
