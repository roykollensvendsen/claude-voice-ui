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

  // Every measure the bridge sends, by id, with the English label it sends along.
  const FROM_THE_BRIDGE: Record<string, string> = {
    coverage: "Test coverage",
    mutation: "Rules proven by a test",
    tests: "Tests",
    problems: "Lint and type errors",
    cycles: "Import cycles",
    layers: "Modules in their layers",
    duplication: "Copied code",
    complexity: "Most tangled function",
    test_time: "Time the tests take",
    ci: "Checks on main",
  };

  test("every measure the bridge sends is named in the page's language", async () => {
    localStorage.setItem("cvu.lang", JSON.stringify("nb"));
    await openHealth({
      ...HEALTH,
      repos: [
        {
          ...HEALTH.repos[0]!,
          metrics: Object.entries(FROM_THE_BRIDGE).map(([id, label]) => metric({ id, label })),
        },
      ],
    });
    const named = rows(0).map((r) => r.querySelector(".name")?.textContent);
    expect(named.filter((name) => Object.values(FROM_THE_BRIDGE).includes(name ?? ""))).toEqual([]);
    expect(named).toContain("Regler bevist av en test (mutasjonstester)");
  });

  test("checks on main that are still queued or in progress are told as running", async () => {
    localStorage.setItem("cvu.lang", JSON.stringify("nb"));
    await openHealth({
      ...HEALTH,
      repos: [
        {
          ...HEALTH.repos[0]!,
          metrics: [
            metric({ id: "ci", value: "in_progress", text: "running" }),
            metric({ id: "ci", value: "queued", text: "running" }),
          ],
        },
      ],
    });
    expect(rows(0).map((r) => r.querySelector(".value")?.textContent)).toEqual(["kjører", "kjører"]);
  });

  const valuesOf = async (metrics: Metric[]) => {
    localStorage.setItem("cvu.lang", JSON.stringify("nb"));
    await openHealth({ ...HEALTH, repos: [{ ...HEALTH.repos[0]!, metrics }] });
    return rows(0).map((r) => r.querySelector(".value")?.textContent);
  };

  test("a measure with nothing measured yet says so in the page's language", async () => {
    const unmeasured: Partial<Metric> = {
      value: null,
      status: "unknown",
      text: "Nothing measured yet",
      trend: [],
    };
    expect(
      await valuesOf([
        metric({ id: "coverage", ...unmeasured }),
        metric({ id: "ci", ...unmeasured, text: "not known" }),
      ]),
    ).toEqual(["ikke målt ennå", "ikke målt ennå"]);
  });

  test("every way GitHub can end the checks on main is told in the page's language", async () => {
    const ends = [
      "cancelled",
      "skipped",
      "timed_out",
      "startup_failure",
      "action_required",
      "neutral",
      "stale",
    ];
    const told = await valuesOf(ends.map((value) => metric({ id: "ci", value, text: value, status: "bad" })));
    expect(told).toEqual([
      "avbrutt",
      "hoppet over",
      "tidsavbrutt",
      "feiler",
      "venter på godkjenning",
      "ferdig uten dom",
      "utdatert",
    ]);
  });

  test("an ending of the checks the page does not know still reads plainly", async () => {
    expect(
      await valuesOf([metric({ id: "ci", value: "brand_new_end", text: "brand_new_end", status: "bad" })]),
    ).toEqual(["avsluttet: brand new end"]);
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

  test("an exempt measure shows its reason and is never marked green", async () => {
    const text = "22, in tools.py; exempt: the tool table is one long match";
    await openHealth({
      ...HEALTH,
      repos: [
        { ...HEALTH.repos[0]!, metrics: [metric({ id: "complexity", value: 22, text, status: "exempt" })] },
      ],
    });
    const [row] = rows(0);
    expect(row?.classList.contains("status-exempt")).toBe(true);
    expect(row?.classList.contains("status-ok")).toBe(false);
    expect(row?.querySelector(".reason")?.textContent).toBe(text);
    stop?.();
    await openHealth();
    expect(rows(0)[0]?.querySelector(".reason")).toBeNull();
  });

  test("back returns to the sessions", async () => {
    await openHealth();
    root.querySelector<HTMLButtonElement>(".health .back")?.click();
    expect(root.querySelector(".health")).toBeNull();
    expect(root.querySelector(".grid")).not.toBeNull();
  });
});

describe("the measures the bridge keeps", () => {
  const NOW = Date.parse("2026-11-10T12:00:00Z");
  const kept = (over: Partial<SoftwareHealth>): SoftwareHealth => ({
    ...HEALTH,
    measured_at: "2026-11-10T11:50:00Z",
    refreshing: false,
    ...over,
  });

  beforeEach(() => vi.setSystemTime(NOW));

  test("the measures show at once with how long ago they were measured", async () => {
    await openHealth(kept({}));
    expect(root.querySelector(".health .measured")?.textContent).toBe("Measured 10 min ago");
    expect(rows(0).length).toBe(3);
    expect(root.querySelector(".health .refreshing")).toBeNull();
  });

  test("while the bridge measures again, a quiet sign says so and the page looks again", async () => {
    const b = await openHealth(kept({ refreshing: true }));
    expect(root.querySelector(".health .refreshing")?.textContent).toBe("Measuring again…");
    b.health.mockResolvedValue(kept({ measured_at: "2026-11-10T12:00:00Z", refreshing: false }));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(b.health).toHaveBeenCalledTimes(2);
    expect(root.querySelector(".health .measured")?.textContent).toBe("Measured just now");
    expect(root.querySelector(".health .refreshing")).toBeNull();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(b.health).toHaveBeenCalledTimes(2);
  });

  test("before anything is measured, the page says it is measuring for the first time", async () => {
    await openHealth({ as_of: "", repos: [], measured_at: null, refreshing: true });
    expect(root.querySelector(".health .first")?.textContent).toBe("Measuring for the first time…");
  });

  test("with nothing measured and nothing under way, the page says there are no measures yet", async () => {
    const b = await openHealth({ as_of: "", repos: [], measured_at: null, refreshing: false });
    expect(root.querySelector(".health .first")?.textContent).toBe("No measures yet");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(b.health).toHaveBeenCalledOnce();
  });

  test("the code-health page looks again only while it is open and the bridge is measuring", async () => {
    const b = await openHealth(kept({ refreshing: true }));
    root.querySelector<HTMLButtonElement>(".health .back")?.click();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(b.health).toHaveBeenCalledOnce();
  });

  test("a bridge that does not say when it measured shows the measures as before", async () => {
    await openHealth();
    expect(root.querySelector(".health .measured")).toBeNull();
    expect(rows(0).length).toBe(3);
  });
});
