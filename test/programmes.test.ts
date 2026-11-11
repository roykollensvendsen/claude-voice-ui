// The sessions grouped by programme: one section each, folding, a switch to group by machine, and
// a read-only Organisation view. The programmes here are made up.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { start } from "../src/app";
import { bridge, type OrgProgramme, type Snapshot } from "../src/bridge";
import type { Session } from "../src/states";
import { FakeSource, fakeBridge, session } from "./fakes";

const ACME = { id: "acme", name: "Acme Robotics" };
const ZETA = { id: "zeta", name: "Zeta Garden" };
const ARM = { id: "arm", name: "Robot arm" };
const VISION = { id: "vision", name: "Camera vision" };
const DOCS = { id: "docs", name: "Handbook" };

const inAcme = (over: Partial<Session>) =>
  session({ programme: ACME, component: null, role: null, programme_wide: false, ...over });

const MANAGER = inAcme({
  id: "m1",
  name: "acme-manager",
  number: 1,
  role: { id: "manager", name: "Manager" },
  programme_wide: true,
});
const ARM_1 = inAcme({ id: "a1", name: "arm-motion", number: 2, component: ARM, status: "busy" });
const ARM_2 = inAcme({
  id: "a2",
  name: "arm-grip",
  number: 3,
  component: ARM,
  status: "waiting",
  question: { text: "Which gripper?" },
});
const VISION_1 = inAcme({ id: "v1", name: "vision-detect", number: 4, component: VISION });
const VISION_2 = inAcme({
  id: "lab-pc/v2",
  name: "vision-calibrate",
  machine: "lab-pc",
  component: VISION,
});
const DOCS_1 = inAcme({ id: "d1", name: "handbook-writer", number: 5, component: DOCS });
const GARDEN = session({ id: "z1", name: "garden-planner", number: 6, programme: ZETA, component: null });
const LOOSE = session({ id: "o1", name: "scratch", number: 7 });

const PROGRAMMES = [
  { ...ACME, order: 1 },
  { ...ZETA, order: 0 },
];
const ALL = [MANAGER, ARM_1, ARM_2, VISION_1, VISION_2, DOCS_1, GARDEN, LOOSE];
const SNAPSHOT: Snapshot = {
  sessions: ALL,
  active: null,
  programmes: PROGRAMMES,
  machines: [
    {
      name: "lab-pc",
      state: "online",
      reachable: true,
      error: null,
      checked_at: "",
      last_seen: "",
      sessions: true,
    },
  ],
};

const ORG: OrgProgramme = {
  ...ACME,
  aliases: ["acme"],
  components: [ARM, VISION, DOCS].map((c) => ({ ...c, aliases: [] })),
  roles: [
    {
      id: "manager",
      name: "Manager",
      component: null,
      programme_wide: true,
      address: "acme/manager",
      purpose: "Keeps the programme on course.",
      limits: "Never merges to main.",
      routing: ["decisions", "quality"],
      session_names: ["acme-manager"],
      sessions: ["m1"],
      running: true,
    },
    {
      id: "analyst",
      name: "Analyst",
      component: null,
      programme_wide: true,
      address: "acme/analyst",
      purpose: "Reads the numbers.",
      limits: "Read-only.",
      routing: ["facts"],
      session_names: [],
      sessions: [],
      running: false,
    },
  ],
  unfilled: ["analyst"],
};

let root: HTMLElement;
let stop: (() => void) | undefined;

async function open(snapshots: Snapshot[] = [SNAPSHOT]) {
  const b = fakeBridge(snapshots);
  b.org.mockResolvedValue(ORG);
  stop = start(root, { bridge: b, openEvents: (url) => new FakeSource(url) });
  await vi.advanceTimersByTimeAsync(0);
  return b;
}

const sections = () => [...root.querySelectorAll<HTMLElement>("section.programme")];
const section = (id: string) => root.querySelector<HTMLElement>(`section.programme[data-programme="${id}"]`);
const top = (id: string) => section(id)?.querySelector<HTMLButtonElement>("button.programme-top");
const shown = (where: ParentNode | null | undefined) =>
  [...(where?.querySelectorAll<HTMLElement>("[data-session]") ?? [])].map((x) => x.dataset.session);

async function wake() {
  Object.defineProperty(document, "hidden", { value: false, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(0);
}

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

describe("a section for each programme", () => {
  test("the programmes come in their own order, with Other last", async () => {
    await open();
    expect(sections().map((s) => s.querySelector(".programme-name")?.textContent)).toEqual([
      "Zeta Garden",
      "Acme Robotics",
      "Other",
    ]);
  });

  test("the programme-wide roles come first under their own heading, then every component under its name", async () => {
    await open();
    const acme = section("acme");
    const heads = [...(acme?.querySelectorAll(".part h3") ?? [])].map((h) => h.textContent);
    expect(heads).toEqual(["Whole programme", "Robot arm", "Camera vision", "Handbook"]);
    expect(shown(acme)).toEqual(["m1", "a1", "a2", "v1", "lab-pc/v2", "d1"]);
  });

  test("a component with one session keeps its name, in a small group beside the others", async () => {
    await open();
    const docs = [...(section("acme")?.querySelectorAll<HTMLElement>(".part") ?? [])].at(-1);
    expect(docs?.querySelector("h3")?.textContent).toBe("Handbook");
    expect(docs?.classList.contains("small")).toBe(true);
    expect(shown(docs)).toEqual(["d1"]);
  });

  test("a session in no component and not programme-wide is said to be outside the components", async () => {
    await open();
    top("zeta")?.click();
    expect(section("zeta")?.querySelector(".part h3")?.textContent).toBe("Outside the components");
  });

  test("two sessions with the same name each say what tells them apart", async () => {
    const one = inAcme({
      id: "q1",
      name: "acme-quality",
      number: 8,
      programme_wide: true,
      kind: "terminal",
      minutes_since_update: 5,
    });
    const two = inAcme({
      id: "q2",
      name: "acme-quality",
      number: 9,
      programme_wide: true,
      kind: "bridge-session",
      minutes_since_update: 720,
    });
    await open([{ ...SNAPSHOT, sessions: [...ALL, one, two] }]);
    const twin = (id: string) => root.querySelector(`[data-session="${id}"] .twin`)?.textContent;
    expect(twin("q1")).toBe("In a terminal · heard from 5 min ago");
    expect(twin("q2")).toBe("Started by the bridge · heard from 12 h ago");
    expect(root.querySelector('[data-session="m1"] .twin')).toBeNull();
  });

  test("a section's heading counts what waits and what works", async () => {
    await open();
    expect(section("acme")?.querySelector(".programme-counts")?.textContent).toBe("1 waiting · 1 working");
  });

  test("hidden sessions are left out of the counts and said apart", async () => {
    localStorage.setItem("cvu.hidden", JSON.stringify({ a1: "working|" }));
    await open();
    expect(section("acme")?.querySelector(".programme-counts")?.textContent).toBe("1 waiting · 1 hidden");
  });

  test("a session on another computer carries its machine as a tag, and keeps its full name", async () => {
    await open();
    const row = section("acme")?.querySelector<HTMLElement>('[data-session="lab-pc/v2"]');
    expect(row?.querySelector(".machine-tag")?.textContent).toBe("lab-pc");
    expect(row?.querySelector(".name")?.textContent).toBe("vision-calibrate");
    expect(section("acme")?.querySelector('[data-session="a1"] .number')?.textContent).toBe("2");
  });
});

describe("folding", () => {
  test("a section opens on its own when something in it waits, works or failed", async () => {
    await open();
    expect(top("acme")?.getAttribute("aria-expanded")).toBe("true");
    expect(top("zeta")?.getAttribute("aria-expanded")).toBe("false");
    expect(shown(section("zeta"))).toEqual([]);
    expect(top("other")?.getAttribute("aria-expanded")).toBe("false");
  });

  test("a section is never folded on its own once open", async () => {
    const calm: Session[] = ALL.map((s) => ({ ...s, status: "idle", question: undefined }));
    await open([SNAPSHOT, { ...SNAPSHOT, sessions: calm }]);
    await wake();
    expect(top("acme")?.getAttribute("aria-expanded")).toBe("true");
  });

  test("a section folded by hand stays folded until something new waits in it", async () => {
    const asks = ALL.map((s) =>
      s.id === "z1" ? { ...s, status: "waiting", question: { text: "Plant?" } } : s,
    );
    await open([SNAPSHOT, SNAPSHOT, { ...SNAPSHOT, sessions: asks }]);
    top("acme")?.click();
    expect(shown(section("acme"))).toEqual([]);
    await wake();
    expect(top("acme")?.getAttribute("aria-expanded")).toBe("false");
    await wake();
    expect(top("zeta")?.getAttribute("aria-expanded")).toBe("true");
    expect(top("acme")?.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("grouping by machine", () => {
  test("a switch groups the sessions by machine instead, and the phone remembers it", async () => {
    await open();
    const choice = (words: string) =>
      [...root.querySelectorAll<HTMLButtonElement>(".group-switch button")].find(
        (b) => b.textContent === words,
      );
    expect(choice("By programme")?.getAttribute("aria-pressed")).toBe("true");
    choice("By machine")?.click();
    expect(sections()).toEqual([]);
    expect(root.querySelector('section.machine[data-machine="lab-pc"]')).not.toBeNull();
    expect(choice("By machine")?.getAttribute("aria-pressed")).toBe("true");
    stop?.();
    await open();
    expect(sections()).toEqual([]);
    expect(root.querySelector('section.machine[data-machine="lab-pc"]')).not.toBeNull();
  });

  test("a bridge without programmes shows the page as before", async () => {
    const old = ALL.map(({ programme, component, role, programme_wide, address, ...rest }) => rest);
    await open([{ sessions: old, active: null }]);
    expect(sections()).toEqual([]);
    expect(root.querySelector(".group-switch")).toBeNull();
    expect(shown(root)).toHaveLength(ALL.length);
  });

  test("a change to the programmes on the stream shows at once", async () => {
    await open();
    FakeSource.last?.emit("programmes", {
      programmes: [
        { ...ACME, name: "Acme Arms", order: 0 },
        { ...ZETA, order: 1 },
      ],
    });
    expect(sections().map((s) => s.querySelector(".programme-name")?.textContent)).toEqual([
      "Acme Arms",
      "Zeta Garden",
      "Other",
    ]);
  });
});

describe("the Organisation view", () => {
  test("each role shows its purpose, who fills it, its limits and routing, and an unfilled one is marked", async () => {
    const b = await open();
    section("acme")?.querySelector<HTMLButtonElement>("button.org-open")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.org).toHaveBeenCalledWith("acme");
    const org = root.querySelector(".org");
    expect(org?.querySelector("h2")?.textContent).toBe("Acme Robotics");
    const roles = [...(org?.querySelectorAll<HTMLElement>("li.role") ?? [])];
    expect(roles.map((r) => r.querySelector(".role-name")?.textContent)).toEqual(["Manager", "Analyst"]);
    expect(roles[0]?.querySelector(".role-purpose")?.textContent).toBe("Keeps the programme on course.");
    expect(roles[0]?.querySelector(".role-sessions")?.textContent).toBe("acme-manager · running");
    expect(roles[0]?.querySelector(".role-limits")?.textContent).toBe("Never merges to main.");
    expect(roles[0]?.querySelector(".role-routing")?.textContent).toBe("Routes decisions, quality");
    expect(roles[1]?.classList.contains("unfilled")).toBe(true);
    expect(roles[1]?.querySelector(".role-sessions")?.textContent).toBe("No session fills this role");
    org?.querySelector<HTMLButtonElement>("button.back")?.click();
    expect(root.querySelector(".org")).toBeNull();
    expect(section("acme")).not.toBeNull();
  });

  test("Other has no Organisation view", async () => {
    await open();
    top("other")?.click();
    expect(section("other")?.querySelector("button.org-open")).toBeNull();
  });

  test("the Organisation view is read from the bridge, and an unknown programme gives none", async () => {
    const reply = (status: number, body?: unknown) =>
      new Response(body === undefined ? null : JSON.stringify(body), { status });
    const fetch = vi.fn(async () => reply(200, ORG));
    expect(await bridge(fetch).org("acme")).toEqual(ORG);
    expect(fetch).toHaveBeenCalledWith("/api/v1/org/acme", { cache: "no-store" });
    expect(await bridge(async () => reply(404)).org("nope")).toBeNull();
  });
});
