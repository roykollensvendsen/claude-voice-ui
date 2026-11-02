// Drawing the screens. Each function builds fresh elements from the state it is given.
import type { Active, BridgeInfo, Doctor, Pending, Pr, Turn } from "./bridge";
import { gitLine } from "./git";
import {
  cardState,
  LOOK,
  type Look,
  minutesInState,
  type Session,
  sortForCards,
  timeInState,
  timeInWords,
} from "./states";
import { resultText, stepText, type UpdateState } from "./update";
import { contextTone, planBars, type Usage, voiceLine, warningText } from "./usage";

export type Connection = "connecting" | "live" | "reconnecting";

export interface Home {
  sessions: Session[];
  active: Active | null;
  /** The session the voice is talking to right now, by name or id, while that is recent. */
  focus: string | null;
  connection: Connection;
  problem: string | null;
  doctor: Doctor | null;
  usage: Usage | null;
  bridge: BridgeInfo | null;
  update: UpdateState;
  /** Cards opened with their arrow. */
  expanded: Set<string>;
  /** Hidden sessions, each with its state when it was hidden, so a new wait brings it back. */
  hidden: Record<string, string>;
  /** Cards whose long question is shown in full. */
  more: Set<string>;
  hiddenOpen: boolean;
  /** The session just tapped, flashed for a moment as the tap's confirmation. */
  picked: string | null;
  view: View;
  legendOpen: boolean;
  /** The session whose page is open, or null for the cards. */
  open: Detail | null;
  /** Whether the owner has opened the list of what is missing. */
  doctorOpen: boolean;
}

export interface Detail {
  id: string;
  turns: Turn[];
  /** The last turn shown, so the next fetch asks only for what came after. */
  lastIndex: number | undefined;
  pending: Pending | null;
  prs: Pr[];
}

export type View = "grid" | "cards";

export interface Actions {
  pick(id: string): void;
  openPage(id: string): void;
  back(): void;
  signOut(): void;
  toggleDoctor(): void;
  toggleCard(id: string): void;
  showMore(id: string): void;
  hide(id: string): void;
  unhide(id: string): void;
  toggleHidden(): void;
  setView(view: View): void;
  toggleLegend(): void;
  update: UpdateActions;
}

const CONNECTION: Record<Connection, string> = {
  connecting: "Connecting…",
  live: "Live",
  reconnecting: "Reconnecting…",
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

export function matches(s: Session, key: string | null | undefined): boolean {
  // RULE: a focus event matches a session by id as well as by name
  return key != null && (key === s.id || key === s.name);
}

export function signInScreen(error: string | null, onSubmit: (secret: string) => void): HTMLElement {
  const input = el("input");
  input.type = "password";
  input.name = "secret";
  input.autocomplete = "current-password";
  input.placeholder = "Login secret";
  input.required = true;
  const button = el("button", undefined, "Sign in");
  button.type = "submit";
  const form = el("form", "signin", input, button);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    onSubmit(input.value);
  });
  return el(
    "section",
    "signin-screen",
    el("h1", undefined, "Claude voice"),
    el("p", "muted", "Type the bridge's login secret once. This phone is then remembered for a month."),
    ...(error ? [el("p", "error", error)] : []),
    form,
  );
}

function focusBar(home: Home): HTMLElement {
  const focused = home.focus ? (home.sessions.find((s) => matches(s, home.focus))?.name ?? home.focus) : null;
  if (focused) return el("div", "focus-bar talking", el("b", undefined, focused), " · talking now");
  if (home.active) {
    const who = home.active.set_by === "page" ? "chosen here" : `chosen by ${home.active.set_by}`;
    return el("div", "focus-bar", "Voice talks to ", el("b", undefined, home.active.name), ` · ${who}`);
  }
  return el("div", "focus-bar", "Tap a session to choose who the voice talks to.");
}

function stateLine(s: Session): HTMLElement {
  const look = LOOK[cardState(s)];
  // The tone is set here too, so the line keeps its colour on a session's own page.
  return el(
    "div",
    `state tone-${look.tone}`,
    el("span", "icon", look.icon),
    ` ${look.label}`,
    el("span", "since", ` · ${timeInState(minutesInState(s, Date.now()))}`),
    ...(s.context
      ? [
          el(
            "span",
            `context ${contextTone(s.context.used_percentage)}`,
            `context ${Math.round(s.context.used_percentage)}%`,
          ),
        ]
      : []),
  );
}

function gitRow(s: Session): HTMLElement[] {
  if (!s.git) return [];
  const g = gitLine(s.git);
  return [
    el(
      "div",
      "git",
      el("span", "branch", `⎇ ${g.branch}`),
      el("span", "commit", g.commit),
      ...g.marks.map((m) => el("span", `mark ${m.kind}`, m.text)),
    ),
  ];
}

/** A question longer than this is cut short in an opened card, behind "Show more". */
const QUESTION_CHARS = 200;

function card(s: Session, home: Home, act: Actions): HTMLElement {
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
  arrow.setAttribute("aria-label", open ? "Show less" : "Show more of this card");
  box.append(
    el(
      "div",
      "card-top",
      el("span", "name", s.name || s.id),
      ...(focused ? [el("span", "chip", "Talking now")] : []),
      arrow,
    ),
    stateLine(s),
  );
  // The bridge's one line repeats the question while it waits, so the question is the line then.
  const line = s.question?.text || s.doing || (s.moved_to?.name ? `Continues in ${s.moved_to.name}` : "");
  if (!open) {
    if (line) box.append(el("div", "line", line));
  } else {
    box.append(el("div", "meta", [s.project, s.kind].filter(Boolean).join(" · ")));
    if (s.doing && !s.question) box.append(el("div", "line doing", s.doing));
    box.append(...gitRow(s));
    if (s.question) {
      const full = s.question.text;
      const cut = full.length > QUESTION_CHARS && !home.more.has(s.id);
      const options = el("ul", "options", ...(s.question.options ?? []).map((o) => el("li", undefined, o)));
      box.append(
        el(
          "div",
          "question",
          el("div", "question-text line", cut ? `${full.slice(0, QUESTION_CHARS).trimEnd()}…` : full),
          ...(cut ? [button("Show more", () => act.showMore(s.id), "more")] : []),
          options,
        ),
      );
    }
    if (s.moved_to?.name) box.append(el("div", "doing", `Continues in ${s.moved_to.name}`));
    box.append(
      el(
        "div",
        "card-actions",
        button("Hide", () => act.hide(s.id), "hide"),
      ),
    );
  }
  box.addEventListener("click", (e) => {
    // A tap on the arrow or a button inside the card is that button's, not a choice of session.
    if ((e.target as Element).closest("button")) return;
    act.pick(s.id);
  });
  box.addEventListener("keydown", (e) => {
    if (e.target === box && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      act.pick(s.id);
    }
  });
  return box;
}

const WAITING = new Set(["answer", "approval", "input"]);
/** How long a finger rests on a tile before its page opens instead of it being chosen. */
const HOLD_MS = 500;

/** A small square for the grid: the name, cut to fit, and the state as a colour and an icon. */
function tile(s: Session, home: Home, act: Actions): HTMLElement {
  const state = cardState(s);
  const look = LOOK[state];
  // A div, not a button, because the corner arrow inside it is a button.
  const t = el("div", `tile tone-${look.tone}`);
  t.setAttribute("role", "button");
  t.tabIndex = 0;
  t.dataset.session = s.id;
  t.dataset.state = state;
  t.title = `${s.name || s.id}: ${look.label}`;
  let held = false;
  let press: ReturnType<typeof setTimeout> | undefined;
  t.addEventListener("pointerdown", (e) => {
    if ((e.target as Element).closest("button")) return;
    held = false;
    press = setTimeout(() => {
      held = true;
      act.openPage(s.id);
    }, HOLD_MS);
  });
  for (const end of ["pointerup", "pointerleave", "pointercancel"]) {
    t.addEventListener(end, () => clearTimeout(press));
  }
  // The phone's own long-press menu would cover the page opening.
  t.addEventListener("contextmenu", (e) => e.preventDefault());
  t.addEventListener("click", (e) => {
    if ((e.target as Element).closest("button")) return;
    // RULE: a long press opens the session's page without choosing it
    if (held) {
      held = false;
      return;
    }
    // Shown at once, before the page catches up with the choice.
    t.classList.add("picked");
    act.pick(s.id);
  });
  t.addEventListener("keydown", (e) => {
    if (e.target === t && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      act.pick(s.id);
    }
  });
  if (WAITING.has(state)) t.classList.add("waiting");
  if (home.active?.id === s.id) t.classList.add("active");
  if (home.picked === s.id) t.classList.add("picked");
  if (matches(s, home.focus)) t.classList.add("focus");
  const details = button("›", () => act.openPage(s.id), "open-detail");
  details.setAttribute("aria-label", `Open ${s.name || s.id}`);
  t.append(
    el("span", "icon", look.icon),
    el("span", "name", s.name || s.id),
    ...(home.active?.id === s.id ? [el("span", "pin")] : []),
    details,
  );
  return t;
}

function viewSwitch(home: Home, act: Actions): HTMLElement {
  const choice = (label: string, view: View) => {
    const b = button(label, () => act.setView(view));
    b.setAttribute("aria-pressed", String(home.view === view));
    return b;
  };
  const help = button("?", act.toggleLegend, "legend-toggle");
  help.setAttribute("aria-label", "What the colours mean");
  help.setAttribute("aria-expanded", String(home.legendOpen));
  return el("div", "view-switch", help, choice("Grid", "grid"), choice("Cards", "cards"));
}

/** What each colour, icon and ring means, from the same table the tiles are drawn from. */
function legend(): HTMLElement {
  const states = (Object.values(LOOK) as Look[]).map((look) =>
    el("li", `tone-${look.tone}`, el("span", "icon", look.icon), `${look.label}: ${look.meaning}`),
  );
  return el(
    "ul",
    "legend",
    ...states,
    el(
      "li",
      "ring active",
      "White dot and ring: the session the voice talks to, chosen by a tap or by voice",
    ),
    el(
      "li",
      "ring focus",
      "Blue ring: the voice is talking to it right now; with a white dot, it is also the chosen one",
    ),
  );
}

/** Hidden sessions that are running, as a count that opens into a list with a way back for each. */
function hiddenBlock(hidden: Session[], home: Home, act: Actions): HTMLElement[] {
  if (!hidden.length) return [];
  const count = hidden.length === 1 ? "1 hidden session" : `${hidden.length} hidden sessions`;
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
              button("Show again", () => act.unhide(s.id)),
            ),
          ),
        ),
      ]
    : [];
  return [el("section", "hidden-sessions", toggle, ...list)];
}

function usagePanel(home: Home): HTMLElement[] {
  const u = home.usage;
  if (!u) return [];
  const bars = planBars(u, Date.now()).map((b) => {
    const fill = el("div", "fill");
    fill.style.width = `${b.percent}%`;
    return el(
      "div",
      `bar${b.stale ? " stale" : ""}`,
      el(
        "div",
        "bar-head",
        el("span", undefined, b.title),
        el("span", undefined, `${b.percent}% · ${b.note}`),
      ),
      el("div", "track", fill),
    );
  });
  const warning = warningText(u);
  return [
    el(
      "section",
      "usage",
      ...(warning ? [el("div", `usage-warning ${warning.severity}`, warning.text)] : []),
      ...(bars.length ? bars : [el("p", "muted", "No plan figures yet.")]),
      ...(u.plan?.label ? [el("p", "label", u.plan.label)] : []),
      el(
        "p",
        "voice",
        el("span", undefined, `Voice today: ${voiceLine(u)}`),
        el("span", "label", ` (${u.voice.label})`),
      ),
    ),
  ];
}

export interface UpdateActions {
  ask(): void;
  cancel(): void;
  confirm(): void;
}

function button(label: string, onClick: () => void, className?: string): HTMLButtonElement {
  const b = el("button", className, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

function updatePanel(home: Home, act: UpdateActions): HTMLElement[] {
  const u = home.update;
  const behind = home.bridge?.git?.tracking?.behind ?? 0;
  if (u.phase === "idle" && behind <= 0) return [];
  const parts: (Node | string)[] = [];
  if (u.phase === "idle") {
    parts.push(
      el(
        "span",
        undefined,
        `claude-voice: ${behind === 1 ? "1 new commit" : `${behind} new commits`} to update to`,
      ),
      button("Update", act.ask),
    );
  } else if (u.phase === "confirm") {
    parts.push(
      el(
        "p",
        undefined,
        "Update claude-voice now? The voice drops for a few seconds while the bridge restarts.",
      ),
      button("Update now", act.confirm, "primary"),
      button("Cancel", act.cancel),
    );
  } else {
    if (u.message) parts.push(el("p", undefined, u.message));
    if (u.note) parts.push(el("p", "muted", u.note));
    parts.push(
      el("ol", "steps", ...u.steps.map((st) => el("li", `step${st.ok ? "" : " failed"}`, stepText(st)))),
    );
    if (u.phase === "running" && u.restarting)
      parts.push(el("p", "muted", "Restarting… the page reconnects by itself."));
    if (u.phase === "done") parts.push(el("p", `result ${u.result ?? ""}`, resultText(u)));
  }
  return [el("section", "bridge-update", ...parts)];
}

function missing(home: Home, onToggle: () => void): HTMLElement[] {
  const failing = home.doctor?.checks.filter((c) => !c.ok) ?? [];
  if (!failing.length) return [];
  // RULE: a missing required thing shows a red banner
  const severity = failing.some((c) => c.required) ? "required" : "optional";
  const count = failing.length === 1 ? "1 thing missing" : `${failing.length} things missing`;
  const banner = el(
    "button",
    `doctor-banner ${severity}`,
    `${count}: ${failing.map((c) => c.title).join(", ")}`,
  );
  banner.type = "button";
  banner.setAttribute("aria-expanded", String(home.doctorOpen));
  banner.addEventListener("click", onToggle);
  if (!home.doctorOpen) return [banner];
  const items = failing.map((c) => {
    const item = el(
      "li",
      c.required ? "required" : "optional",
      el("b", undefined, c.title),
      ...(c.affects ? [el("div", "affects", `Without it: ${c.affects}`)] : []),
      ...(c.detail ? [el("div", "detail", c.detail)] : []),
    );
    if (c.fix) item.append(el("pre", "fix", el("code", undefined, c.fix)));
    if (c.fix_url) {
      const link = el("a", undefined, "How to fix it");
      link.href = c.fix_url;
      link.target = "_blank";
      link.rel = "noopener";
      item.append(link);
    }
    return item;
  });
  return [banner, el("ul", "doctor-panel", ...items)];
}

function pendingBlock(p: Pending | null): HTMLElement[] {
  if (!p || (!p.question && !p.approvals.length)) return [];
  const parts: HTMLElement[] = [];
  if (p.question) {
    const options = el("ul", "options", ...(p.question.options ?? []).map((o) => el("li", undefined, o)));
    parts.push(
      el(
        "div",
        "question",
        el("b", undefined, "Waiting for your choice"),
        el("div", undefined, p.question.text),
        options,
      ),
    );
  }
  for (const a of p.approvals) {
    parts.push(el("div", "question", `Approval ${a.number}: ${a.tool} ${a.summary}`.trim()));
  }
  // RULE: an approval it waits on is shown, to be answered by voice or at the screen
  if (p.approvals.length) parts.push(el("p", "muted", "Answer by voice or at the screen."));
  return [el("section", "pending", ...parts)];
}

function turn(t: Turn): HTMLElement {
  return el(
    "div",
    `turn ${t.role}`,
    el("div", "who", t.role === "user" ? "You" : "Claude"),
    el("div", "text", t.text),
    ...(t.cut ? [el("div", "cut", `cut short; ${t.length} characters in all`)] : []),
  );
}

function detailScreen(home: Home, d: Detail, act: Actions): HTMLElement {
  const s = home.sessions.find((x) => x.id === d.id);
  const back = button("‹ Sessions", act.back, "back");
  const prs = d.prs.map((pr) => {
    const link = el("a", undefined, `#${pr.number} ${pr.title}${pr.draft ? " (draft)" : ""}`);
    link.href = pr.url;
    link.target = "_blank";
    link.rel = "noopener";
    return el("li", undefined, link);
  });
  return el(
    "section",
    "detail",
    back,
    el("h2", undefined, s?.name ?? d.id),
    ...(s
      ? [
          el("div", "meta", [s.project, s.kind].filter(Boolean).join(" · ")),
          el("p", "words", `${LOOK[cardState(s)].label} – ${timeInWords(minutesInState(s, Date.now()))}`),
          stateLine(s),
          ...gitRow(s),
        ]
      : [el("p", "notice", "This session is no longer running.")]),
    ...pendingBlock(d.pending),
    el("div", "turns", ...d.turns.map(turn)),
    ...(prs.length ? [el("h3", undefined, "Open pull requests"), el("ul", "prs", ...prs)] : []),
  );
}

export function homeScreen(home: Home, act: Actions): HTMLElement {
  const signOut = button("Sign out", act.signOut, "signout");
  const connection = el("span", `connection ${home.connection}`, CONNECTION[home.connection]);
  const sorted = sortForCards(home.sessions);
  const sessions = sorted.filter((s) => !(s.id in home.hidden));
  const hidden = sorted.filter((s) => s.id in home.hidden);
  const none = el(
    "p",
    "muted",
    hidden.length ? "Every running session is hidden." : "No sessions are running right now.",
  );
  const items =
    home.view === "grid" ? sessions.map((s) => tile(s, home, act)) : sessions.map((s) => card(s, home, act));
  const list = el("div", home.view, ...(items.length ? items : [none]));
  const top = [el("header", "top", el("h1", undefined, "Claude voice"), connection, signOut), focusBar(home)];
  const problem = home.problem ? [el("p", "notice", home.problem)] : [];
  if (home.open) return el("section", "home", ...top, ...problem, detailScreen(home, home.open, act));
  return el(
    "section",
    "home",
    ...top,
    ...missing(home, act.toggleDoctor),
    ...updatePanel(home, act.update),
    ...usagePanel(home),
    ...problem,
    viewSwitch(home, act),
    ...(home.legendOpen ? [legend()] : []),
    list,
    ...hiddenBlock(hidden, home, act),
  );
}
