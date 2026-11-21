// The menu opens the team's shared work board, when the bridge's settings name one.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { start } from "../src/app";
import type { Work } from "../src/bridge";
import { setLanguage } from "../src/i18n";
import { FakeSource, fakeBridge, ONE } from "./fakes";

const BOARD = "https://github.com/users/demo/projects/1";

let root: HTMLElement;
let stop: (() => void) | undefined;

const work = (over: Partial<Work> = {}): Work => ({
  as_of: "2026-11-22T10:00:00Z",
  waiting_on_owner: [],
  open_prs: [],
  ...over,
});

async function openMenu(answer: Work | null) {
  const b = fakeBridge([{ sessions: [ONE], active: null }]);
  b.work.mockResolvedValue(answer);
  stop = start(root, { bridge: b, openEvents: (url) => new FakeSource(url) });
  await vi.advanceTimersByTimeAsync(0);
  root.querySelector<HTMLButtonElement>("header .menu-toggle")?.click();
  await vi.advanceTimersByTimeAsync(0);
}

const board = () => root.querySelector<HTMLAnchorElement>(".menu a.open-board");

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement("main");
  document.body.replaceChildren(root);
  localStorage.clear();
  setLanguage("en");
});

afterEach(() => {
  stop?.();
  stop = undefined;
  setLanguage("en");
  vi.useRealTimers();
});

describe("the team's work board", () => {
  test("the menu opens the work board the bridge names, in a new tab", async () => {
    await openMenu(work({ board_url: BOARD }));
    expect(board()?.href).toBe(BOARD);
    expect(board()?.target).toBe("_blank");
    expect(board()?.rel).toBe("noopener");
    expect(board()?.textContent).toBe("Work board");
  });

  test.each([
    ["an older bridge", work()],
    ["no board set up", work({ board_url: null })],
    ["no work at all", null],
  ])("with %s the menu has no work board", async (_what, answer) => {
    await openMenu(answer);
    expect(root.querySelector(".menu")).not.toBeNull();
    expect(board()).toBeNull();
  });

  test("only an https work board address is linked", async () => {
    for (const address of ["javascript:alert(1)", "http://github.com/users/demo/projects/1", "not a url"]) {
      await openMenu(work({ board_url: address }));
      expect(board(), address).toBeNull();
      stop?.();
      root.replaceChildren();
    }
  });
});
