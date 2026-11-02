import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { start } from "../src/app";
import { bridge } from "../src/bridge";
import { FakeSource, fakeBridge, ONE } from "./fakes";

let root: HTMLElement;
let stop: (() => void) | undefined;

async function open(b = fakeBridge([{ sessions: [ONE], active: null }])) {
  stop = start(root, { bridge: b, openEvents: (url) => new FakeSource(url) });
  await vi.advanceTimersByTimeAsync(0);
  root.querySelector<HTMLButtonElement>("header .menu-toggle")?.click();
  return b;
}

const row = (name: string) => root.querySelector<HTMLElement>(`.menu .${name}`);
const pick = (name: string, label: string) =>
  [...(row(name)?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find((b) => b.textContent === label);
const pressed = (name: string) =>
  row(name)?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.textContent;

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

describe("how new sessions start, from the menu", () => {
  test("the menu shows where new sessions open and whether they have remote control", async () => {
    await open();
    expect(row("start-in")?.querySelector(".label")?.textContent).toBe("New sessions open");
    expect(pressed("start-in")).toBe("In a window");
    expect(row("remote-control")?.querySelector(".label")?.textContent).toBe("Remote control");
    expect(pressed("remote-control")).toBe("On");
  });

  test("choosing another sends only that setting, and the menu shows what the bridge answered", async () => {
    const b = await open();
    pick("start-in", "In the background")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.changeSettings).toHaveBeenCalledWith({ start_in: "background" });
    expect(pressed("start-in")).toBe("In the background");
    pick("remote-control", "Off")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.changeSettings).toHaveBeenLastCalledWith({ remote_control: false });
  });

  test("a change made elsewhere shows as soon as the stream carries it", async () => {
    await open();
    FakeSource.last?.emit("settings", { remote_control: false, start_in: "background", updated_at: "x" });
    expect(pressed("start-in")).toBe("In the background");
    expect(pressed("remote-control")).toBe("Off");
  });

  test("a bridge without settings leaves them out of the menu", async () => {
    const b = fakeBridge([{ sessions: [ONE], active: null }]);
    b.settings.mockRejectedValue(new Error("the bridge answered 404"));
    await open(b);
    expect(row("start-in")).toBeNull();
    expect(root.querySelector(".menu .signout")).not.toBeNull();
  });

  test("each row in the menu says what it is about", async () => {
    await open();
    const labels = [...root.querySelectorAll(".menu .label")].map((l) => l.textContent);
    expect(labels).toEqual(["Theme", "Language", "New sessions open", "Remote control"]);
  });
});

describe("the bridge's settings calls", () => {
  test("a change is a partial PUT, and the whole object comes back", async () => {
    const whole = { remote_control: false, start_in: "terminal", updated_at: "t" };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(whole), { status: 200 }));
    expect(await bridge(fetch).changeSettings({ remote_control: false })).toEqual(whole);
    expect(fetch).toHaveBeenCalledWith("/api/v1/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remote_control: false }),
    });
  });
});
