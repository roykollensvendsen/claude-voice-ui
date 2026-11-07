// The page as it starts: empty, apart from what this phone remembers.
import { type Keep, recall } from "../remember";
import { IDLE } from "../update";
import type { Home, View } from "../view";
import { EXPANDED, FOLDED, HIDDEN, recalledLanguage, THEME, VIEW } from "./preferences";

export function freshHome(keep: Keep | undefined): Home {
  return {
    sessions: [],
    active: null,
    machines: [],
    focus: null,
    peeks: [],
    placed: [],
    prompts: [],
    settings: null,
    health: null,
    replies: {},
    connection: "connecting",
    problem: null,
    doctor: null,
    usage: null,
    bridge: null,
    update: { ...IDLE },
    open: null,
    expanded: new Set(recall<string[]>(keep, EXPANDED, [])),
    // RULE: a machine's folded group stays folded when the page opens again
    folded: new Set(recall<string[]>(keep, FOLDED, [])),
    hidden: recall<Record<string, string>>(keep, HIDDEN, {}),
    more: new Set(),
    hiddenOpen: false,
    // RULE: the view chosen is remembered
    view: recall<View>(keep, VIEW, "grid") === "cards" ? "cards" : "grid",
    legendOpen: false,
    usageOpen: false,
    newVersion: false,
    whatsNew: null,
    // RULE: the theme chosen is remembered
    theme: (["light", "dark"] as const).find((t) => t === recall<string>(keep, THEME, "system")) ?? "system",
    menuOpen: false,
    // RULE: the language chosen is remembered
    language: recalledLanguage(keep),
    picked: null,
    doctorOpen: false,
    undelivered: {},
    restarted: null,
  };
}
