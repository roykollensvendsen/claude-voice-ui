import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { start } from "../src/app";
import type { Bridge } from "../src/bridge";
import { FakeSource, fakeBridge, longPress, ONE, TWO } from "./fakes";

let root: HTMLElement;
let stop: (() => void) | undefined;

const URL_ONE = "https://claude.ai/code/session_01Example";
const LINKED = { ...ONE, app_url: URL_ONE };
const UNLINKED = { ...TWO, app_url: null };

async function open(b: Bridge) {
  stop = start(root, { bridge: b, openEvents: (url) => new FakeSource(url) });
  await vi.advanceTimersByTimeAsync(0);
}

const tile = (id: string) => root.querySelector<HTMLElement>(`.grid [data-session="${id}"]`);

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

describe("opening a session in the Claude app", () => {
  test("a tile for a session the app can open has a small link to it in its corner", async () => {
    await open(fakeBridge([{ sessions: [LINKED, UNLINKED], active: null }]));
    const link = tile("a1")?.querySelector<HTMLAnchorElement>("a.open-claude");
    expect(link?.getAttribute("href")).toBe(URL_ONE);
    expect(link?.getAttribute("aria-label")).toBe("Open billing-ab in Claude");
  });

  test("a session the app cannot open has no link", async () => {
    await open(fakeBridge([{ sessions: [LINKED, UNLINKED], active: null }]));
    expect(tile("b2")?.querySelector("a.open-claude")).toBeNull();
  });

  test("following the link does not choose the session", async () => {
    const b = fakeBridge([{ sessions: [LINKED], active: null }]);
    await open(b);
    const link = tile("a1")?.querySelector<HTMLAnchorElement>("a.open-claude");
    link?.addEventListener("click", (e) => e.preventDefault());
    link?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.choose).not.toHaveBeenCalled();
  });

  test("the session's page has an Open in Claude button", async () => {
    await open(fakeBridge([{ sessions: [LINKED], active: null }]));
    await longPress(root, "a1");
    await vi.advanceTimersByTimeAsync(0);
    const link = root.querySelector<HTMLAnchorElement>(".detail a.open-claude");
    expect(link?.textContent).toBe("Open in Claude");
    expect(link?.getAttribute("href")).toBe(URL_ONE);
  });

  test("an opened card has the same button", async () => {
    localStorage.setItem("cvu.view", JSON.stringify("cards"));
    await open(fakeBridge([{ sessions: [LINKED], active: null }]));
    root.querySelector<HTMLButtonElement>('[data-session="a1"] .expand')?.click();
    expect(root.querySelector('[data-session="a1"] a.open-claude')?.textContent).toBe("Open in Claude");
  });
});
