// Updating the bridge: asked for, confirmed, followed step by step, and read again after its restart.
import { SignedOut, type UpdateStep } from "../bridge";
import { t } from "../i18n";
import { IDLE } from "../update";
import type { UpdateActions } from "../view";
import type { Context } from "./context";

export interface Updating {
  actions: UpdateActions;
  step(step: UpdateStep): void;
  read(): Promise<void>;
  checkBridge(): Promise<void>;
}

export function updating({ home, deps, draw, failed, watching }: Context): Updating {
  const actions: UpdateActions = {
    ask() {
      // RULE: the update starts only after the owner confirms
      home.update = { ...IDLE, phase: "confirm" };
      draw();
    },
    cancel() {
      home.update = { ...IDLE };
      draw();
    },
    async confirm() {
      home.update = { ...IDLE, phase: "running" };
      draw();
      try {
        const started = await deps.bridge.startUpdate();
        if (started.outcome === "started") home.update.note = started.note;
        else {
          home.update.phase = "done";
          home.update.message =
            started.outcome === "running" ? t("update.alreadyRunning") : t("update.notAClone");
        }
      } catch (error) {
        home.update = { ...IDLE };
        failed(error);
      }
      draw();
    },
  };

  function step(step: UpdateStep) {
    if (home.update.phase !== "running") home.update = { ...IDLE, phase: "running" };
    home.update.steps.push(step);
    if (step.step === "done" || step.result) {
      home.update.phase = "done";
      home.update.result = step.result ?? null;
      void read();
    }
    draw();
  }

  /** After the restart nothing is replayed, so the rest of the run is read in one go. */
  async function read() {
    try {
      const run = await deps.bridge.lastUpdate();
      home.update.steps = run.steps;
      home.update.restarting = false;
      if (!run.running) {
        home.update.phase = "done";
        home.update.result = run.result ?? home.update.result;
        home.update.detail = run.detail;
        home.update.to = run.to ?? "";
        void checkBridge();
      }
      draw();
    } catch {
      // The bridge may still be starting; the next reconnect asks again.
    }
  }

  async function checkBridge() {
    try {
      home.bridge = await deps.bridge.bridgeInfo();
      if (watching()) draw();
    } catch (error) {
      if (error instanceof SignedOut) failed(error);
    }
  }

  return { actions, step, read, checkBridge };
}
