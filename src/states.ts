// What a session card shows: one of eight states, as the bridge reports it or as read from its rawer words.
import type { Git } from "./git";
import { plural, t } from "./i18n.ts";

/** One session as GET /api/v1/sessions gives it. */
export interface Session {
  id: string;
  name: string;
  kind: string;
  project: string;
  status: string;
  doing: string;
  minutes_since_update: number;
  question?: { text: string; options?: string[] };
  waiting_for?: string | null;
  moved_to?: { id?: string; name?: string };
  /** A short number, steady while the session runs, that the voice also understands: "number 3". */
  number?: number;
  /** Opens the session in the Claude app while it is connected to Remote Control; null otherwise. */
  app_url?: string | null;
  /** The bridge's own state; older bridges send only `status`. */
  state?: string;
  /** When `state` last changed. */
  state_since?: string;
  waiting_kind?: "question" | "approval" | "input" | null;
  /** The folder's git status; null outside a repository, absent from an older bridge. */
  git?: Git | null;
  /** How full its context is, from its own latest status line. */
  context?: { used_percentage: number; as_of: string } | null;
}

export type CardState = "working" | "idle" | "answer" | "approval" | "input" | "shell" | "moved" | "stopped";

export interface Look {
  label: string;
  icon: string;
  /** The colour's name; the stylesheet gives each one its colour. */
  tone: string;
  /** What the state means, for the legend. */
  meaning: string;
}

// RULE: every kind of waiting is amber, as in the design draft
const WAITING_TONE = "amber";

const LOOKS: Record<CardState, { icon: string; tone: string }> = {
  working: { icon: "●", tone: "green" },
  idle: { icon: "○", tone: "grey" },
  answer: { icon: "?", tone: WAITING_TONE },
  approval: { icon: "!", tone: WAITING_TONE },
  input: { icon: "…", tone: WAITING_TONE },
  shell: { icon: "›", tone: "slate" },
  moved: { icon: "→", tone: "faded" },
  stopped: { icon: "■", tone: "red" },
};

/** Each state's look; its words are read in the language shown at the moment they are asked for. */
export const LOOK = Object.fromEntries(
  (Object.keys(LOOKS) as CardState[]).map((state) => [
    state,
    {
      ...LOOKS[state],
      get label() {
        return t(`state.${state}`);
      },
      get meaning() {
        return t(`state.${state}.meaning`);
      },
    },
  ]),
) as Record<CardState, Look>;

/** A bridge session reports the store's own words for an ended turn. */
const STOPPED = new Set(["error", "cancelled", "interrupted", "stopped"]);

export function cardState(s: Session): CardState {
  // RULE: the state the bridge reports wins over the app's own reading
  if (s.state && Object.hasOwn(LOOK, s.state)) return s.state as CardState;
  switch (s.status) {
    case "busy":
    case "running":
      return "working";
    case "shell":
      return "shell";
    case "moved":
      return "moved";
    case "waiting":
      // RULE: a session with a question waits for an answer
      if (s.question) return "answer";
      return /permission|approv/i.test(s.waiting_for ?? "") ? "approval" : "answer";
  }
  if (STOPPED.has(s.status)) return "stopped";
  return "idle";
}

function waitsForOwner(s: Session): boolean {
  const state = cardState(s);
  return state === "answer" || state === "approval" || state === "input";
}

export function sortForCards(sessions: readonly Session[]): Session[] {
  return [...sessions].sort(
    (a, b) =>
      // RULE: sessions waiting for the owner come first
      Number(waitsForOwner(b)) - Number(waitsForOwner(a)) || a.minutes_since_update - b.minutes_since_update,
  );
}

/** Minutes since the state changed, when the bridge says when; otherwise since the last update. */
export function minutesInState(s: Session, now: number): number {
  const since = s.state_since ? Date.parse(s.state_since) : Number.NaN;
  if (Number.isNaN(since)) return s.minutes_since_update;
  return Math.max(0, Math.floor((now - since) / 60_000));
}

/** The same span spelled out, for words read on their own: "3 days" rather than "3 d". */
export function timeInWords(minutes: number): string {
  if (minutes < 1) return t("time.justNow");
  if (minutes < 60) return plural(minutes, "time.minutes");
  if (minutes < 24 * 60) return plural(Math.floor(minutes / 60), "time.hours");
  return plural(Math.floor(minutes / (24 * 60)), "time.days");
}

export function timeInState(minutes: number): string {
  if (minutes < 1) return t("time.justNow");
  if (minutes < 60) return t("time.min", { count: minutes });
  if (minutes < 24 * 60) return t("time.h", { count: Math.floor(minutes / 60) });
  return t("time.d", { count: Math.floor(minutes / (24 * 60)) });
}
