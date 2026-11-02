import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type Deps, start } from "../src/app";
import { type Active, type Bridge, SignedOut, type SignIn, type Snapshot } from "../src/bridge";
import type { EventSourceLike } from "../src/live";
import type { Session } from "../src/states";

class FakeSource implements EventSourceLike {
  static last: FakeSource | undefined;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = 0;
  closed = false;
  private listeners = new Map<string, ((e: MessageEvent) => void)[]>();
  constructor(readonly url: string) {
    FakeSource.last = this;
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  close(): void {
    this.closed = true;
    this.readyState = 2;
  }
  emit(type: string, data: unknown): void {
    for (const fn of this.listeners.get(type) ?? [])
      fn(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
}

function session(over: Partial<Session>): Session {
  return {
    id: "id",
    name: "name",
    kind: "terminal",
    project: "proj",
    status: "idle",
    doing: "",
    minutes_since_update: 0,
    ...over,
  };
}

const ONE = session({
  id: "a1",
  name: "billing-ab",
  project: "billing",
  status: "busy",
  doing: "Fixing totals.",
});
const TWO = session({ id: "b2", name: "docs-cd", project: "docs", status: "idle", minutes_since_update: 12 });
const ACTIVE_ONE: Active = { id: "a1", name: "billing-ab", kind: "terminal", set_by: "voice", set_at: "" };

const ALL_OK: Doctor = { ready: true, checked_at: "", checks: [] };

function check(over: Partial<Doctor["checks"][number]>): Doctor["checks"][number] {
  return {
    id: "x",
    title: "X",
    ok: true,
    required: false,
    affects: "",
    detail: "",
    fix: "",
    fix_url: null,
    ...over,
  };
}

function fakeBridge(snapshots: (Snapshot | "signed-out")[], signIn: SignIn = "ok") {
  let calls = 0;
  return {
    snapshotCalls: () => calls,
    signIn: vi.fn(async (_secret: string) => signIn),
    signOut: vi.fn(async () => {}),
    snapshot: vi.fn(async () => {
      const next = snapshots[Math.min(calls, snapshots.length - 1)];
      calls += 1;
      if (next === "signed-out" || next === undefined) throw new SignedOut();
      return next;
    }),
    choose: vi.fn(
      async (id: string): Promise<Active> => ({ id, name: id, kind: "terminal", set_by: "page", set_at: "" }),
    ),
    doctor: vi.fn(async (): Promise<Doctor> => ALL_OK),
  } satisfies Bridge & { snapshotCalls: () => number };
}

let root: HTMLElement;
let stop: () => void;

async function open(b: Bridge, over: Partial<Deps> = {}) {
  stop = start(root, { bridge: b, openEvents: (url) => new FakeSource(url), ...over });
  await vi.advanceTimersByTimeAsync(0);
}

const settle = () => vi.advanceTimersByTimeAsync(0);
const card = (id: string) => root.querySelector<HTMLButtonElement>(`[data-session="${id}"]`);
const text = (selector: string) => root.querySelector(selector)?.textContent ?? "";

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement("main");
  document.body.replaceChildren(root);
  FakeSource.last = undefined;
});

afterEach(() => {
  stop?.();
  vi.useRealTimers();
});

describe("signing in", () => {
  test("a signed-out page asks for the login secret", async () => {
    await open(fakeBridge(["signed-out"]));
    expect(root.querySelector("form.signin input[name=secret]")).not.toBeNull();
    expect(FakeSource.last).toBeUndefined();
  });

  async function submit(secret: string) {
    const input = root.querySelector<HTMLInputElement>("input[name=secret]");
    if (!input) throw new Error("no secret field");
    input.value = secret;
    root.querySelector("form")?.dispatchEvent(new Event("submit", { cancelable: true }));
    await settle();
  }

  test("a wrong secret is refused with a reason", async () => {
    const b = fakeBridge(["signed-out"], "wrong");
    await open(b);
    await submit("nope");
    expect(b.signIn).toHaveBeenCalledWith("nope");
    expect(text(".error")).toBe("Wrong secret.");
  });

  test("too many wrong tries says how long to wait", async () => {
    await open(fakeBridge(["signed-out"], "too-many"));
    await submit("nope");
    expect(text(".error")).toBe("Too many wrong tries. Wait ten minutes.");
  });

  test("a bridge that cannot be reached is said so on the sign-in page", async () => {
    await open(fakeBridge(["signed-out"], "unreachable"));
    await submit("x");
    expect(text(".error")).toBe("Can't reach the bridge.");
  });

  test("the right secret opens the session cards", async () => {
    await open(fakeBridge(["signed-out", { sessions: [ONE], active: null }]));
    await submit("right");
    expect(card("a1")).not.toBeNull();
    expect(root.querySelector("form.signin")).toBeNull();
  });

  test("signing out returns to the sign-in page", async () => {
    const b = fakeBridge([{ sessions: [ONE], active: null }]);
    await open(b);
    root.querySelector<HTMLButtonElement>("button.signout")?.click();
    await settle();
    expect(b.signOut).toHaveBeenCalled();
    expect(root.querySelector("form.signin")).not.toBeNull();
    expect(FakeSource.last?.closed).toBe(true);
  });
});

describe("the session cards", () => {
  test("a card shows the name, project, state, time in state and what it is doing", async () => {
    await open(fakeBridge([{ sessions: [ONE, TWO], active: null }]));
    const one = card("a1");
    expect(one?.textContent).toContain("billing-ab");
    expect(one?.textContent).toContain("billing");
    expect(one?.textContent).toContain("Working");
    expect(one?.textContent).toContain("Fixing totals.");
    expect(one?.dataset.state).toBe("working");
    expect(card("b2")?.textContent).toContain("12 min");
  });

  test("a waiting card shows the question and its options", async () => {
    const q = session({
      id: "q",
      status: "waiting",
      question: { text: "Which file?", options: ["a.py", "b.py"] },
    });
    await open(fakeBridge([{ sessions: [q], active: null }]));
    expect(card("q")?.textContent).toContain("Which file?");
    expect(card("q")?.textContent).toContain("b.py");
  });

  test("a waiting card does not repeat the question as what it is doing", async () => {
    const q = session({
      id: "q",
      status: "waiting",
      doing: "venter på valg: Which file?",
      question: { text: "Which file?", options: [] },
    });
    await open(fakeBridge([{ sessions: [q], active: null }]));
    expect(card("q")?.querySelector(".doing")).toBeNull();
  });

  test("the active session's card is marked", async () => {
    await open(fakeBridge([{ sessions: [ONE, TWO], active: ACTIVE_ONE }]));
    expect(card("a1")?.classList.contains("active")).toBe(true);
    expect(card("b2")?.classList.contains("active")).toBe(false);
  });

  test("tapping a card makes it the session the voice talks to", async () => {
    const b = fakeBridge([{ sessions: [ONE, TWO], active: ACTIVE_ONE }]);
    await open(b);
    card("b2")?.click();
    await settle();
    expect(b.choose).toHaveBeenCalledWith("b2");
    expect(card("b2")?.classList.contains("active")).toBe(true);
    expect(card("a1")?.classList.contains("active")).toBe(false);
  });

  test("with no sessions the page says so", async () => {
    await open(fakeBridge([{ sessions: [], active: null }]));
    expect(text(".cards")).toContain("No sessions");
  });
});

describe("the focus bar", () => {
  test("the bar names the active session and who chose it", async () => {
    await open(fakeBridge([{ sessions: [ONE], active: ACTIVE_ONE }]));
    expect(text(".focus-bar")).toContain("billing-ab");
    expect(text(".focus-bar")).toContain("chosen by voice");
  });

  test("with nothing chosen the bar says how to choose", async () => {
    await open(fakeBridge([{ sessions: [ONE], active: null }]));
    expect(text(".focus-bar")).toContain("Tap a session");
  });

  test("a focus event shows the session the voice is talking to now", async () => {
    await open(fakeBridge([{ sessions: [ONE, TWO], active: ACTIVE_ONE }]));
    FakeSource.last?.emit("focus", { session: "docs-cd", tool: "ask_active_session", at: "" });
    expect(text(".focus-bar")).toContain("docs-cd");
    expect(text(".focus-bar")).toContain("talking now");
    expect(card("b2")?.classList.contains("focus")).toBe(true);
  });

  test("a focus event matches a session by id as well as by name", async () => {
    await open(fakeBridge([{ sessions: [ONE, TWO], active: null }]));
    FakeSource.last?.emit("focus", { session: "b2", tool: "read_session_output", at: "" });
    expect(card("b2")?.classList.contains("focus")).toBe(true);
  });

  test("after two quiet minutes the bar goes back to the active session", async () => {
    await open(fakeBridge([{ sessions: [ONE, TWO], active: ACTIVE_ONE }]));
    FakeSource.last?.emit("focus", { session: "docs-cd", tool: "ask_active_session", at: "" });
    await vi.advanceTimersByTimeAsync(2 * 60_000 + 1);
    expect(text(".focus-bar")).toContain("billing-ab");
    expect(card("b2")?.classList.contains("focus")).toBe(false);
  });

  test("an active event moves the mark to the new session", async () => {
    await open(fakeBridge([{ sessions: [ONE, TWO], active: ACTIVE_ONE }]));
    FakeSource.last?.emit("active", {
      id: "b2",
      name: "docs-cd",
      kind: "terminal",
      set_by: "voice",
      set_at: "",
    });
    expect(card("b2")?.classList.contains("active")).toBe(true);
    expect(text(".focus-bar")).toContain("docs-cd");
  });
});

describe("staying live", () => {
  test("the page follows the bridge's event stream", async () => {
    await open(fakeBridge([{ sessions: [ONE], active: null }]));
    expect(FakeSource.last?.url).toBe("/api/v1/events");
  });

  test("news from the bridge fetches the sessions again", async () => {
    const b = fakeBridge([
      { sessions: [ONE], active: null },
      { sessions: [{ ...ONE, status: "idle" }], active: null },
    ]);
    await open(b);
    FakeSource.last?.emit("news", { kind: "finished", session: "billing-ab", text: "Done." });
    await settle();
    expect(card("a1")?.dataset.state).toBe("idle");
  });

  test("the sessions are fetched again every fifteen seconds", async () => {
    const b = fakeBridge([{ sessions: [ONE], active: null }]);
    await open(b);
    const before = b.snapshotCalls();
    await vi.advanceTimersByTimeAsync(14_999);
    expect(b.snapshotCalls()).toBe(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(b.snapshotCalls()).toBe(before + 1);
  });

  test("a lost stream shows that the page is reconnecting", async () => {
    await open(fakeBridge([{ sessions: [ONE], active: null }]));
    FakeSource.last?.onopen?.(new Event("open"));
    expect(text(".connection")).toBe("Live");
    FakeSource.last?.onerror?.(new Event("error"));
    expect(text(".connection")).toBe("Reconnecting…");
  });

  test("being signed out while watching returns to the sign-in page", async () => {
    await open(fakeBridge([{ sessions: [ONE], active: null }, "signed-out"]));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(root.querySelector("form.signin")).not.toBeNull();
    expect(FakeSource.last?.closed).toBe(true);
  });
});

describe("what is missing", () => {
  const PORT = check({
    id: "tailnet_port",
    title: "Tailnet-only port",
    ok: false,
    affects: "the companion app on the phone",
    detail: "nothing serves the bridge on the tailnet",
    fix: "tailscale serve --bg --http=8813 http://127.0.0.1:8811",
    fix_url: "https://tailscale.com/kb/1242/tailscale-serve",
  });
  const STATUSLINE = check({ id: "statusline", title: "Statusline", ok: false, detail: "no state file" });
  const SIGNED_IN = check({
    id: "claude_signed_in",
    title: "Claude Code signed in",
    ok: false,
    required: true,
  });

  async function openWith(doctor: Doctor) {
    const b = fakeBridge([{ sessions: [ONE], active: null }]);
    b.doctor.mockResolvedValue(doctor);
    await open(b);
    return b;
  }

  test("with nothing missing there is no banner", async () => {
    await openWith({ ...ALL_OK, checks: [check({ id: "git", title: "Git" })] });
    expect(root.querySelector(".doctor-banner")).toBeNull();
  });

  test("missing optional things show an amber banner naming them", async () => {
    await openWith({ ready: true, checked_at: "", checks: [check({ title: "Git" }), PORT, STATUSLINE] });
    const banner = root.querySelector(".doctor-banner");
    expect(banner?.classList.contains("optional")).toBe(true);
    expect(banner?.textContent).toBe("2 things missing: Tailnet-only port, Statusline");
  });

  test("a missing required thing shows a red banner", async () => {
    await openWith({ ready: false, checked_at: "", checks: [SIGNED_IN] });
    const banner = root.querySelector(".doctor-banner");
    expect(banner?.classList.contains("required")).toBe(true);
    expect(banner?.textContent).toBe("1 thing missing: Claude Code signed in");
  });

  test("tapping the banner shows what each missing thing affects and how to fix it", async () => {
    await openWith({ ready: true, checked_at: "", checks: [PORT] });
    expect(root.querySelector(".doctor-panel")).toBeNull();
    root.querySelector<HTMLButtonElement>(".doctor-banner")?.click();
    const panel = root.querySelector(".doctor-panel");
    expect(panel?.textContent).toContain("the companion app on the phone");
    expect(panel?.textContent).toContain("nothing serves the bridge on the tailnet");
    expect(panel?.querySelector("code")?.textContent).toBe(
      "tailscale serve --bg --http=8813 http://127.0.0.1:8811",
    );
    expect(panel?.querySelector("a")?.getAttribute("href")).toBe(
      "https://tailscale.com/kb/1242/tailscale-serve",
    );
  });

  test("the panel stays open when the cards are redrawn", async () => {
    await openWith({ ready: true, checked_at: "", checks: [PORT] });
    root.querySelector<HTMLButtonElement>(".doctor-banner")?.click();
    FakeSource.last?.emit("active", ACTIVE_ONE);
    expect(root.querySelector(".doctor-panel")).not.toBeNull();
  });

  test("the check is asked again every five minutes, not on every refresh", async () => {
    const b = await openWith(ALL_OK);
    expect(b.doctor).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect(b.doctor).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(b.doctor).toHaveBeenCalledTimes(2);
  });

  test("a check that fails to answer leaves the cards as they are", async () => {
    const b = fakeBridge([{ sessions: [ONE], active: null }]);
    b.doctor.mockRejectedValue(new Error("the bridge answered 500"));
    await open(b);
    expect(card("a1")).not.toBeNull();
    expect(root.querySelector(".doctor-banner")).toBeNull();
  });
});
