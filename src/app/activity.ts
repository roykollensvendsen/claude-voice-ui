// The activity section on the open code-health page: the switch, and reading the live list and charts.
import { BUCKET_S, newView } from "../activity";
import { Refused, SignedOut } from "../bridge";
import { type Key, t } from "../i18n";
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
  let untilTimer: ReturnType<typeof setTimeout> | undefined;

  function stopReading() {
    clearInterval(nowTimer);
    clearInterval(seriesTimer);
    clearTimeout(untilTimer);
    nowTimer = seriesTimer = untilTimer = undefined;
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
      view.unreadable = false;
      stopReading();
    } else view.unreadable = true;
    draw();
  }

  /** What went wrong: signed out goes back to sign-in; a refusal with a reason is shown in the bridge's words. */
  function said(error: unknown, otherwise: Key) {
    if (error instanceof SignedOut) return failed(error);
    // RULE: a switch or clear that failed without the bridge's reason is said in the page's own words
    if (home.activity) home.activity.problem = error instanceof Refused ? error.message : t(otherwise);
    draw();
  }

  async function readSeries() {
    const view = home.activity;
    if (!view) return;
    const { scope, window } = view;
    try {
      const series = await deps.bridge.activitySeries(scope, window);
      if (home.activity === view && view.scope === scope && view.window === window) {
        view.series = series;
        view.unreadable = false;
      }
    } catch (error) {
      return lost(error);
    }
    draw();
  }

  async function readNow() {
    const view = home.activity;
    if (!view) return;
    const { scope } = view;
    try {
      const now = await deps.bridge.activityNow(scope);
      // RULE: a live list read for a scope no longer chosen is never shown
      if (home.activity === view && view.scope === scope) {
        // RULE: a read that works again takes away the earlier could-not-be-read
        Object.assign(view, { now, unreadable: false });
      }
    } catch (error) {
      return lost(error);
    }
    draw();
  }

  /** The recording time has passed: ask the bridge, and offer the switch again if it has stopped. */
  async function ranOut(view: NonNullable<typeof home.activity>) {
    const state = await deps.bridge.activity().catch(() => null);
    if (home.activity !== view || !state) return;
    view.state = state;
    await follow();
  }

  /** Read both now, and keep reading while the section is open and the bridge records. */
  async function follow() {
    stopReading();
    const view = home.activity;
    // RULE: while recording is off the page reads no activity, and offers to switch it on
    if (!view?.state.on) return draw();
    nowTimer = setInterval(() => void readNow(), NOW_MS);
    // RULE: when the time recording was switched on for runs out, the section asks the bridge again
    if (view.state.until) {
      const left = Date.parse(view.state.until) - Date.now();
      // A bridge still recording past its own end is asked again a minute later, not in a tight loop.
      untilTimer = setTimeout(() => void ranOut(view), left > 0 ? left + 1000 : 60_000);
    }
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
          return said(error, "activity.refused");
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
          return said(error, "activity.notCleared");
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
