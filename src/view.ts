// Drawing the screens. Each function builds fresh elements from the state it is given.
import { t } from "./i18n";
import { type Session } from "./states";
import { detailScreen } from "./view/detail";
import { button, el } from "./view/dom";
import { healthScreen } from "./view/health";
import { card, hiddenBlock, legend, tile, viewSwitch } from "./view/sessions";
import {
  CONNECTION,
  menu,
  micJump,
  missing,
  newVersion,
  updatePanel,
  usageButton,
  usagePanel,
  waitingCount,
} from "./view/top";
import { type Actions, type Home } from "./view/types";

// What the rest of the app reaches through this module.
export { hasPrompt, matches } from "./view/dom";
export type { Actions, Connection, Detail, Home, Theme, UpdateActions, View } from "./view/types";

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

/** While the stream is down, what is shown is only the last that was known. */
function staleWhileLost(home: Home, list: HTMLElement): HTMLElement {
  if (home.connection !== "reconnecting") return list;
  list.setAttribute("aria-busy", "true");
  for (const item of list.querySelectorAll<HTMLElement>("[data-session]")) item.classList.add("stale");
  return list;
}

function lostContact(home: Home): HTMLElement[] {
  if (home.connection !== "reconnecting") return [];
  const banner = el("p", "lost-contact", t("connection.lost"));
  banner.setAttribute("role", "status");
  return [banner];
}

export function homeScreen(home: Home, act: Actions): HTMLElement {
  const menuToggle = button("⋯", act.toggleMenu, "menu-toggle");
  menuToggle.setAttribute("aria-label", t("menu.label"));
  menuToggle.setAttribute("aria-expanded", String(home.menuOpen));
  const connection = el("span", `connection ${home.connection}`, t(CONNECTION[home.connection]));
  const byId = new Map(home.sessions.map((s) => [s.id, s]));
  const placed = home.placed.map((id) => byId.get(id));
  const sessions = placed.filter((s): s is Session => Boolean(s) && !((s as Session).id in home.hidden));
  const hidden = home.sessions.filter((s) => s.id in home.hidden);
  const none = el("p", "muted", hidden.length ? t("sessions.allHidden") : t("sessions.none"));
  // An ended session leaves a gap in the grid, so the others stay put until the page is opened again.
  const items =
    home.view === "grid"
      ? placed.flatMap((s) =>
          !s ? [el("div", "tile gap")] : s.id in home.hidden ? [] : [tile(s, home, act)],
        )
      : sessions.map((s) => card(s, home, act));
  const list = staleWhileLost(home, el("div", home.view, ...(sessions.length ? items : [none])));
  const top = [
    el(
      "header",
      "top",
      el("h1", undefined, t("app.title")),
      ...waitingCount(home, act),
      ...micJump(home),
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
  if (home.open) return el("section", "home", ...top, ...problem, detailScreen(home, home.open, act));
  if (home.health) return el("section", "home", ...top, ...problem, healthScreen(home.health.data, act));
  return el(
    "section",
    "home",
    ...top,
    ...missing(home, act.toggleDoctor),
    ...updatePanel(home, act.update),
    ...problem,
    viewSwitch(home, act),
    ...(home.legendOpen ? [legend()] : []),
    list,
    ...hiddenBlock(hidden, home, act),
  );
}
