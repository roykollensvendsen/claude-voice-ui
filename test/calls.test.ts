import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { start } from "../src/app";
import type { Call, CallTotals, DayCalls, RecentCalls } from "../src/calls";
import { setLanguage } from "../src/i18n";
import { FakeSource, fakeBridge, ONE } from "./fakes";

let root: HTMLElement;
let stop: (() => void) | undefined;

/** Ten in the morning in Oslo on 17.11, so the map runs from 04.11 to 17.11. */
const NOW = "2026-11-17T09:00:00Z";
const ago = (seconds: number) => new Date(Date.parse(NOW) - seconds * 1000).toISOString();

const TOTALS: CallTotals = {
  today: "2026-11-17",
  rows: [
    { day: "2026-11-16", tool: "ask_active_session", calls: 4, errors: 1, median_ms: 9000, p95_ms: 23000 },
    { day: "2026-11-17", tool: "ask_active_session", calls: 2, errors: 0, median_ms: 8000, p95_ms: 9000 },
    { day: "2026-11-10", tool: "garage_status", calls: 1, errors: 0, median_ms: 300, p95_ms: 300 },
    { day: "2026-11-17", tool: "whats_new", calls: 300, errors: 0, median_ms: 5, p95_ms: 9 },
  ],
  unused: ["tv_power_request"],
};

const call = (over: Partial<Call>): Call => ({
  id: "c1",
  tool: "garage_status",
  source: "voice_app",
  caller: null,
  at: ago(60),
  ended_at: ago(59),
  outcome: "ok",
  error_class: null,
  ms: 300,
  ...over,
});

const RECENT: RecentCalls = { calls: [call({})], running: [] };

async function openHealth(
  over: { totals?: CallTotals | null | Error; recent?: RecentCalls; day?: DayCalls } = {},
) {
  const b = fakeBridge([{ sessions: [ONE], active: null }]);
  const totals = over.totals === undefined ? TOTALS : over.totals;
  if (totals instanceof Error) b.callTotals.mockRejectedValue(totals);
  else b.callTotals.mockResolvedValue(totals);
  b.recentCalls.mockResolvedValue(over.recent ?? RECENT);
  if (over.day) b.dayCalls.mockResolvedValue(over.day);
  stop = start(root, { bridge: b, openEvents: (url) => new FakeSource(url) });
  await vi.advanceTimersByTimeAsync(0);
  root.querySelector<HTMLButtonElement>("header .menu-toggle")?.click();
  root.querySelector<HTMLButtonElement>(".menu .open-health")?.click();
  await vi.advanceTimersByTimeAsync(0);
  return b;
}

const cell = (tool: string, day: string) =>
  root.querySelector<HTMLElement>(`.calls .map .cell[data-tool="${tool}"][data-day="${day}"]`);
const total = (tool: string) => root.querySelector(`.calls .map .total[data-tool="${tool}"]`)?.textContent;
const since = (tool: string) => root.querySelector(`.calls .map .since[data-tool="${tool}"]`)?.textContent;
const strip = () => [...root.querySelectorAll<HTMLElement>(".calls .strip .call")];
const emit = (type: string, data: unknown) => FakeSource.last?.emit(type, data);
const ended = (over: Record<string, unknown>) =>
  emit("call_end", {
    id: "e1",
    tool: "garage_status",
    outcome: "ok",
    error_class: null,
    ms: 120,
    ended_at: NOW,
    ...over,
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  root = document.createElement("main");
  document.body.replaceChildren(root);
  localStorage.clear();
  setLanguage("en");
});

afterEach(() => {
  stop?.();
  stop = undefined;
  setLanguage("en");
  vi.useRealTimers();
});

describe("the voice tools' calls on the code-health page", () => {
  test("opening the page reads the last fourteen Oslo days and the last twenty calls", async () => {
    const b = await openHealth();
    expect(b.callTotals).toHaveBeenCalledWith("2026-11-04", "2026-11-17");
    expect(b.recentCalls).toHaveBeenCalledWith(20);
  });

  test("each tool is a row with a cell for each day and its total", async () => {
    await openHealth();
    expect(cell("ask_active_session", "2026-11-16")?.textContent).toBe("4");
    expect(cell("ask_active_session", "2026-11-15")?.textContent).toBe("");
    expect(total("ask_active_session")).toBe("6");
    expect(root.querySelectorAll('.calls .map .cell[data-tool="garage_status"]')).toHaveLength(14);
  });

  test("a day with failed calls is marked", async () => {
    await openHealth();
    expect(cell("ask_active_session", "2026-11-16")?.classList.contains("has-errors")).toBe(true);
    expect(cell("ask_active_session", "2026-11-17")?.classList.contains("has-errors")).toBe(false);
  });

  test("the tools offered but not called in the fourteen days are named", async () => {
    await openHealth();
    expect(root.querySelector(".calls .unused")?.textContent).toContain("tv_power_request");
  });

  test("a finished call lands in today's cell and the total at once", async () => {
    await openHealth();
    ended({ tool: "ask_active_session" });
    expect(cell("ask_active_session", "2026-11-17")?.textContent).toBe("3");
    expect(total("ask_active_session")).toBe("7");
  });

  test("a call that ends after midnight in Oslo lands on the Oslo day, not the UTC one", async () => {
    await openHealth();
    // 23.30 UTC on 16.11 is half past midnight on 17.11 in Oslo.
    ended({ tool: "ask_active_session", ended_at: "2026-11-16T23:30:00Z" });
    expect(cell("ask_active_session", "2026-11-17")?.textContent).toBe("3");
    expect(cell("ask_active_session", "2026-11-16")?.textContent).toBe("4");
  });

  test("a failed call that lands is marked on its day", async () => {
    await openHealth();
    ended({ tool: "ask_active_session", outcome: "timeout", error_class: "timeout" });
    expect(cell("ask_active_session", "2026-11-17")?.classList.contains("has-errors")).toBe(true);
  });

  test("the colour scale is set as the page opens and held while it stays open", async () => {
    await openHealth();
    const map = root.querySelector<HTMLElement>(".calls .map");
    const scale = map?.dataset.scale;
    const before = cell("ask_active_session", "2026-11-16")?.dataset.level;
    for (let i = 0; i < 50; i += 1) ended({ id: `e${i}`, tool: "garage_status" });
    expect(root.querySelector<HTMLElement>(".calls .map")?.dataset.scale).toBe(scale);
    expect(cell("ask_active_session", "2026-11-16")?.dataset.level).toBe(before);
    expect(Number(cell("garage_status", "2026-11-17")?.dataset.level)).toBeGreaterThan(0);
  });

  test("an empty day has no colour, and a busier day is never paler than a quieter one", async () => {
    await openHealth();
    const level = (tool: string, day: string) => Number(cell(tool, day)?.dataset.level);
    expect(level("garage_status", "2026-11-17")).toBe(0);
    expect(level("garage_status", "2026-11-10")).toBeGreaterThan(0);
    expect(level("whats_new", "2026-11-17")).toBeGreaterThanOrEqual(
      level("ask_active_session", "2026-11-16"),
    );
    expect(level("ask_active_session", "2026-11-16")).toBeGreaterThanOrEqual(
      level("garage_status", "2026-11-10"),
    );
  });

  test("after the stream drops and comes back, the counts are read again but the colours hold", async () => {
    const b = await openHealth();
    const scale = root.querySelector<HTMLElement>(".calls .map")?.dataset.scale;
    b.callTotals.mockResolvedValue({
      ...TOTALS,
      rows: [
        { day: "2026-11-17", tool: "ask_active_session", calls: 9000, errors: 0, median_ms: 1, p95_ms: 1 },
      ],
    });
    FakeSource.last?.onerror?.(new Event("error"));
    FakeSource.last?.onopen?.(new Event("open"));
    await vi.advanceTimersByTimeAsync(0);
    expect(cell("ask_active_session", "2026-11-17")?.textContent).toBe("9000");
    expect(root.querySelector<HTMLElement>(".calls .map")?.dataset.scale).toBe(scale);
  });

  test("opening the page again sets the scale again from what it reads then", async () => {
    const b = await openHealth();
    const first = root.querySelector<HTMLElement>(".calls .map")?.dataset.scale;
    b.callTotals.mockResolvedValue({
      ...TOTALS,
      rows: [{ day: "2026-11-17", tool: "garage_status", calls: 9000, errors: 0, median_ms: 1, p95_ms: 1 }],
    });
    root.querySelector<HTMLButtonElement>(".health .back")?.click();
    root.querySelector<HTMLButtonElement>("header .menu-toggle")?.click();
    root.querySelector<HTMLButtonElement>(".menu .open-health")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector<HTMLElement>(".calls .map")?.dataset.scale).not.toBe(first);
  });

  test("'since opened' counts only the calls that end after the page opened, and Reset starts again", async () => {
    await openHealth();
    expect(since("ask_active_session")).toBe("");
    ended({ id: "e1", tool: "ask_active_session" });
    ended({ id: "e2", tool: "ask_active_session" });
    expect(since("ask_active_session")).toBe("2");
    root.querySelector<HTMLButtonElement>(".calls .reset")?.click();
    expect(since("ask_active_session")).toBe("");
    ended({ id: "e3", tool: "ask_active_session" });
    expect(since("ask_active_session")).toBe("1");
    expect(total("ask_active_session")).toBe("9");
  });

  test("a call to a tool not on the map gets a row of its own", async () => {
    await openHealth();
    ended({ tool: "vacuum_status" });
    expect(cell("vacuum_status", "2026-11-17")?.textContent).toBe("1");
    expect(since("vacuum_status")).toBe("1");
  });
});

describe("the last calls, live", () => {
  test("the last calls are listed, newest first", async () => {
    await openHealth({
      recent: { calls: [call({ id: "new", tool: "tv_status" }), call({ id: "old" })], running: [] },
    });
    expect(strip().map((c) => c.dataset.id)).toEqual(["new", "old"]);
    expect(strip()[0]?.textContent).toContain("tv_status");
  });

  test("a call that begins shows as running, with a timer counting from when it began", async () => {
    await openHealth();
    emit("call_start", {
      id: "c9",
      tool: "ask_active_session",
      source: "voice_app",
      caller: null,
      at: NOW,
    });
    expect(strip()[0]?.dataset.id).toBe("c9");
    expect(strip()[0]?.classList.contains("running")).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(strip()[0]?.querySelector(".took")?.textContent).toBe("3 s");
  });

  test("a call already running when the page opens shows at once, with its time so far", async () => {
    await openHealth({
      recent: {
        calls: [],
        running: [{ id: "r1", tool: "ask_active_session", source: "voice_app", caller: null, at: ago(23) }],
      },
    });
    expect(strip()[0]?.classList.contains("running")).toBe(true);
    expect(strip()[0]?.querySelector(".took")?.textContent).toBe("23 s");
  });

  test("a call that ends takes its running row's place, with how it ended and how long it took", async () => {
    await openHealth();
    emit("call_start", { id: "c9", tool: "ask_active_session", source: "voice_app", caller: null, at: NOW });
    ended({ id: "c9", tool: "ask_active_session", ms: 23400 });
    const rows = strip().filter((c) => c.dataset.id === "c9");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.classList.contains("running")).toBe(false);
    expect(rows[0]?.querySelector(".took")?.textContent).toBe("23.4 s");
    expect(rows[0]?.querySelector(".how")?.textContent).toBe("ok");
  });

  test("the list keeps the twenty newest", async () => {
    await openHealth();
    for (let i = 0; i < 25; i += 1) ended({ id: `e${i}` });
    expect(strip()).toHaveLength(20);
    expect(strip()[0]?.dataset.id).toBe("e24");
  });

  test("the caller a call names is shown", async () => {
    await openHealth({ recent: { calls: [call({ caller: "claude-voice-work" })], running: [] } });
    expect(strip()[0]?.textContent).toContain("claude-voice-work");
  });

  test.each([
    ["timeout", "timed out"],
    ["no_answer", "the device didn't answer"],
    ["refused", "refused"],
    ["bridge_failed", "the bridge failed"],
    ["caller_gone", "the caller stopped waiting"],
  ])("a call that failed with %s says %j", async (code, words) => {
    await openHealth();
    ended({ id: "f1", outcome: "error", error_class: code });
    expect(strip()[0]?.querySelector(".how")?.textContent).toBe(words);
    expect(strip()[0]?.classList.contains("failed")).toBe(true);
  });

  test("a failure the page has no words for still reads plainly", async () => {
    await openHealth();
    ended({ id: "f1", outcome: "error", error_class: "disk_on_fire" });
    expect(strip()[0]?.querySelector(".how")?.textContent).toBe("failed: disk on fire");
  });

  test("a failed call is told in Norwegian on a Norwegian page", async () => {
    await openHealth();
    setLanguage("nb");
    ended({ id: "f1", outcome: "error", error_class: "no_answer" });
    expect(strip()[0]?.querySelector(".how")?.textContent).toBe("enheten svarte ikke");
  });
});

describe("one day's calls to one tool", () => {
  test("tapping a cell shows that day's calls", async () => {
    const b = await openHealth({
      day: {
        day: "2026-11-16",
        tool: "ask_active_session",
        counted_only: false,
        calls: [
          call({ id: "d1", tool: "ask_active_session" }),
          call({ id: "d2", tool: "ask_active_session" }),
        ],
      },
    });
    cell("ask_active_session", "2026-11-16")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.dayCalls).toHaveBeenCalledWith("2026-11-16", "ask_active_session");
    expect(root.querySelectorAll(".calls .day .call")).toHaveLength(2);
  });

  test("a tool that is only counted says so", async () => {
    await openHealth({ day: { day: "2026-11-17", tool: "whats_new", counted_only: true, calls: [] } });
    cell("whats_new", "2026-11-17")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector(".calls .day")?.textContent).toContain("only counted");
  });
});

describe("when the call log cannot be shown", () => {
  test("a bridge without a call log says so", async () => {
    await openHealth({ totals: null });
    expect(root.querySelector(".calls .problem")?.textContent).toBe("The bridge keeps no call log yet.");
  });

  test("a call log that cannot be read says so in plain words, and the measures still show", async () => {
    await openHealth({ totals: new Error("the bridge answered 500") });
    expect(root.querySelector(".calls .problem")?.textContent).toBe(
      "The call log could not be read. Open the page again to try once more.",
    );
    expect(root.querySelector(".health h2")).not.toBeNull();
  });

  test("calls on the stream while the page is closed change nothing and break nothing", async () => {
    const b = fakeBridge([{ sessions: [ONE], active: null }]);
    stop = start(root, { bridge: b, openEvents: (url) => new FakeSource(url) });
    await vi.advanceTimersByTimeAsync(0);
    emit("call_start", { id: "c9", tool: "ask_active_session", source: "voice_app", caller: null, at: NOW });
    ended({ id: "c9" });
    expect(root.querySelector(".calls")).toBeNull();
    expect(b.callTotals).not.toHaveBeenCalled();
  });
});
