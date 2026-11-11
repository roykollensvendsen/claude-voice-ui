// Opening a session where the owner is: its terminal window on this computer, never from afar.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { start } from "../src/app";
import { bridge, type Focused, type Work } from "../src/bridge";
import { setLanguage } from "../src/i18n";
import { FakeSource, fakeBridge, longPress, ONE, session } from "./fakes";

const FAR = session({ id: "lukas-laptop/c3", name: "math", machine: "lukas-laptop", status: "idle" });

const WORK: Work = {
  as_of: "",
  waiting_on_owner: [
    { id: "w1", text: "Say yes", command: null, since: "", repo: null, session: "billing-ab" },
  ],
  open_prs: [],
};

let root: HTMLElement;
let stop: (() => void) | undefined;

async function open(here: boolean) {
  const b = fakeBridge([{ sessions: [ONE, FAR], active: null }]);
  b.whoami.mockResolvedValue({ here });
  b.work.mockResolvedValue(WORK);
  stop = start(root, { bridge: b, openEvents: (url) => new FakeSource(url) });
  await vi.advanceTimersByTimeAsync(0);
  return b;
}

const terminalButton = () => root.querySelector<HTMLButtonElement>("button.open-terminal");

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

describe("on this computer", () => {
  test("a session's page offers to open its terminal, and says what happened", async () => {
    const b = await open(true);
    await longPress(root, "a1");
    expect(terminalButton()?.textContent).toBe("Open in terminal");
    terminalButton()?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.focus).toHaveBeenCalledWith("a1");
    expect(root.querySelector(".opened")?.textContent).toBe("Its terminal window is in front.");
  });

  test("an item waiting on the owner about a session offers its terminal too", async () => {
    const b = await open(true);
    root.querySelector<HTMLButtonElement>(".work-waiting button.open-terminal")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.focus).toHaveBeenCalledWith("a1");
  });

  test.each<[Focused, string]>([
    [{ done: "attached" }, "Opened in a new terminal window."],
    [
      { reason: "no_window" },
      "Its window could not be found. If it is in a background tab, switch to that tab.",
    ],
    [{ reason: "not_running" }, "It is not running."],
    [{ reason: "not_local" }, "It runs on another computer."],
    [{ reason: "not_here" }, "A terminal can only be opened from this computer."],
    [{ reason: "no_window_list" }, "This computer cannot list its windows."],
  ])("the bridge's answer %j is said in words", async (answer, words) => {
    const b = await open(true);
    b.focus.mockResolvedValue(answer);
    await longPress(root, "a1");
    terminalButton()?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector(".opened")?.textContent).toBe(words);
  });

  test("an answer the page does not know is said plainly, not as a code", async () => {
    const b = await open(true);
    b.focus.mockResolvedValue({
      error: "only reachable from this computer or the tailnet",
    } as unknown as Focused);
    await longPress(root, "a1");
    terminalButton()?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector(".opened")?.textContent).toBe("Could not open its terminal.");
  });

  test("the answer is said in the owner's language", async () => {
    localStorage.setItem("cvu.lang", JSON.stringify("nb"));
    const b = await open(true);
    b.focus.mockResolvedValue({ reason: "no_window" });
    await longPress(root, "a1");
    terminalButton()?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(terminalButton()?.textContent).toBe("Åpne i terminal");
    expect(root.querySelector(".opened")?.textContent).toBe(
      "Fant ikke vinduet. Ligger den i en fane i bakgrunnen, bytt til den fanen.",
    );
  });
});

describe("from afar", () => {
  test("a terminal is offered only on this computer, and only for a session that runs on it", async () => {
    await open(false);
    expect(root.querySelector(".work-waiting button.open-terminal")).toBeNull();
    await longPress(root, "a1");
    expect(root.querySelector(".detail h2")).not.toBeNull();
    expect(terminalButton()).toBeNull();
    stop?.();
    await open(true);
    await longPress(root, "lukas-laptop/c3");
    expect(root.querySelector(".detail h2")?.textContent).toContain("math");
    expect(terminalButton()).toBeNull();
  });
});

describe("asking the bridge", () => {
  const reply = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status });

  test("where the page is comes from the bridge, and an older bridge means not here", async () => {
    const fetch = vi.fn(async () => reply(200, { here: true }));
    expect(await bridge(fetch).whoami()).toEqual({ here: true });
    expect(fetch).toHaveBeenCalledWith("/api/v1/whoami", { cache: "no-store" });
    expect(await bridge(async () => reply(404)).whoami()).toEqual({ here: false });
  });

  test("opening is asked by the session's id, and a refusal comes back as its reason", async () => {
    const fetch = vi.fn(async () => reply(200, { done: "raised" }));
    expect(await bridge(fetch).focus("lukas-laptop/c3")).toEqual({ done: "raised" });
    expect(fetch).toHaveBeenCalledWith("/api/v1/sessions/lukas-laptop%2Fc3/focus", { method: "POST" });
    for (const status of [403, 409, 501]) {
      const refused = await bridge(async () => reply(status, { reason: "no_window" })).focus("a1");
      expect(refused).toEqual({ reason: "no_window" });
    }
  });
});
