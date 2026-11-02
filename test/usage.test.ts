import { describe, expect, test } from "vitest";
import { contextTone, planBars, resetsIn, type Usage, voiceLine, warningText } from "../src/usage";

const NOW = Date.parse("2026-11-02T15:00:00Z");

function usage(over: Partial<Usage> = {}): Usage {
  return {
    plan: {
      as_of: "2026-11-02T14:46:45Z",
      label: "includes chat and voice; as of the last answer",
      five_hour: null,
      seven_day: { used_percentage: 41, resets_at: "2026-11-06T04:00:00Z", stale: false },
    },
    warning: null,
    voice: {
      label: "estimate, voice activity via the bridge",
      today: { connections: 0, minutes: 0, tool_calls: 0, chars_out: 0, est_tokens: 0 },
      last_7_days: [],
    },
    ...over,
  };
}

describe("when a limit resets", () => {
  test.each([
    ["2026-11-02T15:42:00Z", "in 42 min"],
    ["2026-11-02T18:10:00Z", "in 3 h 10 min"],
    ["2026-11-06T04:00:00Z", "in 3 d 13 h"],
    ["2026-11-02T14:00:00Z", "now"],
  ])("a reset at %s reads %s", (at, text) => {
    expect(resetsIn(at, NOW)).toBe(text);
  });
});

describe("the plan bars", () => {
  test("a window the plan does not report has no bar", () => {
    const bars = planBars(usage(), NOW);
    expect(bars.map((b) => b.title)).toEqual(["Weekly"]);
    expect(bars[0]).toMatchObject({ percent: 41, note: "resets in 3 d 13 h", stale: false });
  });

  test("both windows give two bars, the five-hour one first", () => {
    const u = usage();
    if (!u.plan) throw new Error("no plan");
    u.plan.five_hour = { used_percentage: 12, resets_at: "2026-11-02T17:00:00Z", stale: false };
    expect(planBars(u, NOW).map((b) => b.title)).toEqual(["5 hours", "Weekly"]);
  });

  test("a figure past its reset is marked as old", () => {
    const u = usage();
    if (!u.plan?.seven_day) throw new Error("no plan");
    u.plan.seven_day.stale = true;
    expect(planBars(u, NOW)[0]).toMatchObject({ stale: true, note: "old figure" });
  });

  test("a bar never draws past full", () => {
    const u = usage();
    if (!u.plan?.seven_day) throw new Error("no plan");
    u.plan.seven_day.used_percentage = 130;
    expect(planBars(u, NOW)[0]?.percent).toBe(100);
  });

  test("no plan figures give no bars", () => {
    expect(planBars(usage({ plan: null }), NOW)).toEqual([]);
  });
});

describe("the warning near the limit", () => {
  test("no warning, no text", () => {
    expect(warningText(usage())).toBeNull();
  });

  test("a warning says how close the plan is", () => {
    const w = warningText(usage({ warning: { status: "allowed_warning", used_percentage: 85, at: "" } }));
    expect(w).toEqual({ text: "Close to the plan's limit: 85% used", severity: "warn" });
  });

  test("a reached limit says so", () => {
    const w = warningText(usage({ warning: { status: "rejected", used_percentage: 100, at: "" } }));
    expect(w).toEqual({ text: "The plan's limit is reached", severity: "stop" });
  });
});

describe("the voice estimate", () => {
  test("today's voice activity reads as one line, rounded", () => {
    const u = usage();
    u.voice.today = { connections: 3, minutes: 12, tool_calls: 41, chars_out: 21_000, est_tokens: 5_250 };
    expect(voiceLine(u)).toBe("3 conversations · 12 min · 41 tool calls · ~5.3k tokens");
  });

  test("one conversation is not plural", () => {
    const u = usage();
    u.voice.today = { connections: 1, minutes: 1, tool_calls: 1, chars_out: 400, est_tokens: 100 };
    expect(voiceLine(u)).toBe("1 conversation · 1 min · 1 tool call · ~100 tokens");
  });

  test("no voice today says so", () => {
    expect(voiceLine(usage())).toBe("No voice activity today");
  });
});

describe("how full a session's context is", () => {
  test.each([
    [10, "ok"],
    [79, "ok"],
    [80, "warn"],
    [94, "warn"],
    [95, "full"],
  ])("%i%% is %s", (percent, tone) => {
    expect(contextTone(percent)).toBe(tone);
  });
});
