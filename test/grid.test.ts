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
const switchTo = (label: string) =>
  [...root.querySelectorAll<HTMLButtonElement>(".view-switch button")].find((b) => b.textContent === label);

const WAITING = session({
  id: "w",
  name: "A session whose name is too long to fit",
  status: "waiting",
  minutes_since_update: 57,
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

describe("the grid of sessions", () => {
  test("the page opens on a grid of small tiles", async () => {
    await open(fakeBridge([{ sessions: [ONE, TWO], active: null }]));
    expect(root.querySelectorAll(".grid .tile")).toHaveLength(2);
    expect(root.querySelector(".cards")).toBeNull();
  });

  test("a tile shows the session's name and its state as a colour and an icon", async () => {
    await open(fakeBridge([{ sessions: [ONE], active: null }]));
    expect(tile("a1")?.querySelector(".name")?.textContent).toBe("billing-ab");
    expect(tile("a1")?.querySelector(".icon")?.textContent).toBe("●");
    expect(tile("a1")?.classList.contains("tone-green")).toBe(true);
    expect(tile("a1")?.getAttribute("title")).toBe("billing-ab: Working – just now");
  });

  test("a waiting tile is marked as waiting and comes first", async () => {
    await open(fakeBridge([{ sessions: [ONE, WAITING], active: null }]));
    const tiles = [...root.querySelectorAll<HTMLElement>(".grid .tile")];
    expect(tiles[0]?.dataset.session).toBe("w");
    expect(tile("w")?.classList.contains("waiting")).toBe(true);
    expect(tile("a1")?.classList.contains("waiting")).toBe(false);
  });

  test("the session the voice is talking to is marked on its tile", async () => {
    await open(fakeBridge([{ sessions: [ONE, TWO], active: null }]));
    FakeSource.last?.emit("focus", { session: "b2", tool: "read_session_output", at: "" });
    expect(tile("b2")?.classList.contains("focus")).toBe(true);
    expect(tile("a1")?.classList.contains("focus")).toBe(false);
  });

  test("tapping a tile chooses the session and opens its page", async () => {
    const b = fakeBridge([{ sessions: [ONE, TWO], active: null }]);
    await open(b);
    tile("b2")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.choose).toHaveBeenCalledWith("b2");
    expect(root.querySelector(".detail h2")?.textContent).toBe("docs-cd");
  });

  test("the switch at the top changes between the grid and the cards", async () => {
    await open(fakeBridge([{ sessions: [ONE], active: null }]));
    expect(switchTo("Grid")?.getAttribute("aria-pressed")).toBe("true");
    switchTo("Cards")?.click();
    expect(root.querySelector(".cards")).not.toBeNull();
    expect(root.querySelector(".grid")).toBeNull();
    switchTo("Grid")?.click();
    expect(root.querySelector(".grid")).not.toBeNull();
  });

  test("the view chosen is remembered", async () => {
    const b = fakeBridge([{ sessions: [ONE], active: null }]);
    await open(b);
    switchTo("Cards")?.click();
    stop?.();
    root.replaceChildren();
    await open(b);
    expect(root.querySelector(".cards")).not.toBeNull();
  });

  test("hidden sessions are left out of the grid too", async () => {
    localStorage.setItem("cvu.hidden", JSON.stringify({ b2: "idle|" }));
    await open(fakeBridge([{ sessions: [ONE, TWO], active: null }]));
    expect(tile("b2")).toBeNull();
    expect(root.querySelector(".hidden-toggle")?.textContent).toBe("1 hidden session");
  });

  test("the legend is closed until its button is tapped", async () => {
    await open(fakeBridge([{ sessions: [ONE], active: null }]));
    expect(root.querySelector(".legend")).toBeNull();
    const button = root.querySelector<HTMLButtonElement>(".legend-toggle");
    expect(button?.getAttribute("aria-label")).toBe("What the colours mean");
    button?.click();
    expect(root.querySelector(".legend")).not.toBeNull();
    root.querySelector<HTMLButtonElement>(".legend-toggle")?.click();
    expect(root.querySelector(".legend")).toBeNull();
  });

  test("the legend explains each state's icon and colour, and the two rings", async () => {
    await open(fakeBridge([{ sessions: [ONE], active: null }]));
    root.querySelector<HTMLButtonElement>(".legend-toggle")?.click();
    const rows = [...root.querySelectorAll<HTMLElement>(".legend li")];
    const text = rows.map((r) => r.textContent);
    expect(rows).toHaveLength(10);
    expect(text).toContain("?Waiting for an answer: it has asked you a question");
    expect(rows.find((r) => r.textContent?.startsWith("!"))?.classList.contains("tone-amber")).toBe(true);
    expect(text).toContain("Blue ring: the voice is talking to it right now");
    expect(text).toContain("White ring: the session the voice talks to, chosen by a tap or by voice");
  });

  test("holding a finger on a tile says its state in plain words, without opening it", async () => {
    const b = fakeBridge([{ sessions: [WAITING], active: null }]);
    await open(b);
    tile("w")?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(500);
    expect(tile("w")?.querySelector(".tip")?.textContent).toBe("Waiting for an answer – 57 minutes");
    tile("w")?.dispatchEvent(new Event("pointerup", { bubbles: true }));
    tile("w")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.choose).not.toHaveBeenCalled();
    expect(root.querySelector(".detail")).toBeNull();
  });

  test("a short tap still opens the session", async () => {
    const b = fakeBridge([{ sessions: [WAITING], active: null }]);
    await open(b);
    tile("w")?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);
    tile("w")?.dispatchEvent(new Event("pointerup", { bubbles: true }));
    tile("w")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.choose).toHaveBeenCalledWith("w");
  });

  test("the words go away by themselves", async () => {
    await open(fakeBridge([{ sessions: [WAITING], active: null }]));
    tile("w")?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(4000);
    expect(tile("w")?.querySelector(".tip")).toBeNull();
  });
});
