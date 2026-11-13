// How both programs' code is doing, measure by measure.
import { type Metric, type SoftwareHealth } from "../bridge";
import { type Key, t } from "../i18n";
import { ago, button, el } from "../view/dom";
import { type Actions } from "../view/types";

export const MEASURES: Record<string, Key> = {
  coverage: "health.coverage",
  mutation: "health.mutation",
  tests: "health.tests",
  problems: "health.problems",
  cycles: "health.cycles",
  layers: "health.layers",
  duplication: "health.duplication",
  complexity: "health.complexity",
  test_time: "health.testTime",
  ci: "health.ci",
};

/** The checks on main, as GitHub states them: a run's conclusion, or its status while it is not done. */
export const CHECKS: Record<string, Key> = {
  success: "health.ciPassing",
  failure: "health.ciFailing",
  startup_failure: "health.ciFailing",
  running: "health.ciRunning",
  in_progress: "health.ciRunning",
  queued: "health.ciRunning",
  waiting: "health.ciRunning",
  requested: "health.ciRunning",
  pending: "health.ciRunning",
  cancelled: "health.ciCancelled",
  skipped: "health.ciSkipped",
  timed_out: "health.ciTimedOut",
  action_required: "health.ciWaiting",
  neutral: "health.ciNeutral",
  stale: "health.ciStale",
};

export const SVG = "http://www.w3.org/2000/svg";

/** A small line of a measure's history, drawn to fit its own range. */
export function trendLine(values: number[]): Element[] {
  if (values.length < 2) return [];
  const low = Math.min(...values);
  const span = Math.max(...values) - low || 1;
  const points = values
    .map(
      (v, i) => `${((i / (values.length - 1)) * 60).toFixed(1)},${(18 - ((v - low) / span) * 16).toFixed(1)}`,
    )
    .join(" ");
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "trend");
  svg.setAttribute("viewBox", "0 0 60 20");
  svg.setAttribute("aria-hidden", "true");
  const line = document.createElementNS(SVG, "polyline");
  line.setAttribute("points", points);
  svg.append(line);
  return [svg];
}

/** Why a measure the owner agreed to leave outside its limit is left there, in the bridge's words. */
function reason(m: Metric): HTMLElement[] {
  // RULE: an exempt measure shows its reason and is never marked green
  return m.status === "exempt" ? [el("span", "reason", m.text)] : [];
}

/** How the checks on main ended, in the page's words, however GitHub put it. */
function ended(state: string): string {
  const said = CHECKS[state];
  // RULE: an ending of the checks the page does not know still reads plainly
  return said ? t(said) : t("health.ciOther", { state: state.replaceAll("_", " ") });
}

/** A measure's value in the page's words, read from the data and never from the bridge's wording. */
function valueText(m: Metric): string {
  // RULE: a measure with nothing measured yet says so in the page's language
  if (m.value === null) return t("health.unmeasured");
  if (typeof m.value === "number") return [m.value, m.unit].filter(Boolean).join(" ");
  return m.id === "ci" ? ended(m.value) : m.text;
}

export function measureRow(m: Metric): HTMLElement {
  const key = MEASURES[m.id];
  const link = el("a", "value", valueText(m));
  if (m.url) link.href = m.url;
  link.target = "_blank";
  link.rel = "noopener";
  return el(
    "li",
    `metric status-${m.status}`,
    el("span", "name", key ? t(key) : m.label),
    ...trendLine(m.trend),
    link,
    ...reason(m),
  );
}

const measured = (at: string | null | undefined): HTMLElement[] =>
  at ? [el("span", "measured", t("health.measured", { ago: ago(at) }))] : [];

const measuring = (on: boolean | undefined): HTMLElement[] =>
  on ? [el("span", "refreshing", t("health.refreshing"))] : [];

/** When the bridge measured, and a quiet sign while it measures again. */
function freshness(data: SoftwareHealth): HTMLElement[] {
  if (!data.repos.length)
    return [el("p", "first muted", t(data.refreshing ? "health.first" : "health.none"))];
  const parts = [...measured(data.measured_at), ...measuring(data.refreshing)];
  return parts.length ? [el("p", "freshness muted", ...parts)] : [];
}

export function healthScreen(data: SoftwareHealth | null, act: Actions): HTMLElement {
  return el(
    "section",
    "health",
    button(t("detail.back"), act.closeHealth, "back"),
    el("h2", undefined, t("health.title")),
    ...(data ? freshness(data) : []),
    ...(data
      ? data.repos.map((r) =>
          el(
            "section",
            "repo",
            el("h3", undefined, r.name),
            el("ul", "metrics", ...r.metrics.map(measureRow)),
          ),
        )
      : [el("p", "muted", t("health.loading"))]),
  );
}
