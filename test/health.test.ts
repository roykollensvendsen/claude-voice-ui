import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { start } from "../src/app";
import type { Metric, SoftwareHealth } from "../src/bridge";
import { FakeSource, fakeBridge, ONE } from "./fakes";

let root: HTMLElement;
let stop: (() => void) | undefined;

const metric = (m: Partial<Metric>): Metric => ({
  id: "tests",
  label: "Tests",
  value: 353,
  unit: "",
  text: "353 tests pass",
  status: "ok",
  url: "https://github.com/o/ui/blob/main/quality.json",
  trend: [344, 353],
  ...m,
});
const HEALTH: SoftwareHealth = {
  as_of: "",
  repos: [
    {
      name: "claude-voice",
      url: "https://github.com/o/voice",
      as_of: "",
      metrics: [
        metric({ id: "coverage", label: "Test coverage", value: 91.3, unit: "%", trend: [90, 91.3] }),
        metric({
          id: "complexity",
          label: "Most tangled function",
          value: 52,
          text: "52, in server.py",
          status: "bad",
        }),
        metric({ id: "ci", label: "Checks on main", value: "running", status: "unknown", trend: [] }),
      ],
    },
    { name: "claude-voice-ui", url: "https://github.com/o/ui", as_of: "", metrics: [metric({})] },
  ],
};

async function openHealth(health: SoftwareHealth = HEALTH) {
  const b = fakeBridge([{ sessions: [ONE], active: null }]);
  b.health.mockResolvedValue(health);
  stop = start(root, { bridge: b, openEvents: (url) => new FakeSource(url) });
  await vi.advanceTimersByTimeAsync(0);
  root.querySelector<HTMLButtonElement>("header .menu-toggle")?.click();
  root.querySelector<HTMLButtonElement>(".menu .open-health")?.click();
  await vi.advanceTimersByTimeAsync(0);
  return b;
}

const rows = (repo: number) => [...root.querySelectorAll(`.health .repo:nth-of-type(${repo + 1}) .metric`)];

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement("main");
  document.body.replaceChildren(root);
  localStorage.clear();
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
});

describe("how both programs' code is doing", () => {
  test("the menu opens a page with each repository and its measures", async () => {
    const b = await openHealth();
    expect(b.health).toHaveBeenCalledOnce();
    expect([...root.querySelectorAll(".health .repo h3")].map((h) => h.textContent)).toEqual([
      "claude-voice",
      "claude-voice-ui",
    ]);
    expect(root.querySelector(".grid")).toBeNull();
  });

  test("each measure shows its name in the page's language, its value and how it stands", async () => {
    localStorage.setItem("cvu.lang", JSON.stringify("nb"));
    await openHealth();
    const [coverage, complexity] = rows(0);
    expect(coverage?.querySelector(".name")?.textContent).toBe("Testdekning");
    expect(coverage?.querySelector(".value")?.textContent).toBe("91.3 %");
    expect(coverage?.classList.contains("status-ok")).toBe(true);
    expect(complexity?.classList.contains("status-bad")).toBe(true);
  });

  test("the checks on main are told in the page's language, and a unit stands apart from its number", async () => {
    localStorage.setItem("cvu.lang", JSON.stringify("nb"));
    await openHealth({
      ...HEALTH,
      repos: [
        {
          ...HEALTH.repos[0]!,
          metrics: [
            metric({ id: "ci", value: "success", text: "passing" }),
            metric({ id: "test_time", value: 47.7, unit: "s" }),
          ],
        },
      ],
    });
    expect(rows(0).map((r) => r.querySelector(".value")?.textContent)).toEqual(["består", "47.7 s"]);
  });

  test("a measure with a history draws its trend", async () => {
    await openHealth();
    const [coverage, , ci] = rows(0);
    expect(coverage?.querySelector("svg.trend polyline")?.getAttribute("points")).toBeTruthy();
    expect(ci?.querySelector("svg.trend")).toBeNull();
  });

  test("a measure links to where it comes from", async () => {
    await openHealth();
    expect(rows(1)[0]?.querySelector("a")?.getAttribute("href")).toBe(
      "https://github.com/o/ui/blob/main/quality.json",
    );
  });

  test("a measure the page does not know shows the bridge's own words", async () => {
    await openHealth({
      ...HEALTH,
      repos: [{ ...HEALTH.repos[0]!, metrics: [metric({ id: "new", label: "Something new", value: "x" })] }],
    });
    expect(rows(0)[0]?.querySelector(".name")?.textContent).toBe("Something new");
  });

  test("back returns to the sessions", async () => {
    await openHealth();
    root.querySelector<HTMLButtonElement>(".health .back")?.click();
    expect(root.querySelector(".health")).toBeNull();
    expect(root.querySelector(".grid")).not.toBeNull();
  });
});
