// Drawing the screens. Each function builds fresh elements from the state it is given.
import type { Active, Doctor } from "./bridge";
import { gitLine } from "./git";
import { cardState, LOOK, minutesInState, type Session, sortForCards, timeInState } from "./states";

export type Connection = "connecting" | "live" | "reconnecting";

export interface Home {
  sessions: Session[];
  active: Active | null;
  /** The session the voice is talking to right now, by name or id, while that is recent. */
  focus: string | null;
  connection: Connection;
  problem: string | null;
  doctor: Doctor | null;
  /** Whether the owner has opened the list of what is missing. */
  doctorOpen: boolean;
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

function card(s: Session, home: Home, onPick: (id: string) => void): HTMLElement {
  const state = cardState(s);
  const look = LOOK[state];
  const focused = matches(s, home.focus);
  const button = el("button", `card tone-${look.tone}`);
  button.type = "button";
  button.dataset.session = s.id;
  button.dataset.state = state;
  if (home.active?.id === s.id) button.classList.add("active");
  if (focused) button.classList.add("focus");
  button.append(
    el(
      "div",
      "card-top",
      el("span", "name", s.name || s.id),
      ...(focused ? [el("span", "chip", "Talking now")] : []),
    ),
    el("div", "meta", [s.project, s.kind].filter(Boolean).join(" · ")),
    el(
      "div",
      "state",
      el("span", "icon", look.icon),
      ` ${look.label}`,
      el("span", "since", ` · ${timeInState(minutesInState(s, Date.now()))}`),
    ),
  );
  // The bridge's one line repeats the question while it waits, and the question is shown in full below.
  if (s.doing && !s.question) button.append(el("div", "doing", s.doing));
  if (s.git) {
    const g = gitLine(s.git);
    button.append(
      el(
        "div",
        "git",
        el("span", "branch", `⎇ ${g.branch}`),
        el("span", "commit", g.commit),
        ...g.marks.map((m) => el("span", `mark ${m.kind}`, m.text)),
      ),
    );
  }
  if (s.question) {
    const options = el("ul", "options", ...(s.question.options ?? []).map((o) => el("li", undefined, o)));
    button.append(el("div", "question", el("div", undefined, s.question.text), options));
  }
  if (s.moved_to?.name) button.append(el("div", "doing", `Continues in ${s.moved_to.name}`));
  button.addEventListener("click", () => onPick(s.id));
  return button;
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

export function homeScreen(
  home: Home,
  onPick: (id: string) => void,
  onSignOut: () => void,
  onToggleDoctor: () => void = () => {},
): HTMLElement {
  const signOut = el("button", "signout", "Sign out");
  signOut.type = "button";
  signOut.addEventListener("click", onSignOut);
  const connection = el("span", `connection ${home.connection}`, CONNECTION[home.connection]);
  const sessions = sortForCards(home.sessions);
  const cards = el(
    "div",
    "cards",
    ...(sessions.length
      ? sessions.map((s) => card(s, home, onPick))
      : [el("p", "muted", "No sessions are running right now.")]),
  );
  return el(
    "section",
    "home",
    el("header", "top", el("h1", undefined, "Claude voice"), connection, signOut),
    focusBar(home),
    ...missing(home, onToggleDoctor),
    ...(home.problem ? [el("p", "notice", home.problem)] : []),
    cards,
  );
}
