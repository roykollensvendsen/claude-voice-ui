// Updating the bridge from the phone: what the panel knows, and how each step and result read.
import type { UpdateResult, UpdateStep } from "./bridge";

export interface UpdateState {
  /** idle: offer the button; confirm: ask first; running; done: show the result. */
  phase: "idle" | "confirm" | "running" | "done";
  steps: UpdateStep[];
  note: string;
  /** The stream dropped while running, which is the restart. */
  restarting: boolean;
  result: UpdateResult | null;
  detail: string;
  to: string;
  /** A refusal to start, said instead of the steps. */
  message: string;
}

export const IDLE: UpdateState = {
  phase: "idle",
  steps: [],
  note: "",
  restarting: false,
  result: null,
  detail: "",
  to: "",
  message: "",
};

const STEP: Record<string, string> = {
  check: "Checking for local changes",
  fetch: "Fetching",
  pull: "Pulling",
  install: "Installing",
  test: "Running the tests",
  restart: "Restarting the bridge",
  verify: "Checking it answers",
  rollback: "Rolling back",
  done: "Done",
};

export function stepText(s: UpdateStep): string {
  const label = STEP[s.step] ?? s.step;
  return `${s.ok ? "✓" : "✗"} ${label}${s.detail ? `: ${s.detail}` : ""}`;
}

export function resultText(u: UpdateState): string {
  switch (u.result) {
    case "updated":
      return `Updated to ${u.to.slice(0, 7) || "the new version"}.`;
    case "up_to_date":
      return "Already the latest version.";
    case "stopped":
      return `Stopped before changing anything.${u.detail ? ` ${u.detail}` : ""}`;
    case "rolled_back":
      return `Rolled back: the old version still runs.${u.detail ? ` ${u.detail}` : ""}`;
    default:
      return "Finished.";
  }
}
