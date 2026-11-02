// What a session card shows: the bridge's words for a session, turned into one of seven states.

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
}

export type CardState = "working" | "idle" | "answer" | "approval" | "shell" | "moved" | "stopped";

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
  shell: { label: "At the shell", icon: "›", tone: "slate" },
  moved: { label: "Moved", icon: "→", tone: "faded" },
  stopped: { label: "Stopped", icon: "■", tone: "red" },
};

/** A bridge session reports the store's own words for an ended turn. */
const STOPPED = new Set(["error", "cancelled", "interrupted", "stopped"]);

export function cardState(s: Session): CardState {
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
  return state === "answer" || state === "approval";
}

export function sortForCards(sessions: readonly Session[]): Session[] {
  return [...sessions].sort(
    (a, b) =>
      // RULE: sessions waiting for the owner come first
      Number(waitsForOwner(b)) - Number(waitsForOwner(a)) || a.minutes_since_update - b.minutes_since_update,
  );
}

export function timeInState(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / (24 * 60))} d`;
}
