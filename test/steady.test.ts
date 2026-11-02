import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { start } from "../src/app";
import type { Bridge } from "../src/bridge";
import { FakeSource, fakeBridge, ONE, TWO } from "./fakes";

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
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
});

describe("tiles that hold still under a finger", () => {
  test("the order holds still while a finger is on the screen", async () => {
    await open(fakeBridge([{ sessions: [ONE, TWO], active: null }]));
    expect(order()).toEqual(["a1", "b2"]);
    press("a1");
    twoStartsWaiting();
    expect(order()).toEqual(["a1", "b2"]);
    lift("a1");
    await vi.advanceTimersByTimeAsync(0);
    expect(order()).toEqual(["b2", "a1"]);
  });

  test("a tap that ends on another session than it began on chooses nothing", async () => {
    const b = fakeBridge([{ sessions: [ONE, TWO], active: null }]);
    await open(b);
    await vi.advanceTimersByTimeAsync(2000);
    press("a1");
    tile("b2")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.choose).not.toHaveBeenCalled();
  });

  test("a tap just after the sessions moved chooses nothing", async () => {
    const b = fakeBridge([{ sessions: [ONE, TWO], active: null }]);
    await open(b);
    await vi.advanceTimersByTimeAsync(2000);
    twoStartsWaiting();
    await vi.advanceTimersByTimeAsync(300);
    press("a1");
    lift("a1");
    tile("a1")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.choose).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    press("a1");
    lift("a1");
    tile("a1")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.choose).toHaveBeenCalledWith("a1");
  });
});
