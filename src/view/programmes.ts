// The sessions in one section per programme, each folding on its own, with Other last.
import { type Key, plural, t } from "../i18n";
import { cardState, type Session } from "../states";
import { button, byProgramme, el, knowsProgrammes } from "../view/dom";
import { groups, sessionList } from "../view/machines";
import type { Actions, GroupBy, Home } from "../view/types";

/** The section of the sessions outside any programme. */
export const OTHER = "other";

const WAITS = new Set(["answer", "approval", "input"]);
/** What opens a section by itself: something waits on the owner, or failed. */
const ALARMS = new Set([...WAITS, "stopped"]);

/** Each programme's sessions in the order they were placed, by the bridge's order, then Other. */
export function sectionSessions(home: Home): Map<string, Session[]> {
  const order = new Map(home.programmes.map((p) => [p.id, p.order]));
  const byId = new Map(home.sessions.map((s) => [s.id, s]));
  const placed = home.placed.flatMap((id) => byId.get(id) ?? []);
  const keys = [
    ...new Set([...home.programmes.map((p) => p.id), ...placed.map((s) => s.programme?.id ?? OTHER)]),
  ];
  const rank = (key: string) => (key === OTHER ? Infinity : (order.get(key) ?? Number.MAX_VALUE));
  keys.sort((a, b) => rank(a) - rank(b));
  const sections = new Map(
    keys.map((key) => [key, placed.filter((s) => (s.programme?.id ?? OTHER) === key)]),
  );
  for (const [key, list] of sections) if (!list.length) sections.delete(key);
  return sections;
}

/** The ids in a section that wait or failed now. */
export const alarmsIn = (list: Session[]) => list.filter((s) => ALARMS.has(cardState(s))).map((s) => s.id);

/** A section starts open when something in it waits, works or failed. */
export const busy = (list: Session[]) =>
  list.some((s) => cardState(s) === "working" || ALARMS.has(cardState(s)));

/** "2 waiting · 3 working", and what is hidden, for a section's heading. */
function counts(list: Session[], hidden: number): string {
  const states = list.map(cardState);
  const parts: [number, Parameters<typeof plural>[1]][] = [
    [states.filter((s) => WAITS.has(s)).length, "programme.waiting"],
    [states.filter((s) => s === "working").length, "programme.working"],
    [states.filter((s) => s === "stopped").length, "programme.failed"],
    [hidden, "programme.hidden"],
  ];
  return parts.flatMap(([n, key]) => (n ? [plural(n, key)] : [])).join(" · ");
}

/** The programme-wide roles first, the manager before them all; then each part with more than one session. */
function inside(home: Home, act: Actions, list: Session[]): HTMLElement[] {
  const wide = list.filter((s) => s.programme_wide);
  wide.sort((a, b) => Number(b.role?.id === "manager") - Number(a.role?.id === "manager"));
  const rest = list.filter((s) => !s.programme_wide);
  const parts = [...new Set(rest.flatMap((s) => (s.component ? [s.component.id] : [])))];
  const grouped = parts.filter((id) => rest.filter((s) => s.component?.id === id).length > 1);
  const lone = rest.filter((s) => !s.component || !grouped.includes(s.component.id));
  return [
    ...(wide.length ? [sessionList(home, act, wide, null)] : []),
    ...grouped.flatMap((id) => {
      const members = rest.filter((s) => s.component?.id === id);
      return [
        el("h3", "component", members[0]?.component?.name ?? id),
        sessionList(home, act, members, null),
      ];
    }),
    ...(lone.length ? [sessionList(home, act, lone, null)] : []),
  ];
}

/** One section a programme: a heading that folds it, with its counts, then its sessions. */
function section(home: Home, act: Actions, key: string, list: Session[]): HTMLElement {
  const shown = list.filter((s) => !(s.id in home.hidden));
  const open = home.sections[key]?.open ?? busy(shown);
  const name =
    key === OTHER
      ? t("programme.other")
      : (home.programmes.find((p) => p.id === key)?.name ?? list[0]?.programme?.name ?? key);
  const top = button("", () => act.toggleSection(key), "programme-top");
  top.setAttribute("aria-expanded", String(open));
  top.append(
    el("span", "fold", open ? "▾" : "▸"),
    el("span", "programme-name", name),
    el("span", "programme-counts muted", counts(shown, list.length - shown.length)),
  );
  const box = el("section", "programme", el("h2", "programme-heading", top));
  box.dataset.programme = key;
  if (!open) return box;
  if (key !== OTHER) box.append(button(t("programme.org"), () => act.openOrg(key), "org-open"));
  box.append(...(shown.length ? inside(home, act, shown) : [el("p", "muted", t("sessions.allHidden"))]));
  return box;
}

/** The sessions by programme, or by the computer they run on as before. */
export function sessionGroups(home: Home, act: Actions) {
  return byProgramme(home) ? programmeGroups(home, act) : groups(home, act);
}

function programmeGroups(home: Home, act: Actions) {
  const hidden = home.sessions.filter((s) => s.id in home.hidden);
  const groups = [...sectionSessions(home)].map(([key, list]) => section(home, act, key, list));
  return { hidden, groups };
}

/** Group by programme or by computer; shown only where the bridge knows programmes. */
export function groupSwitch(home: Home, act: Actions): HTMLElement[] {
  if (!knowsProgrammes(home)) return [];
  const choice = (key: Key, by: GroupBy) => {
    const b = button(t(key), () => act.setGroupBy(by));
    b.setAttribute("aria-pressed", String(home.groupBy === by));
    return b;
  };
  return [
    el("div", "group-switch", choice("group.programme", "programme"), choice("group.machine", "machine")),
  ];
}
