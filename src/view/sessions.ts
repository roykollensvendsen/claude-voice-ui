// The sessions themselves: a tile in the grid, a card in the list, and a long press on either.
import { plural, t } from "../i18n";
import { cardState, LOOK, type Look, type Session } from "../states";
import {
  button,
  claudeLink,
  el,
  gitRow,
  kindMark,
  matches,
  mic,
  number,
  numbered,
  peekMark,
  stateLine,
} from "../view/dom";
import { type Actions, type Home, type View } from "../view/types";

/** A question longer than this is cut short in an opened card, behind "Show more". */
export const QUESTION_CHARS = 200;

export function card(s: Session, home: Home, act: Actions): HTMLElement {
  const state = cardState(s);
  const look = LOOK[state];
  const focused = matches(s, home.focus);
  const open = home.expanded.has(s.id);
  // A div, not a button, because the arrow and the buttons inside an opened card are buttons themselves.
  const box = el("div", `card tone-${look.tone}`);
  box.setAttribute("role", "button");
  box.tabIndex = 0;
  box.dataset.session = s.id;
  box.dataset.state = state;
  if (home.active?.id === s.id) box.classList.add("active");
  if (focused) box.classList.add("focus");
  if (open) box.classList.add("open");
  const arrow = button(open ? "▾" : "▸", () => act.toggleCard(s.id), "expand");
  arrow.setAttribute("aria-expanded", String(open));
  arrow.setAttribute("aria-label", open ? t("session.showLess") : t("session.showMoreCard"));
  box.append(
    el(
      "div",
      "card-top",
      ...number(s),
      el("span", "name", s.name || s.id),
      ...(focused ? [mic()] : []),
      ...peekMark(s, home),
      ...kindMark(s),
      arrow,
    ),
    stateLine(s),
    ...onTheWay(s, home, true),
  );
  // The bridge's one line repeats the question while it waits, so the question is the line then.
  const line =
    s.question?.text ||
    s.doing ||
    (s.moved_to?.name ? t("session.continuesIn", { name: s.moved_to.name }) : "");
  if (!open) {
    if (line) box.append(el("div", "line", line));
  } else box.append(...openedCard(s, home, act));
  pressable(box, s, act, () => act.pick(s.id));
  return box;
}

/** Messages still on their way to the session, and why the last one did not get there. */
function onTheWay(s: Session, home: Home, withText: boolean): HTMLElement[] {
  const sending = s.sending ?? [];
  const failed = home.undelivered[s.id];
  const count = plural(sending.length, "session.sending");
  return [
    ...(sending.length
      ? [el("div", "sending", withText ? `${count}: ${sending.map((m) => m.text).join(" · ")}` : count)]
      : []),
    ...(failed === undefined ? [] : [el("div", "undelivered", t("session.undelivered", { detail: failed }))]),
  ];
}

/** What an opened card shows below its top line. */
function openedCard(s: Session, home: Home, act: Actions): HTMLElement[] {
  return [
    el("div", "meta", [s.project, s.kind].filter(Boolean).join(" · ")),
    ...(s.doing && !s.question ? [el("div", "line doing", s.doing)] : []),
    ...gitRow(s),
    ...(s.question ? [questionBlock(s.id, s.question, home, act)] : []),
    ...(s.moved_to?.name ? [el("div", "doing", t("session.continuesIn", { name: s.moved_to.name }))] : []),
    el(
      "div",
      "card-actions",
      button(t("session.hide"), () => act.hide(s.id), "hide"),
      button(t("session.openPage"), () => act.openPage(s.id), "open-detail"),
      ...claudeLink(s, t("session.openInClaude")),
    ),
  ];
}

/** The question a session waits on, cut short until the owner asks for the rest. */
function questionBlock(id: string, question: NonNullable<Session["question"]>, home: Home, act: Actions) {
  const full = question.text;
  const cut = full.length > QUESTION_CHARS && !home.more.has(id);
  const options = el("ul", "options", ...(question.options ?? []).map((o) => el("li", undefined, o)));
  return el(
    "div",
    "question",
    el("div", "question-text line", cut ? `${full.slice(0, QUESTION_CHARS).trimEnd()}…` : full),
    ...(cut ? [button(t("session.showMore"), () => act.showMore(id), "more")] : []),
    options,
  );
}

export const WAITING = new Set(["answer", "approval", "input"]);

/** How long a finger rests on a tile before its page opens instead of it being chosen. */
export const HOLD_MS = 500;

/**
 * A tap chooses the session; a long press opens its page instead, as does the keyboard's menu key.
 * Taps on a button or a link inside are theirs.
 */
export function pressable(box: HTMLElement, s: Session, act: Actions, tap: () => void) {
  let held = false;
  let press: ReturnType<typeof setTimeout> | undefined;
  box.addEventListener("pointerdown", (e) => {
    if ((e.target as Element).closest("button, a")) return;
    held = false;
    press = setTimeout(() => {
      held = true;
      act.openPage(s.id);
    }, HOLD_MS);
  });
  for (const end of ["pointerup", "pointerleave", "pointercancel"]) {
    box.addEventListener(end, () => clearTimeout(press));
  }
  // The phone's own long-press menu would cover the page opening.
  box.addEventListener("contextmenu", (e) => e.preventDefault());
  box.addEventListener("click", (e) => {
    if ((e.target as Element).closest("button, a")) return;
    // RULE: a long press opens the session's page without choosing it
    if (held) {
      held = false;
      return;
    }
    tap();
  });
  box.addEventListener("keydown", (e) => {
    if (e.target !== box) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      act.pick(s.id);
    } else if (e.key === "ContextMenu") {
      e.preventDefault();
      act.openPage(s.id);
    }
  });
}

/** A small square for the grid: the name, cut to fit, and the state as a colour and an icon. */
export function tile(s: Session, home: Home, act: Actions): HTMLElement {
  const state = cardState(s);
  const look = LOOK[state];
  // A div, not a button, because the link into the Claude app inside it is a link.
  const box = el("div", `tile tone-${look.tone}`);
  box.setAttribute("role", "button");
  box.tabIndex = 0;
  box.dataset.session = s.id;
  box.dataset.state = state;
  box.title = t("session.tileTitle", { name: numbered(s), state: look.label });
  pressable(box, s, act, () => {
    // Shown at once, before the page catches up with the choice.
    box.classList.add("picked");
    act.pick(s.id);
  });
  if (WAITING.has(state)) box.classList.add("waiting");
  if (home.active?.id === s.id) box.classList.add("active");
  if (home.picked === s.id) box.classList.add("picked");
  if (matches(s, home.focus)) box.classList.add("focus");
  box.append(
    el("span", "icon", look.icon),
    ...(matches(s, home.focus) ? [mic()] : []),
    ...peekMark(s, home),
    el("span", "name", s.name || s.id),
    ...number(s),
    ...(home.active?.id === s.id ? [el("span", "pin")] : []),
    ...claudeLink(s, "↗").map((a) => {
      a.setAttribute("aria-label", t("session.openNamedInClaude", { name: s.name || s.id }));
      return a;
    }),
    ...kindMark(s),
    ...onTheWay(s, home, false),
  );
  return box;
}

export function viewSwitch(home: Home, act: Actions): HTMLElement {
  const choice = (label: string, view: View) => {
    const b = button(label, () => act.setView(view));
    b.setAttribute("aria-pressed", String(home.view === view));
    return b;
  };
  const help = button("?", act.toggleLegend, "legend-toggle");
  help.setAttribute("aria-label", t("legend.label"));
  help.setAttribute("aria-expanded", String(home.legendOpen));
  return el("div", "view-switch", help, choice(t("view.grid"), "grid"), choice(t("view.cards"), "cards"));
}

/** What each colour, icon and ring means, from the same table the tiles are drawn from. */
export function legend(): HTMLElement {
  const states = (Object.values(LOOK) as Look[]).map((look) =>
    el(
      "li",
      `tone-${look.tone}`,
      el("span", "icon", look.icon),
      t("legend.item", { label: look.label, meaning: look.meaning }),
    ),
  );
  return el(
    "ul",
    "legend",
    ...states,
    el("li", "ring active", t("legend.chosen")),
    el("li", "ring focus", t("legend.talking")),
    el("li", "peek", t("legend.peek")),
    el("li", "kind", el("span", "kind", ">_"), t("legend.kind")),
  );
}

/** Hidden sessions that are running, as a count that opens into a list with a way back for each. */
export function hiddenBlock(hidden: Session[], home: Home, act: Actions): HTMLElement[] {
  if (!hidden.length) return [];
  const count = plural(hidden.length, "hidden.count");
  const toggle = button(count, act.toggleHidden, "hidden-toggle");
  toggle.setAttribute("aria-expanded", String(home.hiddenOpen));
  const list = home.hiddenOpen
    ? [
        el(
          "ul",
          "hidden-list",
          ...hidden.map((s) =>
            el(
              "li",
              undefined,
              el("span", undefined, s.name || s.id),
              button(t("hidden.showAgain"), () => act.unhide(s.id)),
            ),
          ),
        ),
      ]
    : [];
  return [el("section", "hidden-sessions", toggle, ...list)];
}
