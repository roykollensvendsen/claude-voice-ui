// The activity section on the open code-health page: the switch, and reading the live list and charts.
import { BUCKET_S, newView } from "../activity";
import { SignedOut } from "../bridge";
import { t } from "../i18n";
import type { ActivityActions } from "../view/types";
import type { Context } from "./context";

/** How often the live list of sessions is read while recording. */
const NOW_MS = 10_000;

export interface ActivityPart {
  /** The code-health page opened: read whether the bridge records, and if so, what. */
  open(): Promise<void>;
  close(): void;
  actions: ActivityActions;
}

export function activityPart({ home, deps, draw, failed }: Context): ActivityPart {
  let nowTimer: ReturnType<typeof setInterval> | undefined;
  let seriesTimer: ReturnType<typeof setInterval> | undefined;

  function stopReading() {
    clearInterval(nowTimer);
    clearInterval(seriesTimer);
    nowTimer = seriesTimer = undefined;
  }

  /** A read failed while recording: ask whether it has stopped itself, and if so offer the switch again. */
  async function lost(error: unknown) {
    if (error instanceof SignedOut) return failed(error);
    const view = home.activity;
    const state = await deps.bridge.activity().catch(() => null);
    if (!view || home.activity !== view) return;
    // RULE: when recording stops itself while the page is open, the section offers the switch again
    if (state && !state.on) {
      view.state = state;
      view.problem = null;
      stopReading();
    } else view.problem = t("activity.unreadable");
    draw();
  }

  /** What went wrong: signed out goes back to sign-in; anything else is shown in the bridge's words. */
  function said(error: unknown) {
    if (error instanceof SignedOut) return failed(error);
    const sentence = error instanceof Error ? error.message : "";
    if (home.activity) home.activity.problem = sentence || t("activity.refused");
    draw();
  }

  async function readSeries() {
    const view = home.activity;
    if (!view) return;
    const { scope, window } = view;
    try {
      const series = await deps.bridge.activitySeries(scope, window);
      if (home.activity === view && view.scope === scope && view.window === window) view.series = series;
    } catch (error) {
      return lost(error);
    }
    draw();
  }

  async function readNow() {
    const view = home.activity;
    if (!view) return;
    try {
      const now = await deps.bridge.activityNow(view.scope);
      if (home.activity === view) view.now = now;
    } catch (error) {
      return lost(error);
    }
    draw();
  }

  /** Read both now, and keep reading while the section is open and the bridge records. */
  async function follow() {
    stopReading();
    const view = home.activity;
    // RULE: while recording is off the page reads no activity, and offers to switch it on
    if (!view?.state.on) return draw();
    nowTimer = setInterval(() => void readNow(), NOW_MS);
    seriesTimer = setInterval(() => void readSeries(), BUCKET_S[view.window] * 1000);
    await Promise.all([readSeries(), readNow()]);
  }

  return {
    async open() {
      home.activity = null;
      try {
        const state = await deps.bridge.activity();
        if (!home.health) return;
        home.activity = state ? newView(state) : null;
      } catch (error) {
        // A bridge that did not answer leaves the section out; the measures still show.
        if (error instanceof SignedOut) return failed(error);
      }
      await follow();
    },
    close() {
      stopReading();
      home.activity = null;
    },
    actions: {
      async toggle() {
        const view = home.activity;
        if (!view) return;
        view.problem = null;
        try {
          const change = view.state.on ? { on: false } : { on: true, for: view.for };
          view.state = await deps.bridge.setActivity(change);
        } catch (error) {
          return said(error);
        }
        await follow();
      },
      setFor(duration) {
        if (home.activity) home.activity.for = duration;
      },
      async clear() {
        if (!home.activity) return;
        try {
          await deps.bridge.clearActivity();
        } catch (error) {
          return said(error);
        }
        await readSeries();
      },
      pickScope(scope) {
        if (!home.activity) return;
        home.activity.scope = scope;
        home.activity.now = null;
        void Promise.all([readSeries(), readNow()]);
      },
      pickWindow(window) {
        if (!home.activity) return;
        home.activity.window = window;
        void follow();
      },
    },
  };
}
