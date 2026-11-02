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

async function reopen(b: Bridge) {
  stop?.();
  root.replaceChildren();
  await open(b);
}

const card = (id: string) => root.querySelector<HTMLElement>(`.cards [data-session="${id}"]`);
const inCard = (id: string, selector: string) => card(id)?.querySelector<HTMLElement>(selector) ?? null;
const buttonIn = (id: string, label: string) =>
  [...(card(id)?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find((b) => b.textContent === label);

const GIT = {
  branch: "main",
  commit: { hash: "c423cac", subject: "Journal" },
  dirty: false,
  changed_files: 0,
  tracking: null,
  main: { name: "origin/main", ahead: 0, behind: 6 },
  parent: null,
  checked_at: "",
};

const WAITING = session({
  id: "w",
  name: "world-model",
  status: "waiting",
  question: { text: "Is that within the rule?", options: ["Yes", "No", "Looser"] },
  git: GIT,
});

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement("main");
  document.body.replaceChildren(root);
  localStorage.clear();
  // These tests are about the card list; the grid has its own.
  localStorage.setItem("cvu.view", JSON.stringify("cards"));
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("short cards", () => {
  test("a card is short until opened: its name, its state and one line", async () => {
    await open(fakeBridge([{ sessions: [{ ...ONE, git: GIT }], active: null }]));
    expect(inCard("a1", ".name")?.textContent).toBe("billing-ab");
    expect(inCard("a1", ".state")?.textContent).toContain("Working");
    expect(inCard("a1", ".line")?.textContent).toBe("Fixing totals.");
    expect(inCard("a1", ".git")).toBeNull();
    expect(inCard("a1", ".meta")).toBeNull();
  });

  test("a waiting card shows its question as the one line, without its options", async () => {
    await open(fakeBridge([{ sessions: [WAITING], active: null }]));
    expect(inCard("w", ".line")?.textContent).toBe("Is that within the rule?");
    expect(inCard("w", ".options")).toBeNull();
  });

  test("the arrow opens a card in place without choosing the session", async () => {
    const b = fakeBridge([{ sessions: [WAITING], active: null }]);
    await open(b);
    inCard("w", ".expand")?.click();
    expect(b.choose).not.toHaveBeenCalled();
    expect(root.querySelector(".detail")).toBeNull();
    expect(inCard("w", ".options")?.textContent).toContain("Looser");
    expect(inCard("w", ".git")?.textContent).toContain("↓6 main");
    expect(inCard("w", ".expand")?.getAttribute("aria-expanded")).toBe("true");
    inCard("w", ".expand")?.click();
    expect(inCard("w", ".options")).toBeNull();
  });

  test("a long question is cut short, and Show more shows all of it", async () => {
    const long = "Is that within the rule? ".repeat(20).trim();
    await open(
      fakeBridge([{ sessions: [{ ...WAITING, question: { text: long, options: [] } }], active: null }]),
    );
    inCard("w", ".expand")?.click();
    const shown = () => inCard("w", ".question-text")?.textContent ?? "";
    expect(shown().length).toBeLessThan(long.length);
    expect(shown().endsWith("…")).toBe(true);
    buttonIn("w", "Show more")?.click();
    expect(shown()).toBe(long);
    expect(buttonIn("w", "Show more")).toBeUndefined();
  });

  test("an opened card stays open when the page is opened again", async () => {
    const b = fakeBridge([{ sessions: [WAITING], active: null }]);
    await open(b);
    inCard("w", ".expand")?.click();
    await reopen(b);
    expect(inCard("w", ".options")).not.toBeNull();
  });
});

describe("hiding sessions", () => {
  test("a hidden session leaves the cards and is counted at the bottom", async () => {
    await open(fakeBridge([{ sessions: [ONE, TWO], active: null }]));
    inCard("b2", ".expand")?.click();
    buttonIn("b2", "Hide")?.click();
    expect(card("b2")).toBeNull();
    expect(root.querySelector(".hidden-toggle")?.textContent).toBe("1 hidden session");
  });

  test("a hidden session stays hidden when the page is opened again", async () => {
    const b = fakeBridge([{ sessions: [ONE, TWO], active: null }]);
    await open(b);
    inCard("b2", ".expand")?.click();
    buttonIn("b2", "Hide")?.click();
    await reopen(b);
    expect(card("b2")).toBeNull();
  });

  test("Show again brings a hidden session back", async () => {
    await open(fakeBridge([{ sessions: [ONE, TWO], active: null }]));
    inCard("b2", ".expand")?.click();
    buttonIn("b2", "Hide")?.click();
    root.querySelector<HTMLButtonElement>(".hidden-toggle")?.click();
    expect(root.querySelector(".hidden-list")?.textContent).toContain("docs-cd");
    root.querySelector<HTMLButtonElement>(".hidden-list button")?.click();
    expect(card("b2")).not.toBeNull();
    expect(root.querySelector(".hidden-toggle")).toBeNull();
  });

  test("a hidden session comes back when it starts waiting", async () => {
    await open(fakeBridge([{ sessions: [ONE, TWO], active: null }]));
    inCard("a1", ".expand")?.click();
    buttonIn("a1", "Hide")?.click();
    FakeSource.last?.emit("status", {
      session: "a1",
      name: "billing-ab",
      state: "answer",
      since: "2026-11-02T16:00:00Z",
      doing: "",
      at: "",
    });
    expect(card("a1")).not.toBeNull();
  });

  test("the page works when the browser keeps nothing", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await open(fakeBridge([{ sessions: [ONE, TWO], active: null }]));
    // Nothing kept means the page starts on the grid.
    [...root.querySelectorAll<HTMLButtonElement>(".view-switch button")]
      .find((b) => b.textContent === "Cards")
      ?.click();
    inCard("b2", ".expand")?.click();
    buttonIn("b2", "Hide")?.click();
    expect(card("b2")).toBeNull();
    expect(card("a1")).not.toBeNull();
  });
});
