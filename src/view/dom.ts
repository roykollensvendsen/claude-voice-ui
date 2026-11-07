// Building elements, and the small marks every screen shares.
import { gitLine } from "../git";
import { t } from "../i18n";
import { cardState, LOOK, label, minutesInState, type Session, spokenName, timeInState } from "../states";
import { contextTone } from "../usage";
import { type Home } from "../view/types";

export function el<K extends keyof HTMLElementTagNameMap>(
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
  const name = spokenName(s);
  // RULE: a focus event matches a session by id as well as by name
  return key != null && (key === s.id || key === name);
}

/** A speech bubble, marking the session the voice has just written to. */
export const mic = () => el("span", "mic", "💬");

/** A terminal session's mark; a background session carries none. */
export const kindMark = (s: Session) => (s.kind === "terminal" ? [el("span", "kind", ">_")] : []);

/** The session's short number, when the bridge gives one. */
export const number = (s: Session) => (s.number ? [el("span", "number", String(s.number))] : []);

export const numbered = (s: Session) => `${s.number ? `${s.number} ` : ""}${label(s)}`;

/** A fainter mark for a session the voice only looked at, without writing to it. */
export const peekMark = (s: Session, home: Home) =>
  !matches(s, home.focus) && home.peeks.some((key) => matches(s, key)) ? [el("span", "peek", "👁")] : [];

/** A link into the Claude app for a session connected to Remote Control; Android hands it to the app. */
export function claudeLink(s: Session, label: string, className = "open-claude"): HTMLElement[] {
  if (!s.app_url) return [];
  const a = el("a", className, label);
  a.href = s.app_url;
  a.target = "_blank";
  a.rel = "noopener";
  return [a];
}

export function stateLine(s: Session): HTMLElement {
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

export function gitRow(s: Session): HTMLElement[] {
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

export function button(label: string, onClick: () => void, className?: string): HTMLButtonElement {
  const b = el("button", className, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

export function hasPrompt(home: Home, s: Session): boolean {
  return home.prompts.some((p) => matches(s, p.session));
}

/** "20 min ago", or "just now". */
export function ago(at: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(at)) / 60_000));
  return minutes < 1 ? t("time.justNow") : t("time.ago", { time: timeInState(minutes) });
}
