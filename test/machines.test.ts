import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { start } from "../src/app";
import { bridge, type Machine, type Prompt } from "../src/bridge";
import { FakeSource, fakeBridge, longPress, ONE, session } from "./fakes";

let root: HTMLElement;
let stop: (() => void) | undefined;

const LAPTOP: Machine = {
  name: "lukas-laptop",
  state: "online",
  reachable: true,
  error: null,
  checked_at: "2026-11-07T12:00:00+00:00",
  last_seen: "2026-11-07T12:00:00+00:00",
  sessions: true,
};
const AWAY: Machine = { ...LAPTOP, state: "offline", reachable: false, error: "did not answer" };
const REMOTE = session({
  id: "lukas-laptop/840ab631",
  name: "hub-test",
  machine: "lukas-laptop",
  number: 3,
  kind: "bridge-session",
  state: "approval",
});
const APPROVAL: Prompt = {
  id: "lukas-laptop/2",
  session: "lukas-laptop/840ab631",
  kind: "approval",
  question: null,
  tool: "Bash",
  input: "ls",
  cut: false,
  asked_at: "",
};

async function open(b = fakeBridge([{ sessions: [ONE, REMOTE], active: null, machines: [LAPTOP] }])) {
  stop = start(root, { bridge: b, openEvents: (url) => new FakeSource(url) });
  await vi.advanceTimersByTimeAsync(0);
  FakeSource.last?.onopen?.(new Event("open"));
  await vi.advanceTimersByTimeAsync(0);
  return b;
}

const group = (name: string) => root.querySelector<HTMLElement>(`.machine[data-machine="${name}"]`);
const tileOf = (id: string) => root.querySelector<HTMLElement>(`[data-session="${id}"]`);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-07T12:05:00+00:00"));
  root = document.createElement("main");
  document.body.replaceChildren(root);
  localStorage.clear();
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
});

describe("sessions on other machines", () => {
  test("sessions on another machine are shown under that machine's name", async () => {
    await open();
    const laptop = group("lukas-laptop");
    expect(laptop?.querySelector(".machine-name")?.textContent).toBe("lukas-laptop");
    expect(laptop?.querySelector('[data-session="lukas-laptop/840ab631"]')).not.toBeNull();
    expect(laptop?.querySelector('[data-session="a1"]')).toBeNull();
    expect(tileOf("a1")).not.toBeNull();
  });

  test("a session on another machine shows only its own name, under its machine's heading", async () => {
    await open();
    expect(tileOf("lukas-laptop/840ab631")?.querySelector(".name")?.textContent).toBe("hub-test");
  });

  test("this computer's own sessions are under the heading Hub when there are other machines", async () => {
    await open();
    expect(group("hub")?.querySelector(".machine-name")?.textContent).toBe("Hub");
    expect(group("hub")?.querySelector('[data-session="a1"]')).not.toBeNull();
  });

  test.each([
    ["online", "Online"],
    ["slow", "Slow"],
    ["agent_down", "Agent not running"],
    ["not_approved", "Not approved"],
  ] as const)("a machine that is %s says so on its heading", async (state, words) => {
    await open(fakeBridge([{ sessions: [ONE], active: null, machines: [{ ...LAPTOP, state }] }]));
    expect(group("lukas-laptop")?.querySelector(".machine-state")?.textContent).toBe(words);
  });

  test("a machine's folded group stays folded when the page opens again", async () => {
    await open();
    group("lukas-laptop")?.querySelector<HTMLButtonElement>("button.machine-top")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(tileOf("lukas-laptop/840ab631")).toBeNull();
    expect(group("lukas-laptop")?.querySelector(".machine-count")?.textContent).toBe("1 session");
    stop?.();
    await open();
    expect(tileOf("lukas-laptop/840ab631")).toBeNull();
    group("lukas-laptop")?.querySelector<HTMLButtonElement>("button.machine-top")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(tileOf("lukas-laptop/840ab631")).not.toBeNull();
  });

  test("in the list of cards, too, each machine has its own group", async () => {
    localStorage.setItem("cvu.view", JSON.stringify("cards"));
    await open();
    expect(group("lukas-laptop")?.querySelector(".card .name")?.textContent).toBe("hub-test");
  });

  test("with no other machines the page looks as it did", async () => {
    await open(fakeBridge([{ sessions: [ONE], active: null }]));
    expect(root.querySelector(".machine")).toBeNull();
    expect(tileOf("a1")).not.toBeNull();
  });

  test("a machine that does not answer is shown as unreachable, and the rest of the page still works", async () => {
    const b = await open(fakeBridge([{ sessions: [ONE], active: null, machines: [AWAY] }]));
    const laptop = group("lukas-laptop");
    expect(laptop?.classList.contains("unreachable")).toBe(true);
    expect(laptop?.querySelector(".machine-state")?.textContent).toBe(
      "Offline: did not answer · last seen 5 min ago",
    );
    tileOf("a1")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.choose).toHaveBeenCalledWith("a1");
  });

  test("a machine that answers but runs no sessions says so", async () => {
    await open(fakeBridge([{ sessions: [ONE], active: null, machines: [LAPTOP] }]));
    expect(group("lukas-laptop")?.querySelector(".machine-empty")?.textContent).toBe(
      "No sessions on this machine.",
    );
  });

  test("a machine event shows the change at once and reads the sessions again", async () => {
    const b = await open(
      fakeBridge([
        { sessions: [ONE, REMOTE], active: null, machines: [LAPTOP] },
        { sessions: [ONE], active: null, machines: [AWAY] },
      ]),
    );
    const before = b.snapshot.mock.calls.length;
    FakeSource.last?.emit("machine", AWAY);
    await vi.advanceTimersByTimeAsync(0);
    expect(group("lukas-laptop")?.classList.contains("unreachable")).toBe(true);
    expect(b.snapshot.mock.calls.length).toBe(before + 1);
    expect(tileOf("lukas-laptop/840ab631")).toBeNull();
  });

  test("a name the voice used matches the session on this computer, not one of that name on another machine", async () => {
    const here = session({ id: "h1", name: "hub-test", number: 1 });
    await open(fakeBridge([{ sessions: [here, REMOTE], active: null, machines: [LAPTOP] }]));
    FakeSource.last?.emit("focus", { session: "hub-test", tool: "ask_active_session", at: "" });
    await vi.advanceTimersByTimeAsync(0);
    expect(tileOf("h1")?.classList.contains("focus")).toBe(true);
    expect(tileOf("lukas-laptop/840ab631")?.classList.contains("focus")).toBe(false);
  });

  test("a session on another machine can be named with its machine in front", async () => {
    await open();
    FakeSource.last?.emit("focus", { session: "lukas-laptop/hub-test", tool: "ask_active_session", at: "" });
    await vi.advanceTimersByTimeAsync(0);
    expect(tileOf("lukas-laptop/840ab631")?.classList.contains("focus")).toBe(true);
  });
});

describe("a session's page on another machine", () => {
  test("a session's page on another machine opens when the bridge sends no transcript facts for it", async () => {
    const b = fakeBridge([{ sessions: [ONE, REMOTE], active: null, machines: [LAPTOP] }]);
    // What the bridge answers for another machine's session: its row from the list, not a page.
    b.detail.mockResolvedValue(REMOTE as never);
    await open(b);
    await longPress(root, "lukas-laptop/840ab631");
    expect(root.querySelector(".detail h2")?.textContent).toBe("hub-test");
    expect(root.querySelector(".detail .meta")?.textContent).toContain("lukas-laptop");
  });

  test("the page keeps working after opening a session on another machine", async () => {
    const b = fakeBridge([{ sessions: [ONE, REMOTE], active: null, machines: [LAPTOP] }]);
    b.detail.mockResolvedValue(REMOTE as never);
    await open(b);
    await longPress(root, "lukas-laptop/840ab631");
    root.querySelector<HTMLButtonElement>(".detail .back")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector(".detail")).toBeNull();
    expect(tileOf("a1")).not.toBeNull();
  });
});

describe("a summary of a session on another machine", () => {
  const DETAIL = {
    session: "lukas-laptop/840ab631",
    number: null,
    name: "hub-test",
    context: null,
    tool_calls: { total: 0, by_tool: {} },
    subagents: { running: 0, total: 0 },
    timeline: [],
    summary: null,
    summary_state: "none" as const,
    summary_error: null,
    summary_at: null,
  };

  test("a new summary cannot be asked for on another machine, and the page says why", async () => {
    const b = fakeBridge([{ sessions: [ONE, REMOTE], active: null, machines: [LAPTOP] }]);
    b.detail.mockResolvedValue(DETAIL);
    await open(b);
    await longPress(root, "lukas-laptop/840ab631");
    expect(root.querySelector<HTMLButtonElement>(".summary .refresh")?.disabled).toBe(true);
    expect(root.querySelector(".summary")?.textContent).toContain(
      "Summaries are made only for sessions on the hub.",
    );
  });

  test("a summary the bridge refuses shows its reason instead of waiting for ever", async () => {
    const b = fakeBridge([{ sessions: [ONE], active: null }]);
    b.summarize.mockResolvedValue("summaries are made only for sessions on this computer");
    await open(b);
    await longPress(root, "a1");
    root.querySelector<HTMLButtonElement>(".summary .refresh")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector(".summary .error")?.textContent).toBe(
      "Could not make a new summary: summaries are made only for sessions on this computer",
    );
    expect(root.querySelector(".summary")?.textContent).not.toContain("Making a summary");
  });

  test("the bridge's refusal of a summary is passed on", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "only here" }), { status: 404 }))
      .mockResolvedValueOnce(new Response("{}", { status: 202 }));
    const api = bridge(fetch);
    expect(await api.summarize("lukas-laptop/x", "English")).toBe("only here");
    expect(await api.summarize("a1", "English")).toBeNull();
  });
});

describe("each machine set apart", () => {
  test("each machine's heading is a heading of its own, with the fold button inside", async () => {
    await open();
    for (const key of ["hub", "lukas-laptop"]) {
      expect(group(key)?.querySelector("h2 > button.machine-top")).not.toBeNull();
      expect(group(key)?.getAttribute("aria-labelledby")).toBe(group(key)?.querySelector("h2")?.id);
    }
  });
});

describe("answering sessions on other machines", () => {
  test("an approval from another machine is answered with its own id", async () => {
    const b = await open();
    b.prompts.mockResolvedValue([APPROVAL]);
    FakeSource.last?.emit("prompt", APPROVAL);
    await vi.advanceTimersByTimeAsync(0);
    await longPress(root, "lukas-laptop/840ab631");
    [...root.querySelectorAll<HTMLButtonElement>(".detail .prompt button")]
      .find((x) => x.textContent === "Allow")
      ?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.answer).toHaveBeenCalledWith("lukas-laptop/2", { decision: "allow" });
  });

  test("a session that can only be answered in the Claude app says so", async () => {
    const away = { ...REMOTE, kind: "background", answer_in: "claude_app" as const };
    await open(fakeBridge([{ sessions: [away], active: null, machines: [LAPTOP] }]));
    await longPress(root, "lukas-laptop/840ab631");
    expect(root.querySelector(".detail .answer-in-app")?.textContent).toBe(
      "This session can only be answered in the Claude app.",
    );
  });

  test("an answer the other machine cannot take is refused with the bridge's reason", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "lukas-laptop did not answer" }), { status: 502 }),
      );
    expect(await bridge(fetch).answer("lukas-laptop/2", { decision: "allow" })).toEqual({
      refused: "lukas-laptop did not answer",
    });
    expect(fetch).toHaveBeenCalledWith("/api/v1/prompts/lukas-laptop%2F2", expect.anything());
  });
});
