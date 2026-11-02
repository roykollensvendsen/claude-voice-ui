import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type Deps, start } from "../src/app";
import type { Active, Bridge, BridgeInfo, Doctor } from "../src/bridge";
import type { Usage } from "../src/usage";
import { ACTIVE_ONE, ALL_OK, check, FakeSource, fakeBridge, NO_USAGE, ONE, session, TWO } from "./fakes";

let root: HTMLElement;
let stop: () => void;

async function open(b: Bridge, over: Partial<Deps> = {}) {
  stop = start(root, { bridge: b, openEvents: (url) => new FakeSource(url), ...over });
  await vi.advanceTimersByTimeAsync(0);
}

const settle = () => vi.advanceTimersByTimeAsync(0);
const card = (id: string) => root.querySelector<HTMLButtonElement>(`[data-session="${id}"]`);
const expand = (id: string) => card(id)?.querySelector<HTMLButtonElement>(".expand")?.click();
const text = (selector: string) => root.querySelector(selector)?.textContent ?? "";

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement("main");
  document.body.replaceChildren(root);
  localStorage.clear();
  // These tests are about the card list; the grid has its own.
  localStorage.setItem("cvu.view", JSON.stringify("cards"));
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
    root.querySelector<HTMLButtonElement>(".menu-toggle")?.click();
    root.querySelector<HTMLButtonElement>(".menu button.signout")?.click();
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

  test("an opened waiting card shows the question and its options", async () => {
    const q = session({
      id: "q",
      status: "waiting",
      question: { text: "Which file?", options: ["a.py", "b.py"] },
    });
    await open(fakeBridge([{ sessions: [q], active: null }]));
    expand("q");
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
    expand("q");
    expect(card("q")?.querySelector(".doing")).toBeNull();
    expect(card("q")?.querySelector(".line")?.textContent).toBe("Which file?");
  });

  test("an opened card shows its branch, last commit and how far it is from main", async () => {
    const g = session({
      id: "g",
      git: {
        branch: "feat/totals",
        commit: { hash: "a1b2c3d", subject: "Fix the export totals" },
        dirty: true,
        changed_files: 2,
        tracking: null,
        main: { name: "origin/main", ahead: 2, behind: 5 },
        parent: null,
        checked_at: "",
      },
    });
    await open(fakeBridge([{ sessions: [g], active: null }]));
    expand("g");
    const line = card("g")?.querySelector(".git");
    expect(line?.textContent).toContain("feat/totals");
    expect(line?.textContent).toContain("a1b2c3d Fix the export totals");
    expect(line?.textContent).toContain("2 changed");
    expect(line?.querySelector(".mark.behind")?.textContent).toBe("↑2 ↓5 main");
  });

  test("a card for a folder outside git has no git line", async () => {
    await open(fakeBridge([{ sessions: [{ ...ONE, git: null }], active: null }]));
    expand("a1");
    expect(card("a1")?.querySelector(".git")).toBeNull();
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
    root.querySelector<HTMLButtonElement>(".detail .back")?.click();
    expect(card("b2")?.classList.contains("active")).toBe(true);
    expect(card("a1")?.classList.contains("active")).toBe(false);
  });

  test("with no sessions the page says so", async () => {
    await open(fakeBridge([{ sessions: [], active: null }]));
    expect(text(".cards")).toContain("No sessions");
  });
});

describe("the focus bar", () => {
  test("the line naming the voice's session sits in the top bar, not in a box of its own", async () => {
    await open(fakeBridge([{ sessions: [ONE], active: ACTIVE_ONE }]));
    expect(root.querySelector("header .focus-bar")).not.toBeNull();
    expect(root.querySelectorAll(".focus-bar")).toHaveLength(1);
  });

  test("the bar names the active session and who chose it", async () => {
    await open(fakeBridge([{ sessions: [ONE], active: ACTIVE_ONE }]));
    expect(text(".focus-bar")).toContain("billing-ab");
    expect(text(".focus-bar")).toContain("chosen by voice");
  });

  test("the bar spends its room on the session's name, with a microphone for a label", async () => {
    await open(fakeBridge([{ sessions: [ONE], active: ACTIVE_ONE }]));
    const bar = root.querySelector<HTMLElement>(".focus-bar");
    expect(bar?.textContent?.startsWith("🎙 billing-ab")).toBe(true);
    expect(bar?.getAttribute("aria-label")).toBe("Voice talks to billing-ab, chosen by voice");
  });

  test("a long name wraps onto a second line instead of being cut off", () => {
    const css = readFileSync("src/style.css", "utf8");
    const rule = css.slice(css.indexOf(".focus-bar {"), css.indexOf("}", css.indexOf(".focus-bar {")));
    expect(rule).not.toContain("text-overflow");
    expect(rule).not.toContain("nowrap");
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

  test("the sessions are fetched again every minute", async () => {
    const b = fakeBridge([{ sessions: [ONE], active: null }]);
    await open(b);
    const before = b.snapshotCalls();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(b.snapshotCalls()).toBe(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(b.snapshotCalls()).toBe(before + 1);
  });

  test("a change of state from the bridge updates the card at once", async () => {
    const b = fakeBridge([{ sessions: [ONE, TWO], active: null }]);
    await open(b);
    const calls = b.snapshotCalls();
    FakeSource.last?.emit("status", {
      session: "a1",
      name: "billing-ab",
      state: "approval",
      previous: "working",
      since: new Date().toISOString(),
      doing: "Wants to run the tests.",
      at: "",
    });
    expect(card("a1")?.dataset.state).toBe("approval");
    expect(card("a1")?.textContent).toContain("Wants to run the tests.");
    expect(card("a1")?.textContent).toContain("just now");
    expect(b.snapshotCalls()).toBe(calls);
  });

  test("a change of state for a session not on the page fetches the list", async () => {
    const b = fakeBridge([{ sessions: [ONE], active: null }]);
    await open(b);
    const calls = b.snapshotCalls();
    FakeSource.last?.emit("status", {
      session: "new",
      name: "new",
      state: "working",
      since: "",
      doing: "",
      at: "",
    });
    await settle();
    expect(b.snapshotCalls()).toBe(calls + 1);
  });

  test("a change in a session's git status updates its card", async () => {
    await open(fakeBridge([{ sessions: [ONE], active: null }]));
    expand("a1");
    FakeSource.last?.emit("git", {
      session: "a1",
      git: {
        branch: "main",
        commit: { hash: "0f0f0f0", subject: "Merge the totals" },
        dirty: false,
        changed_files: 0,
        tracking: null,
        main: null,
        parent: null,
        checked_at: "",
      },
    });
    expect(card("a1")?.querySelector(".git")?.textContent).toContain("0f0f0f0 Merge the totals");
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
    await vi.advanceTimersByTimeAsync(60_000);
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

describe("usage", () => {
  const WEEKLY: Usage = {
    ...NO_USAGE,
    plan: {
      as_of: "",
      label: "includes chat and voice; as of the last answer",
      five_hour: null,
      seven_day: {
        used_percentage: 41,
        resets_at: new Date(Date.now() + 3 * 3_600_000).toISOString(),
        stale: false,
      },
    },
  };

  async function openWith(u: Usage, sessions = [ONE]) {
    const b = fakeBridge([{ sessions, active: null }]);
    b.usage.mockResolvedValue(u);
    await open(b);
    return b;
  }

  const usageButton = () => root.querySelector<HTMLButtonElement>("header .usage-button");
  const openUsage = () => usageButton()?.click();

  test("the top bar shows the tightest of the plan's limits as a percentage", async () => {
    const both = structuredClone(WEEKLY);
    if (both.plan) both.plan.five_hour = { used_percentage: 61, resets_at: "", stale: false };
    await openWith(both);
    expect(usageButton()?.textContent).toBe("61%");
    expect(root.querySelector(".usage")).toBeNull();
  });

  test("the percentage turns from grey to yellow to red near the limit", async () => {
    const at = (percent: number) => {
      const u = structuredClone(WEEKLY);
      if (u.plan?.seven_day) u.plan.seven_day.used_percentage = percent;
      return u;
    };
    const b = await openWith(at(41));
    expect(usageButton()?.className).toContain("level-ok");
    b.usage.mockResolvedValue(at(75));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(usageButton()?.className).toContain("level-warn");
    b.usage.mockResolvedValue(at(95));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(usageButton()?.className).toContain("level-full");
  });

  test("tapping the percentage opens the bars, and tapping again closes them", async () => {
    await openWith(WEEKLY);
    openUsage();
    expect(root.querySelector(".usage .bar")).not.toBeNull();
    expect(usageButton()?.getAttribute("aria-expanded")).toBe("true");
    openUsage();
    expect(root.querySelector(".usage")).toBeNull();
  });

  test("the plan's use shows as a bar with its label", async () => {
    await openWith(WEEKLY);
    openUsage();
    const bar = root.querySelector(".usage .bar");
    expect(bar?.textContent).toContain("Weekly");
    expect(bar?.textContent).toContain("41%");
    expect(bar?.querySelector<HTMLElement>(".fill")?.style.width).toBe("41%");
    expect(text(".usage")).toContain("includes chat and voice; as of the last answer");
  });

  test("without plan figures the page says so rather than hiding it", async () => {
    await openWith(NO_USAGE);
    expect(usageButton()?.textContent).toBe("–%");
    openUsage();
    expect(text(".usage")).toContain("No plan figures yet");
  });

  test("a warning near the limit colours the percentage and is said in the bars", async () => {
    await openWith({ ...WEEKLY, warning: { status: "allowed_warning", used_percentage: 85, at: "" } });
    expect(usageButton()?.classList.contains("level-warn")).toBe(true);
    openUsage();
    expect(text(".usage-warning")).toBe("Close to the plan's limit: 85% used");
  });

  test("the voice estimate is labelled as an estimate", async () => {
    await openWith(WEEKLY);
    openUsage();
    expect(text(".voice")).toContain("estimate, voice activity via the bridge");
    expect(text(".voice")).toContain("Voice today: none yet");
  });

  test("a card shows how full its session's context is", async () => {
    await openWith(NO_USAGE, [{ ...ONE, context: { used_percentage: 82, as_of: "" } }]);
    const ctx = card("a1")?.querySelector(".context");
    expect(ctx?.textContent).toBe("context 82%");
    expect(ctx?.classList.contains("warn")).toBe(true);
  });

  test("a card with no context figure shows none", async () => {
    await openWith(NO_USAGE, [{ ...ONE, context: null }]);
    expect(card("a1")?.querySelector(".context")).toBeNull();
  });

  test("usage is asked again every minute", async () => {
    const b = await openWith(NO_USAGE);
    expect(b.usage).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(b.usage).toHaveBeenCalledTimes(2);
  });

  test("usage that fails to answer leaves the cards as they are", async () => {
    const b = fakeBridge([{ sessions: [ONE], active: null }]);
    b.usage.mockRejectedValue(new Error("the bridge answered 500"));
    await open(b);
    expect(card("a1")).not.toBeNull();
    expect(root.querySelector(".usage-button")).toBeNull();
  });
});

describe("updating the bridge", () => {
  const BEHIND: BridgeInfo = {
    version: "bfe9eae",
    git: {
      branch: "main",
      commit: { hash: "bfe9eae", subject: "" },
      dirty: false,
      changed_files: 0,
      tracking: { name: "origin/main", ahead: 0, behind: 3 },
      main: null,
      parent: null,
      checked_at: "",
    },
  };

  async function openBehind() {
    const b = fakeBridge([{ sessions: [ONE], active: null }]);
    b.bridgeInfo.mockResolvedValue(BEHIND);
    await open(b);
    return b;
  }

  const button = (label: string) =>
    [...root.querySelectorAll<HTMLButtonElement>(".bridge-update button")].find(
      (x) => x.textContent === label,
    );

  test("a bridge that is up to date offers no update", async () => {
    await open(fakeBridge([{ sessions: [ONE], active: null }]));
    expect(root.querySelector(".bridge-update")).toBeNull();
  });

  test("a bridge behind its branch offers an update and says how far behind", async () => {
    await openBehind();
    expect(text(".bridge-update")).toContain("3 new commits");
    expect(button("Update")).toBeDefined();
  });

  test("the update starts only after the owner confirms", async () => {
    const b = await openBehind();
    button("Update")?.click();
    await settle();
    expect(b.startUpdate).not.toHaveBeenCalled();
    expect(text(".bridge-update")).toContain("The voice drops for a few seconds");
    button("Cancel")?.click();
    expect(button("Update now")).toBeUndefined();
    expect(button("Update")).toBeDefined();
  });

  test("confirming starts the update and shows the bridge's note", async () => {
    const b = await openBehind();
    button("Update")?.click();
    button("Update now")?.click();
    await settle();
    expect(b.startUpdate).toHaveBeenCalledTimes(1);
    expect(text(".bridge-update")).toContain("The voice connection drops for a few seconds");
  });

  test("each step of the update shows as it arrives", async () => {
    await openBehind();
    button("Update")?.click();
    button("Update now")?.click();
    await settle();
    FakeSource.last?.emit("update", { step: "fetch", ok: true, detail: "3 new commits", at: "" });
    FakeSource.last?.emit("update", { step: "test", ok: true, detail: "212 passed", at: "" });
    const steps = [...root.querySelectorAll(".bridge-update .step")].map((x) => x.textContent);
    expect(steps).toEqual(["✓ Fetching: 3 new commits", "✓ Running the tests: 212 passed"]);
  });

  test("when the stream comes back after the restart the result is read", async () => {
    const b = await openBehind();
    button("Update")?.click();
    button("Update now")?.click();
    await settle();
    FakeSource.last?.emit("update", { step: "restart", ok: true, detail: "", at: "" });
    FakeSource.last?.onerror?.(new Event("error"));
    expect(text(".bridge-update")).toContain("Restarting");
    b.lastUpdate.mockResolvedValue({
      running: false,
      steps: [
        { step: "restart", ok: true, detail: "", at: "" },
        { step: "verify", ok: true, detail: "answers", at: "" },
        { step: "done", ok: true, detail: "", at: "" },
      ],
      result: "updated",
      detail: "",
      to: "c0ffee1234",
    });
    FakeSource.last?.onopen?.(new Event("open"));
    await settle();
    expect(b.lastUpdate).toHaveBeenCalled();
    expect(text(".bridge-update")).toContain("Updated to c0ffee1");
  });

  test("a rolled-back update says the old version still runs", async () => {
    await openBehind();
    button("Update")?.click();
    button("Update now")?.click();
    await settle();
    FakeSource.last?.emit("update", { step: "rollback", ok: true, detail: "", at: "" });
    FakeSource.last?.emit("update", { step: "done", ok: false, detail: "", at: "", result: "rolled_back" });
    expect(text(".bridge-update")).toContain("Rolled back");
    expect(text(".bridge-update")).toContain("the old version still runs");
  });

  test("an update already running is said so", async () => {
    const b = await openBehind();
    b.startUpdate.mockResolvedValue({ outcome: "running", note: "" });
    button("Update")?.click();
    button("Update now")?.click();
    await settle();
    expect(text(".bridge-update")).toContain("An update is already running");
  });
});
