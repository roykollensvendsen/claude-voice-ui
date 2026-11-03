// What this phone remembers between visits, and the language and theme it shows the page in.
import { LANGUAGES, type Language, pickLanguage, setLanguage } from "../i18n";
import { type Keep, recall } from "../remember";
import type { Theme } from "../view";

export const EXPANDED = "cvu.expanded";
export const HIDDEN = "cvu.hidden";
export const VIEW = "cvu.view";
export const THEME = "cvu.theme";
export const LANG = "cvu.lang";
/** The build this phone last loaded, where What's new starts. */
export const BUILD = "cvu.build";

export function recalledLanguage(keep: Keep | undefined): Language | "system" {
  const saved = recall<string>(keep, LANG, "system");
  return Object.hasOwn(LANGUAGES, saved) ? (saved as Language) : "system";
}

/** Show the page in the chosen language, or the first of the phone's that the page has. */
export function applyLanguage(choice: Language | "system") {
  setLanguage(choice === "system" ? pickLanguage(navigator.languages ?? [navigator.language]) : choice);
}

/** Mark the page with the chosen theme; without a mark the stylesheet follows the phone. */
export function applyTheme(theme: Theme) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}
