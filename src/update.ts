// Updating the bridge from the phone: what the panel knows, and how each step and result read.

import type { UpdateResult, UpdateStep } from "./bridge";
import { type Key, t } from "./i18n";

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

const STEPS = new Set(["check", "fetch", "pull", "install", "test", "restart", "verify", "rollback", "done"]);

export function stepText(s: UpdateStep): string {
  const label = STEPS.has(s.step) ? t(`update.step.${s.step}` as Key) : s.step;
  return `${s.ok ? "✓" : "✗"} ${label}${s.detail ? `: ${s.detail}` : ""}`;
}

export function resultText(u: UpdateState): string {
  switch (u.result) {
    case "updated":
      return t("update.updatedTo", { commit: u.to.slice(0, 7) || t("update.theNewVersion") });
    case "up_to_date":
      return t("update.upToDate");
    case "stopped":
      return `${t("update.stopped")}${u.detail ? ` ${u.detail}` : ""}`;
    case "rolled_back":
      return `${t("update.rolledBack")}${u.detail ? ` ${u.detail}` : ""}`;
    default:
      return t("update.finished");
  }
}
