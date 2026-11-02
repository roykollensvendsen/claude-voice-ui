// Drawing the screens. Each function builds fresh elements from the state it is given.
import type { Active, BridgeInfo, Doctor, Pending, Pr, Turn } from "./bridge";
import { gitLine } from "./git";
import { type Key, type Language, NAMES, plural, t } from "./i18n";
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
import { contextTone, planBars, tightest, type Usage, usageLevel, voiceLine, warningText } from "./usage";

export type Connection = "connecting" | "live" | "reconnecting";

export interface Home {
  sessions: Session[];
  active: Active | null;
  /** The session the voice is talking to right now, by name or id, while that is recent. */
  focus: string | null;
  /** Sessions the voice only looked at lately, by id or name as the bridge gave them. */
  peeks: string[];
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
  usageOpen: boolean;
  /** A newer build of the page has been deployed. */
  newVersion: boolean;
  /** The list behind What's new, once tapped open; null while closed. */
  whatsNew: { feat: string[]; fix: string[] } | null;
  theme: Theme;
  menuOpen: boolean;
  /** "system" follows the phone's own language. */
  language: Language | "system";
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
/** "system" follows the phone's own setting. */
export type Theme = "system" | "light" | "dark";

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
  toggleUsage(): void;
  reload(): void;
  toggleWhatsNew(): void;
  toggleMenu(): void;
  setTheme(theme: Theme): void;
  setLanguage(language: Language | "system"): void;
  update: UpdateActions;
}

const CONNECTION: Record<Connection, Key> = {
  connecting: "connection.connecting",
  live: "connection.live",
  reconnecting: "connection.reconnecting",
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

/** A speech bubble, marking the session the voice has just written to. */
const mic = () => el("span", "mic", "💬");
/** A fainter mark for a session the voice only looked at, without writing to it. */
const peekMark = (s: Session, home: Home) =>
  !matches(s, home.focus) && home.peeks.some((key) => matches(s, key)) ? [el("span", "peek", "👁")] : [];

/** A speech bubble at the top that leads to the session the voice is talking to, when there is one. */
function micJump(home: Home): HTMLElement[] {
  const s = home.focus ? home.sessions.find((x) => matches(x, home.focus)) : undefined;
  if (!s) return [];
  const jump = button(
    "💬",
    () => {
      document.querySelector(`[data-session="${CSS.escape(s.id)}"]`)?.scrollIntoView({ block: "center" });
    },
    "mic-jump",
  );
  jump.dataset.target = s.id;
  jump.setAttribute("aria-label", t("focus.jump", { name: s.name || s.id }));
  return [jump];
}

/** A link into the Claude app for a session connected to Remote Control; Android hands it to the app. */
function claudeLink(s: Session, label: string, className = "open-claude"): HTMLElement[] {
  if (!s.app_url) return [];
  const a = el("a", className, label);
  a.href = s.app_url;
  a.target = "_blank";
  a.rel = "noopener";
  return [a];
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
            t("session.context", { percent: Math.round(s.context.used_percentage) }),
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
  arrow.setAttribute("aria-label", open ? t("session.showLess") : t("session.showMoreCard"));
  box.append(
    el(
      "div",
      "card-top",
      el("span", "name", s.name || s.id),
      ...(focused ? [mic()] : []),
      ...peekMark(s, home),
      arrow,
    ),
    stateLine(s),
  );
  // The bridge's one line repeats the question while it waits, so the question is the line then.
  const line =
    s.question?.text ||
    s.doing ||
    (s.moved_to?.name ? t("session.continuesIn", { name: s.moved_to.name }) : "");
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
          ...(cut ? [button(t("session.showMore"), () => act.showMore(s.id), "more")] : []),
          options,
        ),
      );
    }
    if (s.moved_to?.name) box.append(el("div", "doing", t("session.continuesIn", { name: s.moved_to.name })));
    box.append(
      el(
        "div",
        "card-actions",
        button(t("session.hide"), () => act.hide(s.id), "hide"),
        button(t("session.openPage"), () => act.openPage(s.id), "open-detail"),
        ...claudeLink(s, t("session.openInClaude")),
      ),
    );
  }
  box.addEventListener("click", (e) => {
    // A tap on the arrow, a button or a link inside the card is theirs, not a choice of session.
    if ((e.target as Element).closest("button, a")) return;
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
  const box = el("div", `tile tone-${look.tone}`);
  box.setAttribute("role", "button");
  box.tabIndex = 0;
  box.dataset.session = s.id;
  box.dataset.state = state;
  box.title = t("session.tileTitle", { name: s.name || s.id, state: look.label });
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
    // Shown at once, before the page catches up with the choice.
    box.classList.add("picked");
    act.pick(s.id);
  });
  box.addEventListener("keydown", (e) => {
    if (e.target === box && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      act.pick(s.id);
    }
  });
  if (WAITING.has(state)) box.classList.add("waiting");
  if (home.active?.id === s.id) box.classList.add("active");
  if (home.picked === s.id) box.classList.add("picked");
  if (matches(s, home.focus)) box.classList.add("focus");
  const details = button("›", () => act.openPage(s.id), "open-detail");
  details.setAttribute("aria-label", t("session.openNamed", { name: s.name || s.id }));
  box.append(
    el("span", "icon", look.icon),
    ...(matches(s, home.focus) ? [mic()] : []),
    ...peekMark(s, home),
    el("span", "name", s.name || s.id),
    ...(home.active?.id === s.id ? [el("span", "pin")] : []),
    ...claudeLink(s, "↗").map((a) => {
      a.setAttribute("aria-label", t("session.openNamedInClaude", { name: s.name || s.id }));
      return a;
    }),
    details,
  );
  return box;
}

/** The top bar's menu: the theme, and signing out. */
function menu(home: Home, act: Actions): HTMLElement[] {
  if (!home.menuOpen) return [];
  const choice = (label: string, theme: Theme) => {
    const b = button(label, () => act.setTheme(theme));
    b.setAttribute("aria-pressed", String(home.theme === theme));
    return b;
  };
  const speak = (label: string, language: Language | "system") => {
    const b = button(label, () => act.setLanguage(language));
    b.setAttribute("aria-pressed", String(home.language === language));
    return b;
  };
  return [
    el(
      "div",
      "menu",
      el(
        "div",
        "theme",
        choice(t("menu.themeSystem"), "system"),
        choice(t("menu.light"), "light"),
        choice(t("menu.dark"), "dark"),
      ),
      el(
        "div",
        "language",
        speak(t("menu.languageSystem"), "system"),
        ...(Object.keys(NAMES) as Language[]).map((l) => speak(NAMES[l], l)),
      ),
      button(t("menu.signOut"), act.signOut, "signout"),
    ),
  ];
}

/** The notice of a newer build, with what it brings behind a tap. Commit subjects are shown as written. */
function newVersion(home: Home, act: Actions): HTMLElement[] {
  if (!home.newVersion) return [];
  const toggle = button(t("page.whatsNew"), act.toggleWhatsNew, "whats-new-toggle");
  toggle.setAttribute("aria-expanded", String(Boolean(home.whatsNew)));
  const w = home.whatsNew;
  const group = (title: string, items: string[]) =>
    items.length
      ? [el("h3", undefined, title), el("ul", undefined, ...items.map((x) => el("li", undefined, x)))]
      : [];
  const list = w
    ? [
        el(
          "div",
          "whats-new",
          ...group(t("page.new"), w.feat),
          ...group(t("page.fixed"), w.fix),
          ...(w.feat.length || w.fix.length ? [] : [el("p", "muted", t("page.noChanges"))]),
        ),
      ]
    : [];
  return [
    el("div", "new-version-row", button(t("page.newVersion"), act.reload, "new-version"), toggle),
    ...list,
  ];
}

function viewSwitch(home: Home, act: Actions): HTMLElement {
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
function legend(): HTMLElement {
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
  );
}

/** Hidden sessions that are running, as a count that opens into a list with a way back for each. */
function hiddenBlock(hidden: Session[], home: Home, act: Actions): HTMLElement[] {
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

/** The plan's tightest limit as one percentage in the top bar; a tap opens the bars below it. */
function usageButton(home: Home, act: Actions): HTMLElement[] {
  const u = home.usage;
  if (!u) return [];
  const percent = tightest(u);
  const level = usageLevel(percent ?? 0, u.warning?.status);
  const b = button(percent === null ? "–%" : `${percent}%`, act.toggleUsage, `usage-button level-${level}`);
  b.setAttribute("aria-expanded", String(home.usageOpen));
  b.setAttribute("aria-label", t("usage.label"));
  return [b];
}

function usagePanel(home: Home): HTMLElement[] {
  const u = home.usage;
  if (!u || !home.usageOpen) return [];
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
      ...(bars.length ? bars : [el("p", "muted", t("usage.noFigures"))]),
      ...(u.plan?.label ? [el("p", "label", u.plan.label)] : []),
      el(
        "p",
        "voice",
        el("span", undefined, t("usage.voiceToday", { line: voiceLine(u) })),
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
    parts.push(el("span", undefined, plural(behind, "update.behind")), button(t("update.button"), act.ask));
  } else if (u.phase === "confirm") {
    parts.push(
      el("p", undefined, t("update.confirm")),
      button(t("update.now"), act.confirm, "primary"),
      button(t("update.cancel"), act.cancel),
    );
  } else {
    if (u.message) parts.push(el("p", undefined, u.message));
    if (u.note) parts.push(el("p", "muted", u.note));
    parts.push(
      el("ol", "steps", ...u.steps.map((st) => el("li", `step${st.ok ? "" : " failed"}`, stepText(st)))),
    );
    if (u.phase === "running" && u.restarting) parts.push(el("p", "muted", t("update.restarting")));
    if (u.phase === "done") parts.push(el("p", `result ${u.result ?? ""}`, resultText(u)));
  }
  return [el("section", "bridge-update", ...parts)];
}

function missing(home: Home, onToggle: () => void): HTMLElement[] {
  const failing = home.doctor?.checks.filter((c) => !c.ok) ?? [];
  if (!failing.length) return [];
  // RULE: a missing required thing shows a red banner
  const severity = failing.some((c) => c.required) ? "required" : "optional";
  const count = plural(failing.length, "doctor.missing");
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
      ...(c.affects ? [el("div", "affects", t("doctor.without", { affects: c.affects }))] : []),
      ...(c.detail ? [el("div", "detail", c.detail)] : []),
    );
    if (c.fix) item.append(el("pre", "fix", el("code", undefined, c.fix)));
    if (c.fix_url) {
      const link = el("a", undefined, t("doctor.howToFix"));
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
        el("b", undefined, t("pending.yourChoice")),
        el("div", undefined, p.question.text),
        options,
      ),
    );
  }
  for (const a of p.approvals) {
    parts.push(
      el(
        "div",
        "question",
        t("pending.approval", { number: a.number, tool: a.tool, summary: a.summary }).trim(),
      ),
    );
  }
  // RULE: an approval it waits on is shown, to be answered by voice or at the screen
  if (p.approvals.length) parts.push(el("p", "muted", t("pending.answerElsewhere")));
  return [el("section", "pending", ...parts)];
}

function turn(said: Turn): HTMLElement {
  return el(
    "div",
    `turn ${said.role}`,
    el("div", "who", said.role === "user" ? t("turn.you") : t("turn.claude")),
    el("div", "text", said.text),
    ...(said.cut ? [el("div", "cut", t("turn.cut", { count: said.length }))] : []),
  );
}

function detailScreen(home: Home, d: Detail, act: Actions): HTMLElement {
  const s = home.sessions.find((x) => x.id === d.id);
  const back = button(t("detail.back"), act.back, "back");
  const prs = d.prs.map((pr) => {
    const link = el("a", undefined, `#${pr.number} ${pr.title}${pr.draft ? t("detail.draft") : ""}`);
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
          el(
            "p",
            "words",
            t("session.stateFor", {
              state: LOOK[cardState(s)].label,
              time: timeInWords(minutesInState(s, Date.now())),
            }),
          ),
          stateLine(s),
          ...gitRow(s),
          ...claudeLink(s, t("session.openInClaude")),
        ]
      : [el("p", "notice", t("detail.gone"))]),
    ...pendingBlock(d.pending),
    el("div", "turns", ...d.turns.map(turn)),
    ...(prs.length ? [el("h3", undefined, t("detail.prs")), el("ul", "prs", ...prs)] : []),
  );
}

export function homeScreen(home: Home, act: Actions): HTMLElement {
  const menuToggle = button("⋯", act.toggleMenu, "menu-toggle");
  menuToggle.setAttribute("aria-label", t("menu.label"));
  menuToggle.setAttribute("aria-expanded", String(home.menuOpen));
  const connection = el("span", `connection ${home.connection}`, t(CONNECTION[home.connection]));
  const sorted = sortForCards(home.sessions);
  const sessions = sorted.filter((s) => !(s.id in home.hidden));
  const hidden = sorted.filter((s) => s.id in home.hidden);
  const none = el("p", "muted", hidden.length ? t("sessions.allHidden") : t("sessions.none"));
  const items =
    home.view === "grid" ? sessions.map((s) => tile(s, home, act)) : sessions.map((s) => card(s, home, act));
  const list = el("div", home.view, ...(items.length ? items : [none]));
  const top = [
    el(
      "header",
      "top",
      el("h1", undefined, t("app.title")),
      ...micJump(home),
      connection,
      ...usageButton(home, act),
      menuToggle,
    ),
    ...menu(home, act),
    ...usagePanel(home),
    ...newVersion(home, act),
  ];
  const problem = home.problem ? [el("p", "notice", home.problem)] : [];
  if (home.open) return el("section", "home", ...top, ...problem, detailScreen(home, home.open, act));
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
