// The activity section on the code-health page: the recording switch, a live list, and five charts.
import { type ActivityView, type NowSession, type Point, slots, WINDOWS } from "../activity";
import { type Key, t } from "../i18n";
import { button, el } from "./dom";
import type { ActivityActions } from "./types";

const SVG = "http://www.w3.org/2000/svg";
/** Each chart is as wide as its buckets, one unit each, and this tall. */
const HEIGHT = 40;

const clock = (at: string) =>
  new Date(at).toLocaleTimeString("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });
const dayAndClock = (at: string) =>
  `${new Date(at).toLocaleDateString("nb-NO", { timeZone: "Europe/Oslo", day: "numeric", month: "numeric" })} ${clock(at)}`;

/** How long something has run, in whole seconds, minutes, or hours and minutes. */
export function age(seconds: number): string {
  if (seconds < 60) return t("activity.seconds", { n: Math.floor(seconds) });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("activity.minutes", { n: minutes });
  return t("activity.hours", { h: Math.floor(minutes / 60), m: minutes % 60 });
}

function choice<V extends string>(className: string, values: [V, string][], chosen: V, pick: (v: V) => void) {
  const select = el("select", className);
  for (const [value, label] of values) {
    const option = el("option", undefined, label);
    option.value = value;
    option.selected = value === chosen;
    select.append(option);
  }
  select.addEventListener("change", () => pick(select.value as V));
  return select;
}

const svgNode = (tag: string, attrs: Record<string, string | number>) => {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
};

/** The spans with no recording, each one hatched rectangle. */
function gaps(row: (Point | null)[]): Element[] {
  const out: Element[] = [];
  let start = -1;
  row.forEach((p, i) => {
    if (p === null && start < 0) start = i;
    if ((p !== null || i === row.length - 1) && start >= 0) {
      const end = p === null ? i + 1 : i;
      out.push(svgNode("rect", { class: "gap", x: start, y: 0, width: end - start, height: HEIGHT }));
      start = -1;
    }
  });
  return out;
}

/** One line per measure, broken where nothing was recorded, all on the chart's own scale. */
function lines(row: (Point | null)[], measures: [string, (p: Point) => number][], max: number): Element[] {
  return measures.flatMap(([name, value]) => {
    const runs: string[][] = [[]];
    row.forEach((p, i) => {
      if (p === null) return void runs.push([]);
      runs.at(-1)?.push(`${i + 0.5},${HEIGHT - (value(p) / max) * HEIGHT}`);
    });
    return runs
      .filter((r) => r.length > 0)
      .map((r) => svgNode("polyline", { class: name, points: r.join(" "), fill: "none" }));
  });
}

/** What each chart draws, and in what unit its highest point is said. */
const CHARTS: { key: string; label: Key; measures: [string, (p: Point, bucket: number) => number][] }[] = [
  {
    key: "tokens",
    label: "activity.tokens",
    measures: [
      ["in", (p) => p.tok_in],
      ["out", (p) => p.tok_out],
    ],
  },
  {
    key: "calls",
    label: "activity.calls",
    measures: [
      ["read", (p) => p.n_read],
      ["write", (p) => p.n_write],
      ["run", (p) => p.n_run],
      ["mcp", (p) => p.n_mcp],
      ["agent", (p) => p.n_agent],
    ],
  },
  // Seconds inside tool calls per minute, whatever the bucket.
  { key: "command", label: "activity.command", measures: [["time", (p, b) => p.tool_ms / 1000 / (b / 60)]] },
  // Per cent of one core.
  { key: "cpu", label: "activity.cpu", measures: [["cpu", (p, b) => p.cpu_ms / (b * 10)]] },
];

function chart(key: string, label: string, top: string, ...marks: Element[]): HTMLElement {
  const svg = svgNode("svg", {
    viewBox: `0 0 ${marks.length ? 1 : 1} ${HEIGHT}`,
    preserveAspectRatio: "none",
  });
  svg.append(...marks);
  const box = el("div", "chart", el("p", "label", label, el("span", "top", top)));
  box.dataset.chart = key;
  box.append(svg);
  return box;
}

/** Which colour is which line, for a chart with more than one. */
const legend = (names: string[]) =>
  el("p", "keys", ...names.map((n) => el("span", n, t(`activity.key.${n}` as Key))));

/** Each recorded bucket coloured by what the sessions mostly were: busy, idle or waiting. */
function statusBand(row: (Point | null)[]): Element[] {
  return row.flatMap((p, i) => {
    if (!p) return [];
    const most = [
      ["busy", p.busy_s],
      ["idle", p.idle_s],
      ["waiting", p.waiting_s],
    ].sort((a, b) => Number(b[1]) - Number(a[1]))[0];
    if (!most || most[1] === 0) return [];
    return [svgNode("rect", { class: String(most[0]), x: i, y: 0, width: 1, height: HEIGHT })];
  });
}

function charts(view: ActivityView): HTMLElement[] {
  const series = view.series;
  if (!series) return [];
  const row = slots(series);
  const shown = CHARTS.map(({ key, label, measures }) => {
    const values = row.flatMap((p) => (p ? measures.map(([, v]) => v(p, series.bucket_s)) : []));
    const max = Math.max(1, ...values);
    const bucketed = measures.map(
      ([n, v]) => [n, (p: Point) => v(p, series.bucket_s)] as [string, (p: Point) => number],
    );
    const box = chart(key, t(label), String(Math.round(max)), ...gaps(row), ...lines(row, bucketed, max));
    if (measures.length > 1) box.append(legend(measures.map(([n]) => n)));
    return box;
  });
  shown.push(chart("status", t("activity.status"), "", ...gaps(row), ...statusBand(row)));
  // A window longer than an hour can cross midnight, so its ends carry the day too.
  const when = series.bucket_s > 60 ? dayAndClock : clock;
  shown.push(
    el("p", "axis", el("span", undefined, when(series.from)), el("span", undefined, when(series.to))),
  );
  for (const box of shown) box.querySelector("svg")?.setAttribute("viewBox", `0 0 ${row.length} ${HEIGHT}`);
  return shown;
}

function nowRow(s: NowSession): HTMLElement {
  const parts = [s.name, t(`activity.${s.status}` as Key)];
  if (s.call) {
    const running = (Date.now() - Date.parse(s.call.started)) / 1000;
    parts.push(`${s.call.program ?? s.call.tool} ${age(running)}`);
  }
  parts.push(`${Math.round(s.cpu_pct)} % CPU`, `${Math.round(s.rss_mb)} MB`);
  if (s.child) parts.push(t("activity.child", { program: s.child.program, age: age(s.child.age_s) }));
  // RULE: a session stuck in one command is shown red with its program and how long it has run
  const row = el("li", s.state, parts.join(" · "));
  row.dataset.session = s.name;
  return row;
}

function pickers(view: ActivityView, act: ActivityActions): HTMLElement {
  const { orgs, sessions } = view.state.scopes;
  const scopes: [string, string][] = [
    ["all", t("activity.all")],
    ...orgs.map((o): [string, string] => [`org:${o}`, t("activity.org", { org: o })]),
    ...sessions.map((s): [string, string] => [`session:${s.name}`, s.name]),
  ];
  const windows = WINDOWS.map((w): [typeof w, string] => [w, t(`activity.window.${w}` as Key)]);
  return el(
    "p",
    "pickers",
    choice("scope", scopes, view.scope, act.pickScope),
    choice("window", windows, view.window, act.pickWindow),
  );
}

/** The section, or nothing from a bridge that cannot record. */
export const activityBlock = (view: ActivityView | null, act: ActivityActions): HTMLElement[] =>
  view ? [activitySection(view, act)] : [];

export function activitySection(view: ActivityView, act: ActivityActions): HTMLElement {
  const box = el("section", "activity", el("h3", undefined, t("activity.title")));
  const { on, until } = view.state;
  if (!on) {
    const durations = view.state.durations.map((d): [typeof d, string] => [d, t(`activity.for.${d}` as Key)]);
    box.append(
      choice("for", durations, view.for, act.setFor),
      button(t("activity.start"), act.toggle, "switch"),
    );
  } else {
    if (until) box.append(el("p", "until", t("activity.until", { at: clock(until) })));
    box.append(
      button(t("activity.stop"), act.toggle, "switch"),
      button(t("activity.clear"), act.clear, "clear"),
    );
  }
  if (view.problem) box.append(el("p", "problem", view.problem));
  if (!on) return box;
  if (!view.state.scopes.orgs.length) box.append(el("p", "hint", t("activity.noOrgs")));
  box.append(pickers(view, act));
  if (view.now) box.append(el("ul", "now", ...view.now.sessions.map(nowRow)));
  box.append(...charts(view));
  return box;
}
