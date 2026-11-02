import { describe, expect, test, vi } from "vitest";
import { bridge, SignedOut } from "../src/bridge";

function answer(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("signing in", () => {
  test("the secret is sent as JSON to the sign-in address", async () => {
    const fetch = vi.fn(async () => answer(204));
    await bridge(fetch).signIn("s3cret");
    expect(fetch).toHaveBeenCalledWith("/api/v1/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: "s3cret" }),
    });
  });

  test.each([
    [204, "ok"],
    [401, "wrong"],
    [429, "too-many"],
    [500, "unreachable"],
  ])("an answer of %i means %s", async (status, outcome) => {
    expect(await bridge(async () => answer(status)).signIn("x")).toBe(outcome);
  });

  test("a bridge that cannot be reached is said so", async () => {
    const fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await bridge(fetch).signIn("x")).toBe("unreachable");
  });
});

describe("reading the sessions", () => {
  test("the list and the active session come back as the bridge sent them", async () => {
    const body = { sessions: [{ id: "a", name: "one" }], active: null };
    const fetch = vi.fn(async () => answer(200, body));
    expect(await bridge(fetch).snapshot()).toEqual(body);
    expect(fetch).toHaveBeenCalledWith("/api/v1/sessions", { cache: "no-store" });
  });

  test("an answer of 401 means the page is signed out", async () => {
    await expect(
      bridge(async () => answer(401, { error: "sign in first" })).snapshot(),
    ).rejects.toBeInstanceOf(SignedOut);
  });

  test("any other failure is an error that says what came back", async () => {
    await expect(bridge(async () => answer(502)).snapshot()).rejects.toThrow("502");
  });
});

describe("choosing the session the voice talks to", () => {
  test("the choice is sent with PUT and the new active session comes back", async () => {
    const active = {
      id: "a",
      name: "one",
      kind: "terminal",
      set_by: "page",
      set_at: "2026-11-02T13:05:00+00:00",
    };
    const fetch = vi.fn(async () => answer(200, active));
    expect(await bridge(fetch).choose("a")).toEqual(active);
    expect(fetch).toHaveBeenCalledWith("/api/v1/active", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: "a" }),
    });
  });

  test("choosing while signed out says so", async () => {
    await expect(bridge(async () => answer(401)).choose("a")).rejects.toBeInstanceOf(SignedOut);
  });
});

describe("signing out", () => {
  test("signing out is a POST to the sign-out address", async () => {
    const fetch = vi.fn(async () => answer(204));
    await bridge(fetch).signOut();
    expect(fetch).toHaveBeenCalledWith("/api/v1/signout", { method: "POST" });
  });
});

describe("asking what is missing", () => {
  test("the check comes back as the bridge sent it", async () => {
    const body = { ready: true, checked_at: "", checks: [] };
    const fetch = vi.fn(async () => answer(200, body));
    expect(await bridge(fetch).doctor()).toEqual(body);
    expect(fetch).toHaveBeenCalledWith("/api/v1/doctor", { cache: "no-store" });
  });

  test("asking while signed out says so", async () => {
    await expect(bridge(async () => answer(401)).doctor()).rejects.toBeInstanceOf(SignedOut);
  });
});

describe("asking how much is used", () => {
  test("usage comes back as the bridge sent it", async () => {
    const body = { plan: null, warning: null, voice: { label: "", today: {}, last_7_days: [] } };
    const fetch = vi.fn(async () => answer(200, body));
    expect(await bridge(fetch).usage()).toEqual(body);
    expect(fetch).toHaveBeenCalledWith("/api/v1/usage", { cache: "no-store" });
  });
});

describe("updating the bridge", () => {
  test("starting an update is a POST that comes back with the bridge's note", async () => {
    const fetch = vi.fn(async () => answer(202, { started: true, note: "The voice drops." }));
    expect(await bridge(fetch).startUpdate()).toEqual({ outcome: "started", note: "The voice drops." });
    expect(fetch).toHaveBeenCalledWith("/api/v1/update", { method: "POST" });
  });

  test.each([
    [409, "running"],
    [404, "unavailable"],
  ])("an answer of %i to starting an update means %s", async (status, outcome) => {
    expect((await bridge(async () => answer(status, {})).startUpdate()).outcome).toBe(outcome);
  });

  test("the latest update and the bridge's own version are read as sent", async () => {
    const run = { running: false, steps: [], result: "up_to_date", detail: "" };
    expect(await bridge(async () => answer(200, run)).lastUpdate()).toEqual(run);
    const info = { version: "bfe9eae", git: null };
    const fetch = vi.fn(async () => answer(200, info));
    expect(await bridge(fetch).bridgeInfo()).toEqual(info);
    expect(fetch).toHaveBeenCalledWith("/api/v1/bridge", { cache: "no-store" });
  });
});

describe("one session's output, what it waits for, and its pull requests", () => {
  test("the latest turns are asked for six at a time", async () => {
    const fetch = vi.fn(async () => answer(200, { status: "idle", turns: [], next_after: 0, turns_left: 0 }));
    await bridge(fetch).output("a 1");
    expect(fetch).toHaveBeenCalledWith("/api/v1/sessions/a%201/output?limit=6", { cache: "no-store" });
  });

  test("turns after a given one are asked for with after", async () => {
    const fetch = vi.fn(async () => answer(200, { status: "idle", turns: [], next_after: 0, turns_left: 0 }));
    await bridge(fetch).output("a1", 8);
    expect(fetch).toHaveBeenCalledWith("/api/v1/sessions/a1/output?limit=6&after=8", { cache: "no-store" });
  });

  test("what it waits for and its pull requests are read as sent", async () => {
    const pending = { waiting: false, question: null, approvals: [] };
    expect(await bridge(async () => answer(200, pending)).pending("a1")).toEqual(pending);
    const fetch = vi.fn(async () => answer(200, { prs: [] }));
    expect(await bridge(fetch).prs("a1")).toEqual({ prs: [] });
    expect(fetch).toHaveBeenCalledWith("/api/v1/sessions/a1/prs", { cache: "no-store" });
  });
});
