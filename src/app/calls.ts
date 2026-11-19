// The voice tools' calls on the open code-health page: reading them, following them live, and the timer.
import { SignedOut } from "../bridge";
import {
  type CallEnd,
  type CallLog,
  type CallTotals,
  callEnded,
  callStarted,
  DAYS,
  daysUpTo,
  emptyLog,
  osloDay,
  RECENT,
  type RecentCalls,
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
  /** Read again after the stream dropped, keeping the colour scale the owner is looking at. */
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
  /** Calls that end while the counts are read again, held until the fresh counts are in. */
  let held: CallEnd[] | null = null;

  /** Read the totals and the newest calls into the log the page shows, if it is still the one shown. */
  async function read(setScale: boolean) {
    if (held) return;
    const shown = home.calls ?? emptyLog(osloDay(Date.now()));
    held = setScale ? null : [];
    try {
      const [totals, recent] = await readBoth();
      if (!home.health) return void (held = null);
      take(shown, totals, recent, setScale);
    } catch (error) {
      // Nothing is counted on a log that could not be read, so what was held is let go.
      held = null;
      if (error instanceof SignedOut) return failed(error);
      if (!home.health) return;
      // RULE: a call log that cannot be read says so in plain words, and the measures still show
      shown.problem = "unreadable";
    }
    home.calls = shown;
    settle(shown);
    draw();
  }

  /** The fourteen days' counts up to today in Oslo, and the newest calls, read together. */
  function readBoth() {
    const days = daysUpTo(osloDay(Date.now()), DAYS);
    return Promise.all([
      deps.bridge.callTotals(days[0] ?? "", days.at(-1) ?? ""),
      deps.bridge.recentCalls(RECENT),
    ]);
  }

  /** What a read brought: the counts and newest calls, or that the bridge keeps no log. */
  function take(log: CallLog, totals: CallTotals | null, recent: RecentCalls, setScale: boolean) {
    if (totals === null) return void (log.problem = "none");
    takeTotals(log, totals, setScale);
    takeRecent(log, recent);
    log.problem = null;
  }

  /** Let the calls that ended during a read count now, each once, whichever side of the read it fell. */
  function settle(log: CallLog) {
    const waiting = held ?? [];
    held = null;
    for (const end of waiting) callEnded(log, end);
  }

  /** The page shows the calls only while it is open and they have been read. */
  const live = () => (home.health && home.calls && !home.calls.problem ? home.calls : null);

  return {
    async open() {
      home.calls = null;
      clearInterval(ticker);
      ticker = setInterval(() => {
        const log = live();
        if (!log) return;
        // RULE: when midnight passes in Oslo, the map moves on a day and keeps its colours
        if (osloDay(Date.now()) !== log.days.at(-1)) void read(false);
        else if (log.running.length) draw();
      }, TICK_MS);
      await read(true);
    },
    close() {
      held = null;
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
      // RULE: a call that ends while the counts are read again is counted once, whichever way it falls
      if (held) return void held.push(end);
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
