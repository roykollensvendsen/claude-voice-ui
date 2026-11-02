// What a session card shows: one of eight states, as the bridge reports it or as read from its rawer words.
import type { Git } from "./git";

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

export const LOOK: Record<CardState, Look> = {
  working: { label: "Working", icon: "●", tone: "green", meaning: "running a turn or its tools" },
  idle: { label: "Idle", icon: "○", tone: "grey", meaning: "done, ready for a new task" },
  answer: {
    label: "Waiting for an answer",
    icon: "?",
    tone: WAITING_TONE,
    meaning: "it has asked you a question",
  },
  approval: {
    label: "Waiting for approval",
    icon: "!",
    tone: WAITING_TONE,
    meaning: "a tool needs your permission",
  },
  input: { label: "Waiting for input", icon: "…", tone: WAITING_TONE, meaning: "it waits for you to write" },
  shell: {
    label: "At the shell",
    icon: "›",
    tone: "slate",
    meaning: "a terminal at its prompt, no Claude turn",
  },
  moved: { label: "Moved", icon: "→", tone: "faded", meaning: "continued in another session" },
  stopped: { label: "Stopped", icon: "■", tone: "red", meaning: "ended, or stopped by an error" },
};

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
  const say = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (minutes < 1) return "just now";
  if (minutes < 60) return say(minutes, "minute");
  if (minutes < 24 * 60) return say(Math.floor(minutes / 60), "hour");
  return say(Math.floor(minutes / (24 * 60)), "day");
}

export function timeInState(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / (24 * 60))} d`;
}
