// The voice tools' calls on the code-health page: a map of the last days, and the newest calls, live.
import { type Call, type CallLog, failed, type Running, shade, toolsShown, toolTotal } from "../calls";
import { type Key, t } from "../i18n";
import { button, el } from "./dom";
import type { Actions } from "./types";

/** What each short failure code says. */
export const FAILURES: Record<string, Key> = {
  timeout: "calls.timeout",
  no_answer: "calls.noAnswer",
  refused: "calls.refused",
  bridge_failed: "calls.bridgeFailed",
  caller_gone: "calls.callerGone",
};

/** How a call ended, in the page's words; a failure with no code says how it ended instead. */
const OUTCOMES: Record<string, Key> = {
  ok: "calls.ok",
  error: "calls.failed",
  refused: "calls.refused",
  timeout: "calls.timeout",
  cancelled: "calls.cancelled",
};

export function how(call: Pick<Call, "outcome" | "error_class">): string {
  if (call.outcome === "ok" || !call.error_class) {
    const said = OUTCOMES[call.outcome];
    return said ? t(said) : call.outcome;
  }
  const said = FAILURES[call.error_class];
  // RULE: a failure the page has no words for still reads plainly
  return said ? t(said) : t("calls.failedWith", { what: call.error_class.replaceAll("_", " ") });
}

/** "120 ms", "23.4 s" or "2 min 5 s". */
export function took(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace(/\.0$/, "")} s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/** Whole seconds since `at`, counted on the page. */
function soFar(at: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(at)) / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

const clock = (at: string) =>
  new Date(at).toLocaleTimeString("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });

const whoCalled = (caller: string | null) => (caller ? [el("span", "caller muted", caller)] : []);

function runningRow(r: Running): HTMLElement {
  const row = el(
    "li",
    "call running",
    el("span", "at", clock(r.at)),
    el("span", "tool", r.tool),
    el("span", "how", t("calls.running")),
    // RULE: a call that begins shows as running, with a timer counting from when it began
    el("span", "took", soFar(r.at)),
    ...whoCalled(r.caller),
  );
  row.dataset.id = r.id;
  return row;
}

export function callRow(c: Call): HTMLElement {
  const row = el(
    "li",
    `call${failed(c.outcome) ? " failed" : ""}`,
    el("span", "at", clock(c.ended_at)),
    el("span", "tool", c.tool),
    el("span", "how", how(c)),
    el("span", "took", took(c.ms)),
    ...whoCalled(c.caller),
  );
  row.dataset.id = c.id;
  return row;
}

function strip(log: CallLog): HTMLElement {
  const rows = [...log.running.map(runningRow), ...log.recent.map(callRow)];
  return el(
    "section",
    "recent",
    el("h4", undefined, t("calls.recent")),
    rows.length ? el("ol", "strip", ...rows) : el("p", "muted", t("calls.noRecent")),
  );
}

function headRow(log: CallLog, act: Actions): HTMLElement {
  const reset = button(t("calls.reset"), act.resetSince, "reset");
  return el(
    "div",
    "row head",
    el("span", "name"),
    ...log.days.map((d) => el("span", "day-label", String(Number(d.slice(8))))),
    el("span", "total-label", t("calls.total")),
    el("span", "since-label", t("calls.since"), reset),
  );
}

function toolRow(log: CallLog, tool: string, act: Actions): HTMLElement {
  const byDay = log.counts.get(tool);
  const cells = log.days.map((day) => {
    const count = byDay?.get(day) ?? { calls: 0, errors: 0 };
    const cls = `cell${count.errors ? " has-errors" : ""}`;
    const cell = button(count.calls ? String(count.calls) : "", () => act.openDay(day, tool), cls);
    cell.dataset.tool = tool;
    cell.dataset.day = day;
    cell.dataset.level = String(shade(count.calls, log.scale));
    if (count.errors) cell.title = t("calls.errors", { count: count.errors });
    return cell;
  });
  const total = el("span", "total", String(toolTotal(log, tool)));
  total.dataset.tool = tool;
  const since = el("span", "since", log.since.get(tool) ? String(log.since.get(tool)) : "");
  since.dataset.tool = tool;
  return el("div", "row", el("span", "name", tool), ...cells, total, since);
}

function map(log: CallLog, act: Actions): HTMLElement {
  const grid = el("div", "map", headRow(log, act), ...toolsShown(log).map((tool) => toolRow(log, tool, act)));
  grid.style.setProperty("--days", String(log.days.length));
  grid.dataset.scale = log.scale.join(",");
  return grid;
}

function dayList(log: CallLog, act: Actions): HTMLElement[] {
  if (!log.day) return [];
  const { day, tool, data } = log.day;
  const body = log.day.failed
    ? [el("p", "problem", t("calls.unreadable"))]
    : !data
      ? [el("p", "muted", t("calls.loading"))]
      : data.counted_only
        ? [el("p", "muted", t("calls.countedOnly"))]
        : data.calls.length
          ? [el("ol", "strip", ...data.calls.map(callRow))]
          : [el("p", "muted", t("calls.dayEmpty"))];
  return [
    el(
      "section",
      "day",
      el("h4", undefined, `${tool}, ${Number(day.slice(8))}.${Number(day.slice(5, 7))}`),
      ...body,
      button(t("calls.close"), act.closeDay, "close-day"),
    ),
  ];
}

const PROBLEMS: Record<NonNullable<CallLog["problem"]>, Key> = {
  none: "calls.none",
  unreadable: "calls.unreadable",
};

export function callsSection(log: CallLog | null, act: Actions): HTMLElement {
  const parts = !log
    ? [el("p", "muted", t("calls.loading"))]
    : log.problem
      ? [el("p", "problem", t(PROBLEMS[log.problem]))]
      : [
          map(log, act),
          ...dayList(log, act),
          strip(log),
          ...(log.unused.length
            ? [el("p", "unused muted", t("calls.unused"), ` ${log.unused.join(", ")}`)]
            : []),
        ];
  return el("section", "calls", el("h3", undefined, t("calls.title")), ...parts);
}
