// The team's work on the home page: what waits on the owner first, the open pull requests after the sessions.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { start } from "../src/app";
import { bridge, type Work } from "../src/bridge";
import { FakeSource, fakeBridge, ONE } from "./fakes";

const NOW = Date.parse("2026-11-10T12:00:00Z");

const WORK: Work = {
  as_of: "2026-11-10T12:00:00Z",
  waiting_on_owner: [
    {
      id: "w1",
      text: "Allow the bridge to restart",
      command: "systemctl --user restart claude-voice",
      since: "2026-11-10T11:40:00Z",
      repo: "claude-voice",
      session: "billing-ab",
    },
    {
      id: "w2",
      text: "Say yes to the TV plugin",
      command: null,
      since: "2026-11-10T11:59:30Z",
      repo: null,
      session: null,
    },
  ],
  open_prs: [
    {
      repo: "garage-door",
      number: 7,
      title: "Close by name",
      url: "https://gh.example/g/7",
      checks: "pass",
      draft: false,
    },
    { repo: "tv-mcp", number: 3, title: "Pause", url: "https://gh.example/t/3", checks: "fail", draft: true },
    {
      repo: "garage-door",
      number: 8,
      title: "Arm at night",
      url: "https://gh.example/g/8",
      checks: "pending",
      draft: false,
    },
  ],
};

let root: HTMLElement;
let stop: (() => void) | undefined;

async function open(work: Work | null = WORK) {
  const b = fakeBridge([{ sessions: [ONE], active: null }]);
  b.work.mockResolvedValue(work);
  stop = start(root, { bridge: b, openEvents: (url) => new FakeSource(url) });
  await vi.advanceTimersByTimeAsync(0);
  return b;
}

const waiting = () => root.querySelector<HTMLElement>(".work-waiting");
const prs = () => root.querySelector<HTMLElement>(".work-prs");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  root = document.createElement("main");
  document.body.replaceChildren(root);
  localStorage.clear();
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("what waits on the owner", () => {
  test("what waits on the owner comes first, above the sessions", async () => {
    await open();
    const order = [...root.querySelectorAll(".work-waiting, [data-session]")];
    expect(order[0]?.classList.contains("work-waiting")).toBe(true);
    expect(waiting()?.querySelector("h2")?.textContent).toBe("Waiting on you");
    const items = [...(waiting()?.querySelectorAll("li .text") ?? [])].map((x) => x.textContent);
    expect(items).toEqual(["Allow the bridge to restart", "Say yes to the TV plugin"]);
    expect(waiting()?.querySelector("li .since")?.textContent).toBe("20 min ago");
  });

  test("a command is shown as it is, with a button that copies it", async () => {
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await open();
    expect(waiting()?.querySelector("code")?.textContent).toBe("systemctl --user restart claude-voice");
    waiting()?.querySelector<HTMLButtonElement>("button.copy")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(writeText).toHaveBeenCalledWith("systemctl --user restart claude-voice");
    expect(waiting()?.querySelector("button.copy")?.textContent).toBe("Copied");
    await vi.advanceTimersByTimeAsync(2000);
    expect(waiting()?.querySelector("button.copy")?.textContent).toBe("Copy");
  });

  test("an item about a session leads to that session's page", async () => {
    await open();
    waiting()?.querySelector<HTMLButtonElement>("button.to-session")?.click();
    expect(root.querySelector(".detail h2")?.textContent).toBe("billing-ab");
  });

  test("text from the team is shown as text, never as markup", async () => {
    await open({ ...WORK, waiting_on_owner: [{ ...WORK.waiting_on_owner[1]!, text: "<b>bold</b>" }] });
    expect(waiting()?.querySelector("li .text")?.textContent).toBe("<b>bold</b>");
    expect(waiting()?.querySelector("b")).toBeNull();
  });
});

describe("the open pull requests", () => {
  test("the open pull requests come after the sessions, grouped by repository", async () => {
    await open();
    const all = [...root.querySelectorAll("[data-session], .work-prs")];
    expect(all.at(-1)?.classList.contains("work-prs")).toBe(true);
    expect([...(prs()?.querySelectorAll("h3") ?? [])].map((h) => h.textContent)).toEqual([
      "garage-door",
      "tv-mcp",
    ]);
    const first = prs()?.querySelector<HTMLAnchorElement>("li a");
    expect(first?.textContent).toBe("#7 Close by name");
    expect(first?.href).toBe("https://gh.example/g/7");
    const checks = [...(prs()?.querySelectorAll("li .checks") ?? [])].map((x) => x.textContent);
    expect(checks).toEqual(["Checks pass", "Checks running", "Checks fail"]);
    expect(prs()?.querySelectorAll("li .draft").length).toBe(1);
  });

  test("a repository whose pull requests could not be read is named", async () => {
    await open({ ...WORK, unreadable: ["dreame-mcp"] });
    expect(prs()?.querySelector(".unreadable")?.textContent).toBe("Could not read: dreame-mcp");
  });
});

describe("keeping it current", () => {
  test("a change on the stream shows at once", async () => {
    await open();
    FakeSource.last?.emit("work", { ...WORK, waiting_on_owner: [] });
    expect(waiting()).toBeNull();
    expect(prs()).not.toBeNull();
  });

  test("with nothing waiting and no pull requests, nothing is shown", async () => {
    await open({ as_of: "", waiting_on_owner: [], open_prs: [] });
    expect(waiting()).toBeNull();
    expect(prs()).toBeNull();
  });

  test("a bridge without the team's work shows the page as before", async () => {
    await open(null);
    expect(waiting()).toBeNull();
    expect(prs()).toBeNull();
    expect(root.querySelector("[data-session]")).not.toBeNull();
  });

  test("the team's work is read from the bridge, and a bridge without it gives none", async () => {
    const reply = (status: number, body?: unknown) =>
      new Response(body === undefined ? null : JSON.stringify(body), { status });
    const fetch = vi.fn(async () => reply(200, WORK));
    expect(await bridge(fetch).work()).toEqual(WORK);
    expect(fetch).toHaveBeenCalledWith("/api/v1/work", { cache: "no-store" });
    expect(await bridge(async () => reply(404)).work()).toBeNull();
  });
});
