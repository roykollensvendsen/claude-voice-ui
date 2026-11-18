// What waits on the owner leaves the phone once it is answered, or its session has moved on.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { start } from "../src/app";
import type { Prompt, Work } from "../src/bridge";
import type { Session } from "../src/states";
import { FakeSource, fakeBridge, session } from "./fakes";

const SINCE = "2026-11-18T17:00:00Z";
const LATER = "2026-11-18T17:20:00Z";
const EARLIER = "2026-11-18T16:40:00Z";

type Item = Work["waiting_on_owner"][number];
const item = (over: Partial<Item>): Item => ({
  id: "w1",
  text: "Approve the plugin",
  command: null,
  since: SINCE,
  repo: null,
  session: "garage-door",
  ...over,
});

const waitingOn = (over: Partial<Session> = {}) =>
  session({
    id: "g1",
    name: "garage-door",
    status: "waiting",
    state: "waiting",
    waiting_kind: "approval",
    state_since: EARLIER,
    ...over,
  });

const prompt = (id: string): Prompt => ({
  id,
  session: "g1",
  kind: "approval",
  question: null,
  tool: "Bash",
  input: "ls",
  cut: false,
  asked_at: SINCE,
});

let root: HTMLElement;
let stop: (() => void) | undefined;

async function open(items: Item[], sessions: Session[], prompts: Prompt[] = []) {
  const b = fakeBridge([{ sessions, active: null }]);
  b.work.mockResolvedValue({ as_of: LATER, waiting_on_owner: items, open_prs: [] });
  b.prompts.mockResolvedValue(prompts);
  stop = start(root, { bridge: b, openEvents: (url) => new FakeSource(url) });
  await vi.advanceTimersByTimeAsync(0);
  return b;
}

const shown = () => [...root.querySelectorAll<HTMLElement>(".work-waiting li[data-id]")];
const ids = () => shown().map((li) => li.dataset.id);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(LATER);
  root = document.createElement("main");
  document.body.replaceChildren(root);
  localStorage.clear();
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
});

describe("what waits on the owner leaves when it is done", () => {
  test("an item stays while its session still waits", async () => {
    await open([item({})], [waitingOn()]);
    expect(ids()).toEqual(["w1"]);
    expect(shown()[0]?.classList.contains("maybe-done")).toBe(false);
  });

  test("an item whose session has moved on to another is hidden", async () => {
    await open([item({})], [waitingOn({ moved_to: { name: "garage-door-2" } })]);
    expect(ids()).toEqual([]);
  });

  test("an item whose session has ended is shown faded, never hidden", async () => {
    await open([item({})], [session({ id: "x", name: "other" })]);
    expect(ids()).toEqual(["w1"]);
    expect(shown()[0]?.classList.contains("session-ended")).toBe(true);
    expect(shown()[0]?.textContent).toContain("its session has ended");
  });

  test("an item whose session stopped waiting after it was written is shown faded, never hidden", async () => {
    await open(
      [item({})],
      [waitingOn({ state: "busy", status: "busy", waiting_kind: null, state_since: LATER })],
    );
    expect(ids()).toEqual(["w1"]);
    expect(shown()[0]?.classList.contains("maybe-done")).toBe(true);
    expect(shown()[0]?.textContent).toContain("may be done");
  });

  test("an item whose session only went idle after it was written is not marked as done", async () => {
    await open(
      [item({})],
      [waitingOn({ state: "idle", status: "idle", waiting_kind: null, state_since: LATER })],
    );
    expect(shown()[0]?.classList.contains("maybe-done")).toBe(false);
  });

  test("a failed read of the pending prompts hides nothing", async () => {
    const b = fakeBridge([{ sessions: [waitingOn()], active: null }]);
    b.work.mockResolvedValue({ as_of: LATER, waiting_on_owner: [item({ prompt: "p1" })], open_prs: [] });
    b.prompts.mockRejectedValue(new Error("the bridge answered 500"));
    stop = start(root, { bridge: b, openEvents: (url) => new FakeSource(url) });
    await vi.advanceTimersByTimeAsync(0);
    expect(ids()).toEqual(["w1"]);
  });

  test("an item whose prompt has been answered is hidden", async () => {
    await open([item({ prompt: "p1" }), item({ id: "w2", prompt: "p2" })], [waitingOn()], [prompt("p2")]);
    expect(ids()).toEqual(["w2"]);
  });

  test("a prompt answered while the page is open takes its item with it", async () => {
    await open([item({ prompt: "p1" })], [waitingOn()], [prompt("p1")]);
    expect(ids()).toEqual(["w1"]);
    FakeSource.last?.emit("prompt_closed", { id: "p1", how: "answered" });
    await vi.advanceTimersByTimeAsync(0);
    expect(ids()).toEqual([]);
  });

  test("an item about no session and no prompt always stays", async () => {
    await open([item({ session: null })], []);
    expect(ids()).toEqual(["w1"]);
  });
});
