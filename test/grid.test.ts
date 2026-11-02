import { readFileSync } from "node:fs";
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
    expect(tile("a1")?.getAttribute("title")).toBe("billing-ab: Working");
  });

  test("a tile's name is never cut off: a long one wraps over as many lines as it needs", () => {
    const css = readFileSync("src/style.css", "utf8");
    const start = css.indexOf(".tile .name {");
    const rule = css.slice(start, css.indexOf("}", start));
    expect(rule).not.toContain("line-clamp");
    expect(rule).not.toContain("text-overflow");
    expect(rule).toContain("overflow-wrap: anywhere");
  });

  test("a tile shows the session's short number, to say to the voice", async () => {
    await open(fakeBridge([{ sessions: [{ ...ONE, number: 3 }, TWO], active: null }]));
    expect(tile("a1")?.querySelector(".number")?.textContent).toBe("3");
    expect(tile("a1")?.getAttribute("title")).toBe("3 billing-ab: Working");
    expect(tile("b2")?.querySelector(".number")).toBeNull();
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
    expect(tile("b2")?.querySelector(".mic")?.textContent).toBe("💬");
    expect(tile("a1")?.classList.contains("focus")).toBe(false);
    expect(tile("a1")?.querySelector(".mic")).toBeNull();
  });

  test("one tap on a tile makes it the session the voice talks to, and stays on the tiles", async () => {
    const b = fakeBridge([{ sessions: [ONE, TWO], active: null }]);
    await open(b);
    tile("b2")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.choose).toHaveBeenCalledWith("b2");
    expect(root.querySelector(".detail")).toBeNull();
    expect(tile("b2")?.classList.contains("active")).toBe(true);
  });

  test("a tap is confirmed with a short flash and a buzz", async () => {
    const buzz = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", { value: buzz, configurable: true });
    await open(fakeBridge([{ sessions: [ONE, TWO], active: null }]));
    tile("b2")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(tile("b2")?.classList.contains("picked")).toBe(true);
    expect(buzz).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(tile("b2")?.classList.contains("picked")).toBe(false);
  });

  test("a long press opens the session's page without choosing it", async () => {
    const b = fakeBridge([{ sessions: [WAITING], active: null }]);
    await open(b);
    tile("w")?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(500);
    document.dispatchEvent(new Event("pointerup", { bubbles: true }));
    root.querySelector<HTMLElement>('[data-session="w"]')?.click();
    await vi.advanceTimersByTimeAsync(500);
    expect(root.querySelector(".detail h2")?.textContent).toBe("A session whose name is too long to fit");
    expect(b.choose).not.toHaveBeenCalled();
  });

  test("a tile has no arrow: a long press is the way into a session's page", async () => {
    await open(fakeBridge([{ sessions: [ONE, TWO], active: null }]));
    expect(root.querySelector(".grid .open-detail")).toBeNull();
    expect(tile("b2")?.textContent).not.toContain("›");
  });

  test("a terminal session carries a small >_ and a background one carries nothing", async () => {
    await open(
      fakeBridge([
        {
          sessions: [
            { ...ONE, kind: "terminal" },
            { ...TWO, kind: "background" },
          ],
          active: null,
        },
      ]),
    );
    expect(tile("a1")?.querySelector(".kind")?.textContent).toBe(">_");
    expect(tile("b2")?.querySelector(".kind")).toBeNull();
  });

  test("when the voice only looks at a session, its tile shows a faint eye and no speech bubble", async () => {
    await open(fakeBridge([{ sessions: [ONE, TWO], active: null }]));
    FakeSource.last?.emit("peek", { session: "docs-cd", tool: "side_question", at: "" });
    expect(tile("b2")?.querySelector(".peek")?.textContent).toBe("👁");
    expect(tile("b2")?.querySelector(".mic")).toBeNull();
    expect(tile("b2")?.classList.contains("focus")).toBe(false);
    expect(tile("a1")?.querySelector(".peek")).toBeNull();
  });

  test("the eye fades away after two minutes", async () => {
    await open(fakeBridge([{ sessions: [ONE, TWO], active: null }]));
    FakeSource.last?.emit("peek", { session: "b2", tool: "read_session_output", at: "" });
    await vi.advanceTimersByTimeAsync(2 * 60_000 - 1000);
    expect(tile("b2")?.querySelector(".peek")).not.toBeNull();
    await vi.advanceTimersByTimeAsync(2000);
    expect(tile("b2")?.querySelector(".peek")).toBeNull();
  });

  test("several sessions looked at each keep their own eye", async () => {
    await open(fakeBridge([{ sessions: [ONE, TWO], active: null }]));
    FakeSource.last?.emit("peek", { session: "a1", tool: "digest_session", at: "" });
    await vi.advanceTimersByTimeAsync(60_000);
    FakeSource.last?.emit("peek", { session: "b2", tool: "digest_session", at: "" });
    await vi.advanceTimersByTimeAsync(61_000);
    expect(tile("a1")?.querySelector(".peek")).toBeNull();
    expect(tile("b2")?.querySelector(".peek")).not.toBeNull();
  });

  test("a session both chosen and talking now shows both marks", async () => {
    await open(
      fakeBridge([
        {
          sessions: [ONE, TWO],
          active: { id: "b2", name: "docs-cd", kind: "terminal", set_by: "page", set_at: "" },
        },
      ]),
    );
    FakeSource.last?.emit("focus", { session: "b2", tool: "ask_active_session", at: "" });
    expect(tile("b2")?.classList.contains("focus")).toBe(true);
    expect(tile("b2")?.classList.contains("active")).toBe(true);
    expect(tile("b2")?.querySelector(".pin")).not.toBeNull();
    expect(tile("a1")?.querySelector(".pin")).toBeNull();
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
    expect(rows).toHaveLength(12);
    expect(text).toContain(">_: a session in a terminal window; one without it runs in the background");
    expect(text).toContain("?Waiting for an answer: it has asked you a question");
    expect(rows.find((r) => r.textContent?.startsWith("!"))?.classList.contains("tone-amber")).toBe(true);
    expect(text).toContain("White dot and ring: the session the voice talks to, chosen by a tap or by voice");
    expect(text).toContain(
      "💬 and a blue ring: the voice is talking to it right now; with a white dot, it is also the chosen one",
    );
    expect(text).toContain(
      "👁: the voice only looked at it or talked about it, without writing to it; fades after two minutes",
    );
  });
});
