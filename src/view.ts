// Drawing the screens. Each function builds fresh elements from the state it is given.
import type { Active, BridgeInfo, Doctor, Pending, Pr, Turn } from "./bridge";
import { gitLine } from "./git";
import { cardState, LOOK, minutesInState, type Session, sortForCards, timeInState } from "./states";
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

export interface Actions {
  pick(id: string): void;
  back(): void;
  signOut(): void;
  toggleDoctor(): void;
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
    stateLine(s),
  );
  // The bridge's one line repeats the question while it waits, and the question is shown in full below.
  if (s.doing && !s.question) button.append(el("div", "doing", s.doing));
  button.append(...gitRow(s));
  if (s.question) {
    const options = el("ul", "options", ...(s.question.options ?? []).map((o) => el("li", undefined, o)));
    button.append(el("div", "question", el("div", undefined, s.question.text), options));
  }
  if (s.moved_to?.name) button.append(el("div", "doing", `Continues in ${s.moved_to.name}`));
  button.addEventListener("click", () => onPick(s.id));
  return button;
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
      ? [el("div", "meta", [s.project, s.kind].filter(Boolean).join(" · ")), stateLine(s), ...gitRow(s)]
      : [el("p", "notice", "This session is no longer running.")]),
    ...pendingBlock(d.pending),
    el("div", "turns", ...d.turns.map(turn)),
    ...(prs.length ? [el("h3", undefined, "Open pull requests"), el("ul", "prs", ...prs)] : []),
  );
}

export function homeScreen(home: Home, act: Actions): HTMLElement {
  const signOut = button("Sign out", act.signOut, "signout");
  const connection = el("span", `connection ${home.connection}`, CONNECTION[home.connection]);
  const sessions = sortForCards(home.sessions);
  const cards = el(
    "div",
    "cards",
    ...(sessions.length
      ? sessions.map((s) => card(s, home, act.pick))
      : [el("p", "muted", "No sessions are running right now.")]),
  );
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
    cards,
  );
}
