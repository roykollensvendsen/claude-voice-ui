// The page's own words, in the owner's language. What the sessions say is never passed through here.
import en from "./i18n/en.json" with { type: "json" };
import es from "./i18n/es.json" with { type: "json" };
import nb from "./i18n/nb.json" with { type: "json" };

export type Key = keyof typeof en;
/** A key with ".one" and ".other" forms, less the ending. */
export type CountKey = { [K in Key]: K extends `${infer B}.other` ? B : never }[Key];

export const LANGUAGES = { en, nb, es } satisfies Record<string, Record<Key, string>>;
export type Language = keyof typeof LANGUAGES;
/** Each language by its own name, for the menu. */
export const NAMES: Record<Language, string> = { en: "English", nb: "Norsk", es: "Español" };

let current: Language = "en";

export function setLanguage(language: Language) {
  current = language;
  document.documentElement.lang = language;
}

export function language(): Language {
  return current;
}

/** The first of the phone's languages the page has; Norwegian of any written form reads bokmål. */
export function pickLanguage(preferred: readonly string[]): Language {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split("-")[0] ?? "";
    if (["nb", "no", "nn"].includes(base)) return "nb";
    if (base === "es" || base === "en") return base;
  }
  return "en";
}

/** The text for `key`, with each {blank} filled in. */
export function t(key: Key, blanks: Record<string, string | number> = {}): string {
  const text = LANGUAGES[current][key] ?? en[key];
  return text.replace(/\{([a-z]+)\}/g, (whole, name: string) =>
    name in blanks ? String(blanks[name]) : whole,
  );
}

/** The form of `key` that fits `count` in the current language, with {count} filled in. */
export function plural(count: number, key: CountKey, blanks: Record<string, string | number> = {}): string {
  const form = new Intl.PluralRules(current).select(count) === "one" ? "one" : "other";
  return t(`${key}.${form}` as Key, { count, ...blanks });
}
