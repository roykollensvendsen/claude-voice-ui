// The sessions, in one group for the bridge's own computer and one for each other computer it reaches.
import type { Machine } from "../bridge";
import { type Key, plural, t } from "../i18n";
import type { Session } from "../states";
import { ago, button, el } from "../view/dom";
import { card, tile } from "../view/sessions";
import type { Actions, Home } from "../view/types";

/** The bridge's own group, kept apart from any machine's name. */
export const HUB = "hub";

/** While the stream is down, what is shown is only the last that was known. */
function staleWhileLost(home: Home, list: HTMLElement): HTMLElement {
  if (home.connection !== "reconnecting") return list;
  list.setAttribute("aria-busy", "true");
  for (const item of list.querySelectorAll<HTMLElement>("[data-session]")) item.classList.add("stale");
  return list;
}

/** The sessions shown in one place, in the order they were placed; an ended one leaves a gap in the grid. */
function sessionList(home: Home, act: Actions, placed: (Session | undefined)[], none: HTMLElement | null) {
  const shown = placed.filter((s): s is Session => Boolean(s) && !((s as Session).id in home.hidden));
  const items =
    home.view === "grid"
      ? placed.flatMap((s) =>
          !s ? [el("div", "tile gap")] : s.id in home.hidden ? [] : [tile(s, home, act)],
        )
      : shown.map((s) => card(s, home, act));
  return staleWhileLost(home, el("div", home.view, ...(shown.length || !none ? items : [none])));
}

/** The machine an id belongs to: the session's own, or for a gap, the machine named in front of its id. */
function machineOf(id: string, s: Session | undefined, names: string[]): string | null {
  if (s) return s.machine ?? null;
  return names.find((name) => id.startsWith(`${name}/`)) ?? null;
}

/** This computer's sessions, then one group for each other computer the bridge reaches. */
export function groups(home: Home, act: Actions) {
  const byId = new Map(home.sessions.map((s) => [s.id, s]));
  const names = [
    ...new Set([
      ...home.machines.map((m) => m.name),
      ...home.sessions.flatMap((s) => (s.machine ? [s.machine] : [])),
    ]),
  ];
  const placedOn = (machine: string | null) =>
    home.placed.filter((id) => machineOf(id, byId.get(id), names) === machine).map((id) => byId.get(id));
  const hidden = home.sessions.filter((s) => s.id in home.hidden);
  const none = el("p", "muted", hidden.length ? t("sessions.allHidden") : t("sessions.none"));
  // Without other machines, this computer's sessions need no heading of their own.
  if (!names.length) return { hidden, groups: [sessionList(home, act, placedOn(null), none)] };
  const own = group(home, act, HUB, t("machine.hub"), [], placedOn(null), none);
  const others = names.map((name) => {
    const machine = home.machines.find((m) => m.name === name);
    const empty = el("p", "machine-empty muted", t("machine.none"));
    const section = group(home, act, name, name, heading(machine), placedOn(name), empty);
    if (machine && !machine.reachable) section.classList.add("unreachable");
    return section;
  });
  return { hidden, groups: [own, ...others] };
}

/** One group: a heading that folds it away, and its sessions. */
function group(
  home: Home,
  act: Actions,
  key: string,
  title: string,
  state: HTMLElement[],
  placed: (Session | undefined)[],
  none: HTMLElement,
): HTMLElement {
  const folded = home.folded.has(key);
  const count = placed.filter((s) => s && !(s.id in home.hidden)).length;
  const top = button("", () => act.toggleGroup(key), "machine-top");
  top.setAttribute("aria-expanded", String(!folded));
  top.append(
    el("span", "fold", folded ? "▸" : "▾"),
    el("span", "machine-name", title),
    ...state,
    ...(folded ? [el("span", "machine-count muted", plural(count, "machine.count"))] : []),
  );
  const heading = el("h2", "machine-heading", top);
  heading.id = `machine-${key}`;
  const section = el("section", "machine", heading);
  section.dataset.machine = key;
  section.setAttribute("aria-labelledby", heading.id);
  if (!folded) section.append(count ? sessionList(home, act, placed, null) : none);
  return section;
}

const STATES: Record<NonNullable<Machine["state"]>, Key> = {
  online: "machine.state.online",
  slow: "machine.state.slow",
  offline: "machine.state.offline",
  agent_down: "machine.state.agentDown",
  not_approved: "machine.state.notApproved",
};

/** The reasons the bridge gives, in the page's own words; any other is shown as the bridge said it. */
const REASONS: Record<string, Key> = {
  "did not answer": "machine.error.noAnswer", // not shown
  "not approved": "machine.error.notApproved", // not shown
  "not the machine you approved": "machine.error.otherMachine", // not shown
  "other tools than approved": "machine.error.otherTools", // not shown
};

/** How another computer is doing: its state, why it does not answer, and when it last did. */
function heading(machine: Machine | undefined): HTMLElement[] {
  if (!machine) return [];
  const state = machine.state ?? (machine.reachable ? "online" : "offline");
  const known = machine.error ? REASONS[machine.error] : undefined;
  const reason = known ? t(known) : (machine.error ?? "");
  let words = t(STATES[state] ?? "machine.state.offline");
  if (reason && !machine.reachable) words = `${words}: ${reason}`;
  if (!machine.reachable && machine.last_seen)
    words = `${words} · ${t("machine.lastSeen", { when: ago(machine.last_seen) })}`;
  return [el("span", `machine-state ${state}`, words)];
}
