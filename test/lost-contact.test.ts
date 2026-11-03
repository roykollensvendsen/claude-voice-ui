import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { start } from "../src/app";
import { FakeSource, fakeBridge, longPress, ONE, TWO } from "./fakes";

let root: HTMLElement;
let stop: (() => void) | undefined;

async function open(b = fakeBridge([{ sessions: [ONE, TWO], active: null }])) {
  stop = start(root, { bridge: b, openEvents: (url) => new FakeSource(url) });
  await vi.advanceTimersByTimeAsync(0);
  FakeSource.last?.onopen?.(new Event("open"));
  await vi.advanceTimersByTimeAsync(0);
  return b;
}

const lose = () => FakeSource.last?.onerror?.(new Event("error"));
const regain = async () => {
  FakeSource.last?.onopen?.(new Event("open"));
  await vi.advanceTimersByTimeAsync(0);
};
const banner = () => root.querySelector(".lost-contact");
const tiles = () => [...root.querySelectorAll<HTMLElement>(".grid [data-session]")];

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

describe("losing contact with the bridge", () => {
  test("a lost stream shows a banner that says the page is reconnecting", async () => {
    await open();
    expect(banner()).toBeNull();
    lose();
    expect(banner()?.textContent).toBe("Lost contact with the bridge. Reconnecting…");
  });

  test("while contact is lost, every session is shown as stale rather than live", async () => {
    await open();
    lose();
    expect(tiles().map((tile) => tile.classList.contains("stale"))).toEqual([true, true]);
    expect(root.querySelector(".grid")?.getAttribute("aria-busy")).toBe("true");
  });

  test("when contact is back, the banner and the stale look go", async () => {
    await open();
    lose();
    await regain();
    expect(banner()).toBeNull();
    expect(tiles().some((tile) => tile.classList.contains("stale"))).toBe(false);
  });

  test("when contact is back, everything is read again so nothing is missed", async () => {
    const b = await open();
    const before = {
      sessions: b.snapshot.mock.calls.length,
      prompts: b.prompts.mock.calls.length,
      settings: b.settings.mock.calls.length,
    };
    lose();
    await regain();
    expect(b.snapshot.mock.calls.length).toBe(before.sessions + 1);
    expect(b.prompts.mock.calls.length).toBe(before.prompts + 1);
    expect(b.settings.mock.calls.length).toBe(before.settings + 1);
  });

  test("a session's page that is open is read again when contact is back", async () => {
    const b = await open();
    await longPress(root, "a1");
    const before = b.detail.mock.calls.length;
    lose();
    await regain();
    expect(b.detail.mock.calls.length).toBe(before + 1);
  });

  test("the first connection reads nothing twice", async () => {
    const b = await open();
    expect(b.snapshot).toHaveBeenCalledTimes(1);
  });
});
