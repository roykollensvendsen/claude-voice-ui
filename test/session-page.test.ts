import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { start } from "../src/app";
import type { SessionDetail } from "../src/bridge";
import { bridge } from "../src/bridge";
import { FakeSource, fakeBridge, longPress, NO_DETAIL, ONE } from "./fakes";

let root: HTMLElement;
let stop: (() => void) | undefined;

const NOW = new Date("2026-11-03T10:00:00Z");
const DETAIL: SessionDetail = {
  ...NO_DETAIL,
  session: "a1",
  number: 1,
  name: "billing-ab",
  context: { used_percentage: 19, as_of: "" },
  tool_calls: { total: 120, by_tool: { Bash: 80, Read: 30, Edit: 6, Write: 4 } },
  subagents: { running: 1, total: 3 },
  timeline: [
    { at: "2026-11-03T09:58:00Z", kind: "pr_opened", text: "#35", url: "https://github.com/o/r/pull/35" },
    { at: "2026-11-03T09:40:00Z", kind: "commit", text: "fix: Keep the totals" },
    { at: null, kind: "prompt", text: "Fix the totals." },
  ],
  summary: "Fixing the totals; one test left.",
  summary_state: "ready",
  summary_at: "2026-11-03T09:30:00Z",
};

async function openPage(detail: SessionDetail = DETAIL) {
  const b = fakeBridge([{ sessions: [ONE], active: null }]);
  b.detail.mockResolvedValue(detail);
  stop = start(root, { bridge: b, openEvents: (url) => new FakeSource(url) });
  await vi.advanceTimersByTimeAsync(0);
  await longPress(root, "a1");
  await vi.advanceTimersByTimeAsync(0);
  return b;
}

const text = (selector: string) => root.querySelector(`.detail ${selector}`)?.textContent ?? "";
const refresh = () => root.querySelector<HTMLButtonElement>(".detail .summary .refresh");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  root = document.createElement("main");
  document.body.replaceChildren(root);
  localStorage.clear();
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
});

describe("what a session's page tells", () => {
  test("the page says how full the context is, how many tools it called, and its helpers", async () => {
    await openPage();
    expect(text(".facts")).toBe("Context 19% · 120 tool calls · 1 of 3 helpers running");
  });

  test("the tools used most are named, the rest counted together", async () => {
    await openPage();
    expect(text(".tools")).toBe("Bash 80 · Read 30 · Edit 6 · 1 other");
  });

  test("the timeline lists what happened, newest first, with a pull request as a link", async () => {
    await openPage();
    const items = [...root.querySelectorAll(".detail .timeline li")].map((li) => li.textContent);
    expect(items).toEqual([
      "2 min agoPull request opened: #35",
      "20 min agoCommit: fix: Keep the totals",
      "You wrote: Fix the totals.",
    ]);
    expect(root.querySelector<HTMLAnchorElement>(".detail .timeline a")?.href).toBe(
      "https://github.com/o/r/pull/35",
    );
  });
});

describe("a summary made only when asked", () => {
  test("the summary is shown with how old it is", async () => {
    await openPage();
    expect(text(".summary p")).toBe("Fixing the totals; one test left.");
    expect(text(".summary .muted")).toBe("Made 30 min ago");
  });

  test("opening the page never asks for a summary", async () => {
    const b = await openPage({ ...DETAIL, summary: null, summary_state: "none", summary_at: null });
    expect(b.summarize).not.toHaveBeenCalled();
    expect(text(".summary")).toContain("No summary yet. Tap ↻ to make one.");
  });

  test("tapping ↻ asks for one in the page's language, and the page says it is being made", async () => {
    localStorage.setItem("cvu.lang", JSON.stringify("nb"));
    const b = await openPage();
    refresh()?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.summarize).toHaveBeenCalledWith("a1", "norsk");
    expect(text(".summary")).toContain("Lager et sammendrag…");
    expect(refresh()?.disabled).toBe(true);
  });

  test("a summary ready on the stream replaces the old one", async () => {
    await openPage({ ...DETAIL, summary_state: "generating" });
    FakeSource.last?.emit("summary", { session: "a1", summary: "All green now.", summary_state: "ready" });
    expect(text(".summary p")).toBe("All green now.");
    expect(refresh()?.disabled).toBe(false);
  });

  test("a failed summary says why and keeps the last good one", async () => {
    await openPage({ ...DETAIL, summary_state: "error", summary_error: "the model was busy" });
    expect(text(".summary p")).toBe("Fixing the totals; one test left.");
    expect(text(".summary .error")).toBe("Could not make a new summary: the model was busy");
  });
});

describe("the bridge's session page calls", () => {
  test("a summary is asked for with a POST naming the language", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 202 }));
    await bridge(fetch).summarize("a 1", "norsk");
    expect(fetch).toHaveBeenCalledWith("/api/v1/sessions/a%201/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: "norsk" }),
    });
  });
});
