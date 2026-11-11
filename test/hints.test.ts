// Under Other, a group of sessions that clearly work together is shown together, with a hint that it
// could become a programme of its own. The sessions and folders here are made up.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { start } from "../src/app";
import type { Snapshot } from "../src/bridge";
import type { ProgrammeHint } from "../src/team";
import { FakeSource, fakeBridge, session } from "./fakes";

const ACME = { id: "acme", name: "Acme Robotics" };
const IN_ACME = session({ id: "a1", name: "acme-manager", number: 1, programme: ACME, status: "busy" });
const KITE_1 = session({ id: "k1", name: "kite-core", number: 2, status: "busy" });
const KITE_2 = session({ id: "k2", name: "kite-wind", number: 3 });
const KITE_3 = session({ id: "k3", name: "kite-tail", number: 4 });
const POND_1 = session({ id: "p1", name: "pond-pump", number: 5 });
const POND_2 = session({ id: "p2", name: "pond-fish", number: 6 });
const LOOSE = session({ id: "o1", name: "scratch", number: 7 });

const TALK: ProgrammeHint = {
  id: "h-0000000001",
  sessions: ["k1", "k2", "k3"],
  reason: "messages",
  detail: null,
  messages: 25,
};
const POND: ProgrammeHint = {
  id: "h-0000000002",
  sessions: ["p1", "p2"],
  reason: "folder",
  detail: "pond",
  messages: null,
};
const PREFIX: ProgrammeHint = { ...POND, id: "h-0000000003", reason: "prefix", detail: "pond-" };

const snap = (hints?: ProgrammeHint[]): Snapshot => ({
  sessions: [IN_ACME, KITE_1, KITE_2, KITE_3, POND_1, POND_2, LOOSE],
  active: null,
  programmes: [{ ...ACME, order: 0 }],
  ...(hints ? { programme_hints: hints } : {}),
});

let root: HTMLElement;
let stop: (() => void) | undefined;

async function open(snapshot: Snapshot = snap([TALK, POND])) {
  const b = fakeBridge([snapshot]);
  stop = start(root, { bridge: b, openEvents: (url) => new FakeSource(url) });
  await vi.advanceTimersByTimeAsync(0);
  return b;
}

const other = () => root.querySelector<HTMLElement>('section.programme[data-programme="other"]');
const hints = () => [...(other()?.querySelectorAll<HTMLElement>(".hint") ?? [])];
const shown = (where: ParentNode | null | undefined) =>
  [...(where?.querySelectorAll<HTMLElement>("[data-session]") ?? [])].map((x) => x.dataset.session);

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

describe("a hint that sessions under Other could be a programme", () => {
  test("sessions that message each other sit together under Other, with a note that says so", async () => {
    await open();
    const [talk] = hints();
    expect(talk?.querySelector(".hint-note")?.textContent).toBe("These 3 sessions message each other");
    expect(talk?.querySelector(".hint-count")?.textContent).toBe("25 messages in 7 days");
    expect(shown(talk)).toEqual(["k1", "k2", "k3"]);
  });

  test("a shared folder or a shared name is said as such", async () => {
    await open(snap([POND]));
    expect(hints()[0]?.querySelector(".hint-note")?.textContent).toBe(
      "These 2 sessions share the folder pond",
    );
    stop?.();
    await open(snap([PREFIX]));
    expect(hints()[0]?.querySelector(".hint-note")?.textContent).toBe(
      'These 2 sessions share the name "pond-"',
    );
  });

  test("the hint links to how a programme is written down, and writes nothing itself", async () => {
    await open();
    const link = hints()[0]?.querySelector<HTMLAnchorElement>("a.hint-how");
    expect(link?.textContent).toBe("Make them a programme ›");
    expect(link?.href).toBe(
      "https://github.com/roykollensvendsen/claude-voice/blob/main/docs/org-chart.md#the-file",
    );
    expect(link?.target).toBe("_blank");
  });

  test("the sessions in no hint come after the hinted groups, and Other carries no component heading", async () => {
    await open();
    expect(shown(other())).toEqual(["k1", "k2", "k3", "p1", "p2", "o1"]);
    expect(other()?.querySelector("h3")).toBeNull();
  });

  test("a hint put away stays away for that same group", async () => {
    await open();
    hints()[0]?.querySelector<HTMLButtonElement>("button.hint-dismiss")?.click();
    expect(hints().map((h) => h.dataset.hint)).toEqual(["h-0000000002"]);
    expect(shown(other())).toContain("k1");
    stop?.();
    await open();
    expect(hints().map((h) => h.dataset.hint)).toEqual(["h-0000000002"]);
  });

  test("a hint with fewer than two of its sessions on the page is not shown", async () => {
    await open(snap([{ ...POND, sessions: ["p1", "gone"] }]));
    expect(hints()).toEqual([]);
  });

  test("a change to the hints on the stream shows at once", async () => {
    await open();
    FakeSource.last?.emit("programme_hints", { programme_hints: [POND] });
    expect(hints().map((h) => h.dataset.hint)).toEqual(["h-0000000002"]);
  });

  test("a bridge without hints shows Other as before", async () => {
    await open(snap());
    expect(hints()).toEqual([]);
    expect(shown(other())).toEqual(["k1", "k2", "k3", "p1", "p2", "o1"]);
  });
});
