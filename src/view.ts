// Drawing the screens. Each function builds fresh elements from the state it is given.
import { t } from "./i18n";
import { detailScreen } from "./view/detail";
import { button, el } from "./view/dom";
import { healthScreen } from "./view/health";
import { orgScreen } from "./view/org";
import { groupSwitch, sessionGroups } from "./view/programmes";
import { hiddenBlock, legend, viewSwitch } from "./view/sessions";
import {
  CONNECTION,
  menu,
  micJump,
  missing,
  newVersion,
  restartNote,
  updatePanel,
  usageButton,
  usagePanel,
  waitingCount,
} from "./view/top";
import { type Actions, type Home } from "./view/types";
import { prsBlock, waitingBlock } from "./view/work";

// What the rest of the app reaches through this module.
export { hasPrompt, matches } from "./view/dom";
export type { Actions, Connection, Detail, GroupBy, Home, Theme, UpdateActions, View } from "./view/types";

export function signInScreen(error: string | null, onSubmit: (secret: string) => void): HTMLElement {
  const input = el("input");
  input.type = "password";
  input.name = "secret";
  input.autocomplete = "current-password";
  input.placeholder = t("signin.placeholder");
  input.required = true;
  const button = el("button", undefined, t("signin.button"));
  button.type = "submit";
  const form = el("form", "signin", input, button);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    onSubmit(input.value);
  });
  return el(
    "section",
    "signin-screen",
    el("h1", undefined, t("app.title")),
    el("p", "muted", t("signin.intro")),
    ...(error ? [el("p", "error", error)] : []),
    form,
  );
}

function lostContact(home: Home): HTMLElement[] {
  if (home.connection !== "reconnecting") return [];
  const banner = el("p", "lost-contact", t("connection.lost"));
  banner.setAttribute("role", "status");
  return [banner];
}

/** A screen that takes the place of the sessions: a session's page, an Organisation view, or health. */
function asideScreen(home: Home, act: Actions): HTMLElement | null {
  if (home.open) return detailScreen(home, home.open, act);
  if (home.org) return orgScreen(home.org, home, act);
  if (home.health) return healthScreen(home.health.data, act);
  return null;
}

export function homeScreen(home: Home, act: Actions): HTMLElement {
  const menuToggle = button("⋯", act.toggleMenu, "menu-toggle");
  menuToggle.setAttribute("aria-label", t("menu.label"));
  menuToggle.setAttribute("aria-expanded", String(home.menuOpen));
  const connection = el("span", `connection ${home.connection}`, t(CONNECTION[home.connection]));
  const { hidden, groups: lists } = sessionGroups(home, act);
  const top = [
    el(
      "header",
      "top",
      el("h1", undefined, t("app.title")),
      ...waitingCount(home, act),
      ...micJump(home),
      ...restartNote(home, act),
      connection,
      ...usageButton(home, act),
      menuToggle,
    ),
    ...lostContact(home),
    ...menu(home, act),
    ...usagePanel(home),
    ...newVersion(home, act),
  ];
  const problem = home.problem ? [el("p", "notice", home.problem)] : [];
  const aside = asideScreen(home, act);
  if (aside) return el("section", "home", ...top, ...problem, aside);
  return el(
    "section",
    "home",
    ...top,
    ...missing(home, act.toggleDoctor),
    ...updatePanel(home, act.update),
    ...problem,
    ...waitingBlock(home, act),
    viewSwitch(home, act),
    ...groupSwitch(home, act),
    ...(home.legendOpen ? [legend()] : []),
    ...lists,
    ...hiddenBlock(hidden, home, act),
    ...prsBlock(home),
  );
}
