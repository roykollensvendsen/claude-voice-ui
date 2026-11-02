import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { start } from "../src/app";
import type { Bridge } from "../src/bridge";
import { FakeSource, fakeBridge, session } from "./fakes";

let root: HTMLElement;
let stop: (() => void) | undefined;

const A = session({ id: "a", name: "alpha", number: 1, status: "busy" });
const B = session({ id: "b", name: "beta", number: 2, status: "idle" });
const C = session({ id: "c", name: "gamma", number: 3, status: "idle" });
const ASKING = session({
  id: "q",
  name: "asker",
  number: 4,
  status: "waiting",
  question: { text: "Which file?", options: [] },
});
const APPROVING = session({ id: "p", name: "approver", number: 5, state: "approval" });

async function open(b: Bridge) {
  stop = start(root, { bridge: b, openEvents: (url) => new FakeSource(url) });
  await vi.advanceTimersByTimeAsync(0);
}

const order = () =>
  [...root.querySelectorAll<HTMLElement>(".grid > *")].map((x) => x.dataset.session ?? "gap");
const waiting = () => root.querySelector<HTMLButtonElement>("header .waiting-count");

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

describe("sessions keep their place", () => {
  test("the page shows the sessions in the order of their numbers", async () => {
    await open(fakeBridge([{ sessions: [C, A, B], active: null }]));
    expect(order()).toEqual(["a", "b", "c"]);
  });

  test("a session that starts waiting stays where it is", async () => {
    await open(fakeBridge([{ sessions: [A, B, C], active: null }]));
    FakeSource.last?.emit("status", {
      session: "c",
      name: "gamma",
      state: "answer",
      previous: "idle",
      since: "",
      doing: "",
      at: "",
    });
    expect(order()).toEqual(["a", "b", "c"]);
  });

  test("a new session goes at the end, even with a lower number", async () => {
    const b = fakeBridge([
      { sessions: [B, C], active: null },
      { sessions: [A, B, C], active: null },
    ]);
    await open(b);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(order()).toEqual(["b", "c", "a"]);
  });

  test("an ended session leaves a gap until the page is opened again", async () => {
    const b = fakeBridge([
      { sessions: [A, B, C], active: null },
      { sessions: [A, C], active: null },
      { sessions: [A, C], active: null },
    ]);
    await open(b);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(order()).toEqual(["a", "gap", "c"]);
    stop?.();
    root.replaceChildren();
    await open(b);
    expect(order()).toEqual(["a", "c"]);
  });

  test("the cards keep the same order as the grid", async () => {
    localStorage.setItem("cvu.view", JSON.stringify("cards"));
    await open(fakeBridge([{ sessions: [C, ASKING, A, B], active: null }]));
    expect(
      [...root.querySelectorAll<HTMLElement>(".cards > [data-session]")].map((x) => x.dataset.session),
    ).toEqual(["a", "b", "c", "q"]);
  });
});

describe("what waits for the owner", () => {
  test("a small yellow count in the top bar says how many questions and approvals wait", async () => {
    await open(fakeBridge([{ sessions: [A, ASKING, APPROVING], active: null }]));
    expect(waiting()?.textContent).toBe("❓2");
    expect(waiting()?.getAttribute("aria-label")).toBe("2 waiting for you");
    const css = readFileSync("src/style.css", "utf8");
    const start = css.indexOf(".waiting-count {");
    expect(css.slice(start, css.indexOf("}", start))).toContain("var(--amber)");
  });

  test("with nothing waiting there is no count", async () => {
    await open(fakeBridge([{ sessions: [A, B], active: null }]));
    expect(waiting()).toBeNull();
  });

  test("a tap opens the page of the first one waiting, with its question, and the next tap the next", async () => {
    const b = fakeBridge([{ sessions: [A, ASKING, APPROVING], active: null }]);
    b.pending.mockResolvedValue({
      waiting: true,
      question: { text: "Which file?", options: [] },
      approvals: [],
    });
    await open(b);
    waiting()?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector(".detail h2")?.textContent).toBe("asker");
    expect(root.querySelector(".detail .pending")?.textContent).toContain("Which file?");
    waiting()?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector(".detail h2")?.textContent).toBe("approver");
    waiting()?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector(".detail h2")?.textContent).toBe("asker");
    expect(b.choose).not.toHaveBeenCalled();
  });
});
