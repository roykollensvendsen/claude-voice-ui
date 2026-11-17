// The voice tools' calls, as the bridge logs them: the shapes it sends, and what the page keeps of them.

/** How a call ended, as the bridge puts it. */
export type Outcome = "ok" | "error" | "refused" | "timeout" | "cancelled";

/** One finished call. `error_class` is a short code, null when the call went well. */
export interface Call {
  id: string;
  tool: string;
  source: string;
  /** The name the calling session gave; a claim, shown and never acted on. */
  caller: string | null;
  at: string;
  ended_at: string;
  outcome: Outcome;
  error_class: string | null;
  ms: number;
}

/** A call still running, as GET /calls/recent and the call_start event give it. */
export interface Running {
  id: string;
  tool: string;
  source: string;
  caller: string | null;
  at: string;
}

/** One tool's calls on one Oslo day. */
export interface CallRow {
  day: string;
  tool: string;
  calls: number;
  errors: number;
  median_ms: number | null;
  p95_ms: number | null;
}

/** GET /api/v1/calls/totals: a row per day and tool, and the tools offered with no call at all. */
export interface CallTotals {
  today: string;
  rows: CallRow[];
  unused: string[];
}

/** GET /api/v1/calls/recent: the newest finished calls, newest first, and those running now. */
export interface RecentCalls {
  calls: Call[];
  running: Running[];
}

/** GET /api/v1/calls/day/<day>/<tool>. A polling tool is only counted, so it has no calls listed. */
export interface DayCalls {
  day: string;
  tool: string;
  counted_only: boolean;
  calls: Call[];
}

/** Whether a call failed: it went wrong or timed out. One refused or stopped by its caller did not. */
export function failed(outcome: Outcome): boolean {
  // RULE: a call refused or cancelled is counted, but not marked as failed
  return outcome === "error" || outcome === "timeout";
}

/** The call_end event. */
export type CallEnd = Pick<Call, "id" | "tool" | "outcome" | "error_class" | "ms" | "ended_at">;

/** How many days the map shows, today included. */
export const DAYS = 14;
/** How many calls the strip keeps. */
export const RECENT = 20;

const OSLO = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Oslo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The day in Oslo when `at` happened, as YYYY-MM-DD. */
export function osloDay(at: string | number | Date): string {
  // RULE: a call that ends after midnight in Oslo lands on the Oslo day, not the UTC one
  return OSLO.format(new Date(at));
}

/** The `count` days up to and including `last`, oldest first. */
export function daysUpTo(last: string, count: number): string[] {
  const end = Date.parse(`${last}T12:00:00Z`);
  return Array.from({ length: count }, (_, i) =>
    new Date(end - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  );
}

/**
 * Where the colours change, from the cells that have any calls: three cut points, so a cell
 * falls in one of four shades. Set once as the page opens, so the colours never move under Roy.
 */
export function scaleOf(counts: number[]): number[] {
  const busy = counts.filter((n) => n > 0).sort((a, b) => a - b);
  if (!busy.length) return [1, 1, 1];
  const at = (q: number) => busy[Math.min(busy.length - 1, Math.floor(q * busy.length))] ?? 1;
  return [at(0.25), at(0.5), at(0.75)];
}

/** The shade for a count: 0 for none, then 1 to 4 against the scale. */
export function shade(count: number, scale: number[]): number {
  // RULE: an empty day has no colour, and a busier day is never paler than a quieter one
  if (count <= 0) return 0;
  return 1 + scale.filter((cut) => count > cut).length;
}

export interface CallLog {
  /** The days the map shows, oldest first. */
  days: string[];
  /** Calls and failed calls by tool, then by day. */
  counts: Map<string, Map<string, { calls: number; errors: number }>>;
  unused: string[];
  scale: number[];
  recent: Call[];
  running: Running[];
  /** Calls ended since the page opened, or since Reset, by tool. */
  since: Map<string, number>;
  /** The calls the stream has reported ending, so one reported twice counts once. */
  ended: Set<string>;
  /** The calls the last totals read already hold, by the newest calls read with them. */
  counted: Set<string>;
  /** "none" when the bridge keeps no log; "unreadable" when it did not answer. */
  problem: "none" | "unreadable" | null;
  /** The cell tapped, and its calls once read. */
  day: { day: string; tool: string; data: DayCalls | null; failed?: boolean } | null;
}

export function emptyLog(today: string): CallLog {
  return {
    days: daysUpTo(today, DAYS),
    counts: new Map(),
    unused: [],
    scale: [1, 1, 1],
    recent: [],
    running: [],
    since: new Map(),
    ended: new Set(),
    counted: new Set(),
    problem: null,
    day: null,
  };
}

function cellOf(log: CallLog, tool: string, day: string) {
  let byDay = log.counts.get(tool);
  if (!byDay) {
    byDay = new Map();
    log.counts.set(tool, byDay);
  }
  let cell = byDay.get(day);
  if (!cell) {
    cell = { calls: 0, errors: 0 };
    byDay.set(day, cell);
  }
  return cell;
}

/**
 * Take in the totals the bridge read. The colour scale is set from them only as the page opens;
 * a later read, after the stream dropped, keeps the scale Roy is already looking at.
 */
export function takeTotals(log: CallLog, totals: CallTotals, setScale: boolean) {
  log.days = daysUpTo(totals.today || log.days.at(-1) || "", DAYS);
  log.counts = new Map();
  for (const row of totals.rows) {
    const cell = cellOf(log, row.tool, row.day);
    cell.calls += row.calls;
    cell.errors += row.errors;
  }
  log.unused = totals.unused;
  // RULE: after the stream drops and comes back, the counts are read again but the colours hold
  if (setScale) log.scale = scaleOf(totals.rows.map((r) => r.calls));
}

export function takeRecent(log: CallLog, recent: RecentCalls) {
  log.recent = recent.calls.slice(0, RECENT);
  log.running = recent.running;
  log.counted = new Set(recent.calls.map((c) => c.id));
}

export function callStarted(log: CallLog, running: Running) {
  log.running = [running, ...log.running.filter((r) => r.id !== running.id)];
}

/** A finished call, with where it came from when the page saw it begin. */
function asCall(end: CallEnd, began: Running | undefined): Call {
  return {
    source: began?.source ?? "",
    caller: began?.caller ?? null,
    at: began?.at ?? end.ended_at,
    ...end,
  };
}

/** A call ended: it leaves the running ones, joins the strip, and counts on its day and since opening. */
export function callEnded(log: CallLog, end: CallEnd) {
  // RULE: the same call ending twice on the stream counts once
  if (log.ended.has(end.id)) return;
  log.ended.add(end.id);
  const call = asCall(
    end,
    log.running.find((r) => r.id === end.id),
  );
  log.running = log.running.filter((r) => r.id !== end.id);
  // RULE: the list keeps the twenty newest
  log.recent = [call, ...log.recent.filter((c) => c.id !== end.id)].slice(0, RECENT);
  log.since.set(end.tool, (log.since.get(end.tool) ?? 0) + 1);
  // A call the totals were read with is in them already.
  if (!log.counted.has(end.id)) countOnItsDay(log, end);
}

function countOnItsDay(log: CallLog, end: CallEnd) {
  const cell = cellOf(log, end.tool, osloDay(end.ended_at));
  cell.calls += 1;
  // RULE: a failed call that lands is marked on its day
  if (failed(end.outcome)) cell.errors += 1;
}

/** Start "since opened" again from now. */
export function resetSince(log: CallLog) {
  log.since = new Map();
}

/** A tool's calls over the days shown. */
export function toolTotal(log: CallLog, tool: string): number {
  const byDay = log.counts.get(tool);
  return log.days.reduce((sum, day) => sum + (byDay?.get(day)?.calls ?? 0), 0);
}

/** The tools to draw, busiest first, then by name. */
export function toolsShown(log: CallLog): string[] {
  return [...log.counts.keys()]
    .filter((tool) => toolTotal(log, tool) > 0 || log.since.has(tool))
    .sort((a, b) => toolTotal(log, b) - toolTotal(log, a) || a.localeCompare(b));
}
