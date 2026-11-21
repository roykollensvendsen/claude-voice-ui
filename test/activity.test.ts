import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type Activity, type ActivityNow, type ActivitySeries, type Point, slots } from "../src/activity";
import { start } from "../src/app";
import { Refused } from "../src/bridge";
import { setLanguage } from "../src/i18n";
import { FakeSource, fakeBridge, ONE } from "./fakes";

let root: HTMLElement;
let stop: (() => void) | undefined;

/** Six in the evening in Oslo on 18.11. */
const NOW = "2026-11-18T17:00:00Z";
const at = (minutesAgo: number) => new Date(Date.parse(NOW) - minutesAgo * 60_000).toISOString();

const OFF: Activity = {
  on: false,
  until: null,
  durations: ["1h", "8h", "24h", "7d"],
  scopes: {
    orgs: ["voice", "demo"],
    sessions: [
      { name: "dreame-mcp-work", org: "voice", role: "plugin" },
      { name: "demo-core", org: "demo", role: "contribute" },
    ],
  },
};
/** On until two in the night in Oslo. */
const ON: Activity = { ...OFF, on: true, until: "2026-11-19T01:00:00Z" };

const point = (minutesAgo: number, over: Partial<Point> = {}): Point => ({
  t: at(minutesAgo),
  tok_in: 1200,
  tok_out: 300,
  n_read: 4,
  n_write: 1,
  n_run: 2,
  n_mcp: 0,
  n_agent: 0,
  tool_ms: 30_000,
  cpu_ms: 6000,
  rss_mb_max: 410,
  busy_s: 50,
  idle_s: 10,
  waiting_s: 0,
  ...over,
});

/** The last hour, recorded only for its last forty minutes, with one minute of work in it. */
const SERIES: ActivitySeries = {
  scope: "all",
  window: "1h",
  bucket_s: 60,
  from: at(60),
  to: NOW,
  recording: [{ from: at(40), to: NOW }],
  points: [point(39)],
};

const NOW_ANSWER: ActivityNow = {
  at: NOW,
  sessions: [
    {
      name: "dreame-mcp-work",
      org: "voice",
      role: "plugin",
      status: "busy",
      status_since: at(15),
      call: { kind: "run", tool: "Bash", program: "pytest", started: at(14) },
      turn_started: at(16),
      state: "red",
      cpu_pct: 0.4,
      rss_mb: 380,
      child: { program: "pytest", age_s: 840 },
    },
  ],
};

async function openHealth(answer: Activity | null = ON) {
  const b = fakeBridge([{ sessions: [ONE], active: null }]);
  b.activity.mockResolvedValue(answer);
  b.activitySeries.mockResolvedValue(SERIES);
  b.activityNow.mockResolvedValue(NOW_ANSWER);
  stop = start(root, { bridge: b, openEvents: (url) => new FakeSource(url) });
  await vi.advanceTimersByTimeAsync(0);
  root.querySelector<HTMLButtonElement>("header .menu-toggle")?.click();
  root.querySelector<HTMLButtonElement>(".menu .open-health")?.click();
  await vi.advanceTimersByTimeAsync(0);
  return b;
}

const section = () => root.querySelector<HTMLElement>(".health .activity");
const pick = async (name: string, value: string) => {
  const select = section()?.querySelector<HTMLSelectElement>(`select.${name}`);
  if (!select) throw new Error(`no ${name} picker`);
  select.value = value;
  select.dispatchEvent(new Event("change"));
  await vi.advanceTimersByTimeAsync(0);
};

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

describe("the activity series, bucket by bucket", () => {
  test("a bucket outside every recorded span is a gap, never a zero", () => {
    const row = slots(SERIES);
    expect(row).toHaveLength(60);
    expect(row[0]).toBeNull();
    expect(row[19]).toBeNull();
  });

  test("a recorded bucket with nothing in it counts as zero", () => {
    const row = slots(SERIES);
    expect(row[20]?.tok_in).toBe(0);
    expect(row[21]?.tok_in).toBe(1200);
    expect(row[59]?.busy_s).toBe(0);
  });

  test("a window that ends partway into a bucket keeps that bucket, and no more", () => {
    const later = (seconds: number) => new Date(Date.parse(NOW) + seconds * 1000).toISOString();
    expect(slots({ ...SERIES, to: later(24) })).toHaveLength(61);
    expect(slots({ ...SERIES, to: later(40) })).toHaveLength(61);
    expect(slots({ ...SERIES, to: NOW })).toHaveLength(60);
  });

  test("a bucket that recording covered only part of counts as recorded", () => {
    const half = (minutesAgo: number) => new Date(Date.parse(at(minutesAgo)) + 30_000).toISOString();
    const row = slots({ ...SERIES, points: [], recording: [{ from: half(40), to: half(10) }] });
    expect(row[19]).toBeNull();
    expect(row[20]?.tok_in).toBe(0);
    expect(row[50]?.tok_in).toBe(0);
    expect(row[51]).toBeNull();
  });
});

describe("the activity view on the code-health page", () => {
  test("a bridge without the activity view shows no activity section", async () => {
    await openHealth(null);
    expect(section()).toBeNull();
    expect(root.querySelector(".health h2")).not.toBeNull();
  });

  test("while recording is off the page reads no activity, and offers to switch it on", async () => {
    const b = await openHealth(OFF);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(b.activitySeries).not.toHaveBeenCalled();
    expect(b.activityNow).not.toHaveBeenCalled();
    expect(section()?.querySelector(".switch")?.textContent).toBe("Start recording");
    expect(section()?.querySelector<HTMLSelectElement>("select.for")?.value).toBe("8h");
  });

  test("switching recording on asks the bridge for the chosen time, and says when it stops itself", async () => {
    const b = await openHealth(OFF);
    b.setActivity.mockResolvedValue(ON);
    await pick("for", "24h");
    section()?.querySelector<HTMLButtonElement>(".switch")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.setActivity).toHaveBeenCalledWith({ on: true, for: "24h" });
    expect(section()?.querySelector(".until")?.textContent).toContain("Recording until 02:00");
    expect(b.activitySeries).toHaveBeenCalledWith("all", "1h");
  });

  test("a switch the bridge refuses says why in its words", async () => {
    const b = await openHealth(OFF);
    b.setActivity.mockRejectedValue(new Refused("Only the owner can switch recording."));
    section()?.querySelector<HTMLButtonElement>(".switch")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(section()?.querySelector(".problem")?.textContent).toBe("Only the owner can switch recording.");
  });

  test("recording on, the page draws five charts for all sessions over the last hour", async () => {
    const b = await openHealth();
    expect(b.activitySeries).toHaveBeenCalledWith("all", "1h");
    const charts = section()?.querySelectorAll(".chart") ?? [];
    expect([...charts].map((c) => c.getAttribute("data-chart"))).toEqual([
      "tokens",
      "calls",
      "command",
      "cpu",
      "status",
    ]);
    expect(section()?.querySelectorAll(".chart svg")).toHaveLength(5);
  });

  test("time that was not recorded is drawn as a gap, not as zero", async () => {
    await openHealth();
    const tokens = section()?.querySelector('.chart[data-chart="tokens"]');
    const gaps = tokens?.querySelectorAll("rect.gap") ?? [];
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.getAttribute("width")).toBe("20");
  });

  test("choosing an organisation, a session or a window reads that series", async () => {
    const b = await openHealth();
    await pick("scope", "org:voice");
    expect(b.activitySeries).toHaveBeenLastCalledWith("org:voice", "1h");
    await pick("window", "7d");
    expect(b.activitySeries).toHaveBeenLastCalledWith("org:voice", "7d");
    await pick("scope", "session:demo-core");
    expect(b.activitySeries).toHaveBeenLastCalledWith("session:demo-core", "7d");
    expect(b.activityNow).toHaveBeenLastCalledWith("session:demo-core");
  });

  test("a session stuck in one command is shown red with its program and how long it has run", async () => {
    await openHealth();
    const row = section()?.querySelector('.now li[data-session="dreame-mcp-work"]');
    expect(row?.classList.contains("red")).toBe(true);
    expect(row?.textContent).toContain("pytest");
    expect(row?.textContent).toContain("14 min");
  });

  test("while open and recording, the live list reads every ten seconds and the charts every bucket", async () => {
    const b = await openHealth();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(b.activityNow).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(50_000);
    expect(b.activitySeries).toHaveBeenCalledTimes(2);
  });

  test("closing the code-health page stops every activity read", async () => {
    const b = await openHealth();
    root.querySelector<HTMLButtonElement>(".health .back")?.click();
    await vi.advanceTimersByTimeAsync(0);
    const now = b.activityNow.mock.calls.length;
    const series = b.activitySeries.mock.calls.length;
    await vi.advanceTimersByTimeAsync(300_000);
    expect(b.activityNow).toHaveBeenCalledTimes(now);
    expect(b.activitySeries).toHaveBeenCalledTimes(series);
  });

  test("clearing the recorded activity asks the bridge and reads the charts again", async () => {
    const b = await openHealth();
    section()?.querySelector<HTMLButtonElement>(".clear")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.clearActivity).toHaveBeenCalledOnce();
    expect(b.activitySeries).toHaveBeenCalledTimes(2);
  });

  test("when recording stops itself while the page is open, the section offers the switch again", async () => {
    const b = await openHealth();
    b.activityNow.mockRejectedValue(new Error("the bridge answered 404"));
    b.activity.mockResolvedValue(OFF);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(section()?.querySelector(".switch")?.textContent).toBe("Start recording");
    expect(section()?.querySelector(".problem")).toBeNull();
    const reads = b.activityNow.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(b.activityNow).toHaveBeenCalledTimes(reads);
  });

  test("activity that cannot be read while recording says so in the page's words", async () => {
    const b = await openHealth();
    b.activityNow.mockRejectedValue(new Error("the bridge answered 500"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(section()?.querySelector(".problem")?.textContent).toBe(
      "The activity could not be read just now.",
    );
  });

  test("a slow answer for a scope no longer chosen never replaces the live list", async () => {
    const b = await openHealth();
    let late: (now: ActivityNow) => void = () => {};
    b.activityNow.mockImplementation((scope: string) =>
      scope === "org:voice" ? new Promise((resolve) => (late = resolve)) : Promise.resolve(NOW_ANSWER),
    );
    await pick("scope", "org:voice");
    await pick("scope", "session:demo-core");
    const stale = NOW_ANSWER.sessions.map((s) => ({ ...s, name: "voice-only" }));
    late({ at: NOW, sessions: stale });
    await vi.advanceTimersByTimeAsync(0);
    expect(section()?.querySelector('.now li[data-session="voice-only"]')).toBeNull();
    expect(section()?.querySelector('.now li[data-session="dreame-mcp-work"]')).not.toBeNull();
  });

  test("a read that works again takes away the earlier could-not-be-read", async () => {
    const b = await openHealth();
    b.activityNow.mockRejectedValueOnce(new Error("the bridge answered 500"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(section()?.querySelector(".problem")).not.toBeNull();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(section()?.querySelector(".problem")).toBeNull();
  });

  test("when the time recording was switched on for runs out, the section offers the switch again", async () => {
    const b = await openHealth({ ...ON, until: at(-5) });
    b.activity.mockResolvedValue(OFF);
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 1000);
    expect(section()?.querySelector(".switch")?.textContent).toBe("Start recording");
    const reads = b.activityNow.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(b.activityNow).toHaveBeenCalledTimes(reads);
  });

  test("how long a command has run is counted on the bridge's clock, not the phone's", async () => {
    vi.setSystemTime(Date.parse(NOW) + 30 * 60_000);
    await openHealth();
    const row = section()?.querySelector('.now li[data-session="dreame-mcp-work"]');
    expect(row?.textContent).toContain("pytest 14 min");
    expect(row?.textContent).not.toContain("44 min");
  });

  test("a clear the bridge could not be reached for says so in the page's words", async () => {
    const b = await openHealth();
    b.clearActivity.mockRejectedValue(new TypeError("Failed to fetch"));
    section()?.querySelector<HTMLButtonElement>(".clear")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(section()?.querySelector(".problem")?.textContent).toBe("The bridge did not clear it.");
  });

  test("the activity view is in Norwegian on a Norwegian page", async () => {
    await openHealth();
    setLanguage("nb");
    // The live list's next read draws the page again, now in Norwegian.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(section()?.querySelector(".switch")?.textContent).toBe("Stopp opptak");
  });
});
