// How both programs' code is doing, measure by measure.
import { type Metric, type SoftwareHealth } from "../bridge";
import { type Key, t } from "../i18n";
import { button, el } from "../view/dom";
import { type Actions } from "../view/types";

export const MEASURES: Record<string, Key> = {
  coverage: "health.coverage",
  mutation: "health.mutation",
  tests: "health.tests",
  problems: "health.problems",
  cycles: "health.cycles",
  complexity: "health.complexity",
  test_time: "health.testTime",
  ci: "health.ci",
};

/** The checks on main, as GitHub states them. */
export const CHECKS: Record<string, Key> = {
  success: "health.ciPassing",
  failure: "health.ciFailing",
  running: "health.ciRunning",
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

export function measureRow(m: Metric): HTMLElement {
  const key = MEASURES[m.id];
  const said = CHECKS[String(m.value)];
  const value =
    typeof m.value === "number" ? [m.value, m.unit].filter(Boolean).join(" ") : said ? t(said) : m.text;
  const link = el("a", "value", value);
  link.href = m.url;
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

export function healthScreen(data: SoftwareHealth | null, act: Actions): HTMLElement {
  return el(
    "section",
    "health",
    button(t("detail.back"), act.closeHealth, "back"),
    el("h2", undefined, t("health.title")),
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
