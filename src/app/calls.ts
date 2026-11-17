// The voice tools' calls on the open code-health page: reading them, following them live, and the timer.
import { SignedOut } from "../bridge";
import {
  type CallEnd,
  callEnded,
  callStarted,
  DAYS,
  daysUpTo,
  emptyLog,
  osloDay,
  RECENT,
  type Running,
  resetSince,
  takeRecent,
  takeTotals,
} from "../calls";
import type { Context } from "./context";

/** How often a running call's seconds move on. */
const TICK_MS = 1000;

export interface CallsPart {
  /** The code-health page opened: read the calls, set the colour scale, and start the timer. */
  open(): Promise<void>;
  close(): void;
  /** Read again after the stream dropped, keeping the colour scale Roy is looking at. */
  readAgain(): Promise<void>;
  started(running: Running): void;
  ended(end: CallEnd): void;
  resetSince(): void;
  openDay(day: string, tool: string): Promise<void>;
  closeDay(): void;
  stop(): void;
}

export function callsPart({ home, deps, draw, failed }: Context): CallsPart {
  let ticker: ReturnType<typeof setInterval> | undefined;

  /** Read the totals and the newest calls into the log the page shows, if it is still the one shown. */
  async function read(setScale: boolean) {
    const shown = home.calls ?? emptyLog(osloDay(Date.now()));
    const days = daysUpTo(osloDay(Date.now()), DAYS);
    try {
      const [totals, recent] = await Promise.all([
        deps.bridge.callTotals(days[0] ?? "", days.at(-1) ?? ""),
        deps.bridge.recentCalls(RECENT),
      ]);
      if (!home.health) return;
      if (totals === null) shown.problem = "none";
      else {
        takeTotals(shown, totals, setScale);
        takeRecent(shown, recent);
        shown.problem = null;
      }
    } catch (error) {
      if (error instanceof SignedOut) return failed(error);
      if (!home.health) return;
      // RULE: a call log that cannot be read says so in plain words, and the measures still show
      shown.problem = "unreadable";
    }
    home.calls = shown;
    draw();
  }

  /** The page shows the calls only while it is open and they have been read. */
  const live = () => (home.health && home.calls && !home.calls.problem ? home.calls : null);

  return {
    async open() {
      home.calls = null;
      clearInterval(ticker);
      ticker = setInterval(() => {
        if (live()?.running.length) draw();
      }, TICK_MS);
      await read(true);
    },
    close() {
      clearInterval(ticker);
      ticker = undefined;
      home.calls = null;
    },
    readAgain: () => (live() ? read(false) : Promise.resolve()),
    started(running) {
      const log = live();
      if (!log) return;
      callStarted(log, running);
      draw();
    },
    ended(end) {
      const log = live();
      if (!log) return;
      callEnded(log, end);
      draw();
    },
    resetSince() {
      const log = live();
      if (!log) return;
      resetSince(log);
      draw();
    },
    async openDay(day, tool) {
      const log = live();
      if (!log) return;
      log.day = { day, tool, data: null };
      draw();
      try {
        const data = await deps.bridge.dayCalls(day, tool);
        if (log.day?.day === day && log.day.tool === tool) log.day = { day, tool, data };
      } catch (error) {
        if (error instanceof SignedOut) return failed(error);
        if (log.day?.day === day && log.day.tool === tool) log.day = { day, tool, data: null, failed: true };
      }
      draw();
    },
    closeDay() {
      const log = live();
      if (!log) return;
      log.day = null;
      draw();
    },
    stop() {
      clearInterval(ticker);
      ticker = undefined;
    },
  };
}
