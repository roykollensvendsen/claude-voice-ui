import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { start } from "../src/app";
import type { Bridge } from "../src/bridge";
import { FakeSource, fakeBridge, ONE, session, TWO } from "./fakes";

let root: HTMLElement;
let stop: (() => void) | undefined;

async function open(b: Bridge) {
  stop = start(root, { bridge: b, openEvents: (url) => new FakeSource(url) });
  await vi.advanceTimersByTimeAsync(0);
}

const tile = (id: string) => root.querySelector<HTMLElement>(`.grid [data-session="${id}"]`);
const order = () => [...root.querySelectorAll<HTMLElement>(".grid .tile")].map((t) => t.dataset.session);
const press = (id: string) => tile(id)?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
const lift = (id: string) => tile(id)?.dispatchEvent(new Event("pointerup", { bubbles: true }));
// Sessions keep their places, so what moves tiles now is a hidden session coming back when it starts
// waiting: the tiles after it shift along by one.
const THREE = session({ id: "c3", name: "gamma", number: 3 });
const sessions = () => [{ ...ONE, number: 1 }, { ...TWO, number: 2 }, { ...THREE }];
const twoStartsWaiting = () =>
  FakeSource.last?.emit("status", {
    session: "b2",
    name: "docs-cd",
    state: "answer",
    since: "",
    doing: "",
    at: "",
  });

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement("main");
  document.body.replaceChildren(root);
  localStorage.clear();
  localStorage.setItem("cvu.hidden", JSON.stringify({ b2: "idle|" }));
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
});

describe("tiles that hold still under a finger", () => {
  test("the order holds still while a finger is on the screen", async () => {
    await open(fakeBridge([{ sessions: sessions(), active: null }]));
    expect(order()).toEqual(["a1", "c3"]);
    press("c3");
    twoStartsWaiting();
    expect(order()).toEqual(["a1", "c3"]);
    lift("c3");
    await vi.advanceTimersByTimeAsync(600);
    expect(order()).toEqual(["a1", "b2", "c3"]);
  });

  test("a new session joining at the end does not count as a move", async () => {
    const b = fakeBridge([
      { sessions: sessions(), active: null },
      { sessions: [...sessions(), session({ id: "d4", name: "delta", number: 4 })], active: null },
    ]);
    await open(b);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(order()).toEqual(["a1", "c3", "d4"]);
    press("a1");
    lift("a1");
    tile("a1")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.choose).toHaveBeenCalledWith("a1");
  });

  test("a tap that ends on another session than it began on chooses nothing", async () => {
    const b = fakeBridge([{ sessions: sessions(), active: null }]);
    await open(b);
    await vi.advanceTimersByTimeAsync(2000);
    press("a1");
    tile("c3")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.choose).not.toHaveBeenCalled();
  });

  test("a tap just after the sessions moved chooses nothing", async () => {
    const b = fakeBridge([{ sessions: sessions(), active: null }]);
    await open(b);
    await vi.advanceTimersByTimeAsync(2000);
    twoStartsWaiting();
    await vi.advanceTimersByTimeAsync(300);
    press("c3");
    lift("c3");
    tile("c3")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.choose).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    press("c3");
    lift("c3");
    tile("c3")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.choose).toHaveBeenCalledWith("c3");
  });

  test("the order also holds still for a moment after the finger lifts", async () => {
    await open(fakeBridge([{ sessions: sessions(), active: null }]));
    press("c3");
    twoStartsWaiting();
    lift("c3");
    await vi.advanceTimersByTimeAsync(300);
    expect(order()).toEqual(["a1", "c3"]);
    await vi.advanceTimersByTimeAsync(300);
    expect(order()).toEqual(["a1", "b2", "c3"]);
  });
});
