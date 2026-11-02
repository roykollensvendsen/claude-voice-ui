import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { start } from "../src/app";
import type { Bridge, Output } from "../src/bridge";
import { FakeSource, fakeBridge, ONE, session, TWO } from "./fakes";

let root: HTMLElement;
let stop: () => void;

async function open(b: Bridge) {
  stop = start(root, { bridge: b, openEvents: (url) => new FakeSource(url) });
  await vi.advanceTimersByTimeAsync(0);
}

const settle = () => vi.advanceTimersByTimeAsync(0);
const text = (selector: string) => root.querySelector(selector)?.textContent ?? "";

const OUTPUT: Output = {
  status: "busy",
  turns: [
    { index: 7, role: "user", text: "Fix the totals.", cut: false, length: 15 },
    { index: 8, role: "assistant", text: "Fixed; the tests pass.", cut: false, length: 22 },
  ],
  next_after: 8,
  turns_left: 0,
};

async function openDetail(b = fakeBridge([{ sessions: [ONE, TWO], active: null }])) {
  b.output.mockResolvedValue(OUTPUT);
  await open(b);
  root.querySelector<HTMLButtonElement>('[data-session="a1"]')?.click();
  await settle();
  return b;
}

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement("main");
  document.body.replaceChildren(root);
  FakeSource.last = undefined;
});

afterEach(() => {
  stop?.();
  vi.useRealTimers();
});

describe("one session's page", () => {
  test("tapping a card opens that session's page and makes it the one the voice talks to", async () => {
    const b = await openDetail();
    expect(b.choose).toHaveBeenCalledWith("a1");
    expect(text(".detail h2")).toBe("billing-ab");
    expect(root.querySelector(".cards")).toBeNull();
  });

  test("the page shows the session's latest turns, who said each", async () => {
    const b = await openDetail();
    expect(b.output).toHaveBeenCalledWith("a1", undefined);
    const turns = [...root.querySelectorAll(".turn")].map((t) => t.textContent);
    expect(turns).toEqual(["YouFix the totals.", "ClaudeFixed; the tests pass."]);
  });

  test("a turn cut short says how long it really is", async () => {
    const b = fakeBridge([{ sessions: [ONE], active: null }]);
    await open(b);
    b.output.mockResolvedValue({
      ...OUTPUT,
      turns: [{ index: 1, role: "assistant", text: "Long…", cut: true, length: 4200 }],
    });
    root.querySelector<HTMLButtonElement>('[data-session="a1"]')?.click();
    await settle();
    expect(text(".turn .cut")).toBe("cut short; 4200 characters in all");
  });

  test("a new turn announced on the stream is fetched after the last one shown", async () => {
    const b = await openDetail();
    b.output.mockResolvedValue({
      status: "busy",
      turns: [{ index: 9, role: "assistant", text: "Pushed the branch.", cut: false, length: 18 }],
      next_after: 9,
      turns_left: 0,
    });
    FakeSource.last?.emit("output", { session: "a1", index: 9, role: "assistant" });
    await settle();
    expect(b.output).toHaveBeenLastCalledWith("a1", 8);
    expect(root.querySelectorAll(".turn")).toHaveLength(3);
    expect(text(".turn:last-child")).toContain("Pushed the branch.");
  });

  test("a new turn in another session leaves this page alone", async () => {
    const b = await openDetail();
    const calls = b.output.mock.calls.length;
    FakeSource.last?.emit("output", { session: "b2", index: 3, role: "assistant" });
    await settle();
    expect(b.output.mock.calls.length).toBe(calls);
  });

  test("a question it waits on shows with its options", async () => {
    const b = fakeBridge([{ sessions: [ONE], active: null }]);
    b.pending.mockResolvedValue({
      waiting: true,
      question: { text: "Which file?", options: ["a.py", "b.py"] },
      approvals: [],
    });
    await open(b);
    root.querySelector<HTMLButtonElement>('[data-session="a1"]')?.click();
    await settle();
    expect(text(".pending")).toContain("Which file?");
    expect(text(".pending")).toContain("b.py");
  });

  test("an approval it waits on is shown, to be answered by voice or at the screen", async () => {
    const b = fakeBridge([{ sessions: [ONE], active: null }]);
    b.pending.mockResolvedValue({
      waiting: true,
      question: null,
      approvals: [{ id: "ap1", number: 2, tool: "Bash", summary: "npm test" }],
    });
    await open(b);
    root.querySelector<HTMLButtonElement>('[data-session="a1"]')?.click();
    await settle();
    expect(text(".pending")).toContain("Approval 2: Bash npm test");
    expect(text(".pending")).toContain("Answer by voice or at the screen.");
    expect(root.querySelector(".pending button")).toBeNull();
  });

  test("the project's open pull requests are listed as links", async () => {
    const b = fakeBridge([{ sessions: [ONE], active: null }]);
    b.prs.mockResolvedValue({
      prs: [{ number: 52, title: "Git status", url: "https://github.com/x/y/pull/52", draft: true }],
    });
    await open(b);
    root.querySelector<HTMLButtonElement>('[data-session="a1"]')?.click();
    await settle();
    const link = root.querySelector<HTMLAnchorElement>(".prs a");
    expect(link?.textContent).toBe("#52 Git status (draft)");
    expect(link?.getAttribute("href")).toBe("https://github.com/x/y/pull/52");
  });

  test("a change of state for the open session reads what it waits for again", async () => {
    const b = await openDetail();
    const calls = b.pending.mock.calls.length;
    FakeSource.last?.emit("status", {
      session: "a1",
      name: "billing-ab",
      state: "answer",
      since: "",
      doing: "",
      at: "",
    });
    await settle();
    expect(b.pending.mock.calls.length).toBe(calls + 1);
  });

  test("the back button returns to the cards", async () => {
    await openDetail();
    root.querySelector<HTMLButtonElement>(".detail .back")?.click();
    expect(root.querySelector(".cards")).not.toBeNull();
    expect(root.querySelector(".detail")).toBeNull();
  });

  test("the cards keep updating behind the page", async () => {
    await openDetail();
    FakeSource.last?.emit("status", {
      session: "b2",
      name: "docs-cd",
      state: "working",
      since: "",
      doing: "",
      at: "",
    });
    root.querySelector<HTMLButtonElement>(".detail .back")?.click();
    expect(root.querySelector<HTMLElement>('[data-session="b2"]')?.dataset.state).toBe("working");
  });

  test("a session that is gone from the list says so on its page", async () => {
    const b = fakeBridge([
      { sessions: [ONE], active: null },
      { sessions: [session({ id: "zz" })], active: null },
    ]);
    await openDetail(b);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(text(".detail")).toContain("This session is no longer running.");
  });
});
