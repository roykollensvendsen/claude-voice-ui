// What a session card shows: one of eight states, as the bridge reports it or as read from its rawer words.

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
}

export type CardState = "working" | "idle" | "answer" | "approval" | "input" | "shell" | "moved" | "stopped";

export interface Look {
  label: string;
  icon: string;
  /** The colour's name; the stylesheet gives each one its colour. */
  tone: string;
}

export const LOOK: Record<CardState, Look> = {
  working: { label: "Working", icon: "●", tone: "green" },
  idle: { label: "Idle", icon: "○", tone: "grey" },
  answer: { label: "Waiting for an answer", icon: "?", tone: "amber" },
  approval: { label: "Waiting for approval", icon: "!", tone: "orange" },
  input: { label: "Waiting for input", icon: "…", tone: "gold" },
  shell: { label: "At the shell", icon: "›", tone: "slate" },
  moved: { label: "Moved", icon: "→", tone: "faded" },
  stopped: { label: "Stopped", icon: "■", tone: "red" },
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

export function timeInState(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / (24 * 60))} d`;
}
