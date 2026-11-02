import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { start } from "../src/app";
import { FakeSource, fakeBridge, ONE } from "./fakes";

let root: HTMLElement;
let stop: (() => void) | undefined;
const reload = vi.fn();

async function open(latest: () => Promise<string>) {
  stop = start(root, {
    bridge: fakeBridge([{ sessions: [ONE], active: null }]),
    openEvents: (url) => new FakeSource(url),
    version: { built: "build-1", latest },
    reload,
  });
  await vi.advanceTimersByTimeAsync(0);
}

const notice = () => root.querySelector<HTMLButtonElement>(".new-version");

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement("main");
  document.body.replaceChildren(root);
  localStorage.clear();
  reload.mockClear();
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
});

describe("a new version of the page", () => {
  test("the page that is up to date says nothing", async () => {
    await open(async () => "build-1");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(notice()).toBeNull();
  });

  test("a newer build is noticed within a minute and offered with a small notice", async () => {
    let deployed = "build-1";
    await open(async () => deployed);
    deployed = "build-2";
    await vi.advanceTimersByTimeAsync(60_000);
    expect(notice()?.textContent).toBe("New version – tap to update");
  });

  test("a new version is loaded only when the notice is tapped", async () => {
    await open(async () => "build-2");
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(reload).not.toHaveBeenCalled();
    notice()?.click();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test("a version check that fails shows nothing", async () => {
    await open(async () => {
      throw new Error("offline");
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(notice()).toBeNull();
  });
});
