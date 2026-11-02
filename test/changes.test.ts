import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { start } from "../src/app";
import { type Change, parseLog, whatsNew } from "../src/changes";
import { FakeSource, fakeBridge, ONE } from "./fakes";

const LOG = [
  "c3c3c3c\tfeat: Show a faint eye on a session the voice only looked at",
  "b2b2b2b\tfix: Keep labels in the top bar whole",
  "a9a9a9a\ttest: Describe a faint eye, first",
  "d4d4d4d\tdocs: Say how to add a language",
  "e5e5e5e\tfeat!: Drop the old focus line",
  "f6f6f6f\tfeat: Offer a newer build of the page with a small notice",
].join("\n");

describe("the changes between two builds", () => {
  test("only new features and fixes are kept, from the commit messages alone", () => {
    expect(parseLog(LOG).map((c) => [c.kind, c.hash])).toEqual([
      ["feat", "c3c3c3c"],
      ["fix", "b2b2b2b"],
      ["feat", "e5e5e5e"],
      ["feat", "f6f6f6f"],
    ]);
    expect(parseLog(LOG)[2]?.text).toBe("Drop the old focus line");
  });

  test("what is new is everything after the build the phone runs, grouped", () => {
    expect(whatsNew(parseLog(LOG), "e5e5e5e-1793645748421")).toEqual({
      feat: ["Show a faint eye on a session the voice only looked at"],
      fix: ["Keep labels in the top bar whole"],
    });
  });

  test("a build not in the list shows the whole list", () => {
    expect(whatsNew(parseLog(LOG), "0000000-1").feat).toHaveLength(3);
  });
});

let root: HTMLElement;
let stop: (() => void) | undefined;
const reload = vi.fn();
const changes = vi.fn(async (): Promise<Change[]> => parseLog(LOG));

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement("main");
  document.body.replaceChildren(root);
  localStorage.clear();
  reload.mockClear();
  changes.mockClear();
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
});

describe("what's new in the notice", () => {
  test("the list is fetched and shown only when What's new is tapped, and nothing reloads", async () => {
    stop = start(root, {
      bridge: fakeBridge([{ sessions: [ONE], active: null }]),
      openEvents: (url) => new FakeSource(url),
      version: { built: "e5e5e5e-1", latest: async () => "c3c3c3c-2", changes },
      reload,
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(root.querySelector(".whats-new")).toBeNull();
    expect(changes).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>(".whats-new-toggle")?.click();
    await vi.advanceTimersByTimeAsync(0);
    const list = root.querySelector(".whats-new");
    expect([...(list?.querySelectorAll("h3") ?? [])].map((h) => h.textContent)).toEqual(["New", "Fixed"]);
    expect(list?.textContent).toContain("Show a faint eye on a session the voice only looked at");
    expect(list?.textContent).not.toContain("Offer a newer build");
    expect(reload).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>(".whats-new-toggle")?.click();
    expect(root.querySelector(".whats-new")).toBeNull();
  });
});
