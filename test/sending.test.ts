import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { start } from "../src/app";
import { FakeSource, fakeBridge, ONE, TWO } from "./fakes";

let root: HTMLElement;
let stop: (() => void) | undefined;

const ON_THE_WAY = { ...ONE, sending: [{ id: "m1", text: "Run the tests", at: "2026-11-03T14:30:00Z" }] };
const TWO_ON_THE_WAY = {
  ...ONE,
  sending: [
    { id: "m1", text: "Run the tests", at: "2026-11-03T14:30:00Z" },
    { id: "m2", text: "Then commit", at: "2026-11-03T14:31:00Z" },
  ],
};

async function open(sessions = [ON_THE_WAY, TWO], view: "grid" | "cards" = "grid") {
  localStorage.setItem("cvu.view", JSON.stringify(view));
  stop = start(root, {
    bridge: fakeBridge([{ sessions, active: null }]),
    openEvents: (url) => new FakeSource(url),
  });
  await vi.advanceTimersByTimeAsync(0);
  FakeSource.last?.onopen?.(new Event("open"));
  await vi.advanceTimersByTimeAsync(0);
}

const at = (id: string) => root.querySelector<HTMLElement>(`[data-session="${id}"]`);
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

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

describe("messages on their way to a session", () => {
  test("a tile shows how many messages are still on their way to its session", async () => {
    await open([TWO_ON_THE_WAY, TWO]);
    expect(at("a1")?.querySelector(".sending")?.textContent).toBe("2 messages on the way");
    expect(at("b2")?.querySelector(".sending")).toBeNull();
  });

  test("a card shows what is on its way", async () => {
    await open([ON_THE_WAY, TWO], "cards");
    expect(at("a1")?.querySelector(".sending")?.textContent).toBe("1 message on the way: Run the tests");
  });

  test("a message handed over to the session leaves the tile", async () => {
    await open();
    FakeSource.last?.emit("message_sent", { session: "a1", id: "m1", delivered: true, detail: "" });
    expect(at("a1")?.querySelector(".sending")).toBeNull();
  });

  test("a message that could not be handed over says so on the session", async () => {
    await open([ON_THE_WAY, TWO], "cards");
    FakeSource.last?.emit("message_sent", {
      session: "a1",
      id: "m1",
      delivered: false,
      detail: "the session ended",
    });
    expect(at("a1")?.querySelector(".sending")).toBeNull();
    expect(at("a1")?.querySelector(".undelivered")?.textContent).toBe("Not delivered: the session ended");
  });

  test("a later message handed over clears the note of one that was not", async () => {
    await open([TWO_ON_THE_WAY, TWO], "cards");
    FakeSource.last?.emit("message_sent", { session: "a1", id: "m1", delivered: false, detail: "busy" });
    FakeSource.last?.emit("message_sent", { session: "a1", id: "m2", delivered: true, detail: "" });
    expect(at("a1")?.querySelector(".undelivered")).toBeNull();
  });
});

describe("the bridge restarting", () => {
  test("the first hello from the bridge is not taken for a restart", async () => {
    await open();
    FakeSource.last?.emit("hello", { started_at: "2026-11-03T14:00:00Z" });
    expect(root.querySelector(".restarted")).toBeNull();
  });

  test("a hello with a new start time notes the restart and its time in the top bar", async () => {
    await open();
    FakeSource.last?.emit("hello", { started_at: "2026-11-03T14:00:00Z" });
    FakeSource.last?.emit("hello", { started_at: "2026-11-03T14:32:00Z" });
    expect(root.querySelector(".top .restarted")?.textContent).toBe(
      `Bridge restarted ${clock("2026-11-03T14:32:00Z")}`,
    );
  });

  test("a hello with the same start time after a dropped connection is no restart", async () => {
    await open();
    FakeSource.last?.emit("hello", { started_at: "2026-11-03T14:00:00Z" });
    FakeSource.last?.emit("hello", { started_at: "2026-11-03T14:00:00Z" });
    expect(root.querySelector(".restarted")).toBeNull();
  });

  test("tapping the restart note puts it away", async () => {
    await open();
    FakeSource.last?.emit("hello", { started_at: "2026-11-03T14:00:00Z" });
    FakeSource.last?.emit("hello", { started_at: "2026-11-03T14:32:00Z" });
    root.querySelector<HTMLElement>(".restarted")?.click();
    expect(root.querySelector(".restarted")).toBeNull();
  });
});
