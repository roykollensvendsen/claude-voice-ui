import { describe, expect, test } from "vitest";
import {
  cardState,
  LOOK,
  minutesInState,
  type Session,
  sortForCards,
  timeInState,
  timeInWords,
} from "../src/states";

function session(over: Partial<Session> = {}): Session {
  return {
    id: "5f3c",
    name: "billing-ab",
    kind: "terminal",
    project: "billing",
    status: "idle",
    doing: "",
    minutes_since_update: 0,
    ...over,
  };
}

describe("the state a card shows", () => {
  test("a busy session is working", () => {
    expect(cardState(session({ status: "busy" }))).toBe("working");
  });

  test("a running bridge session is working", () => {
    expect(cardState(session({ kind: "bridge-session", status: "running" }))).toBe("working");
  });

  test("an idle session is idle", () => {
    expect(cardState(session({ status: "idle" }))).toBe("idle");
  });

  test("a session running a command is at the shell", () => {
    expect(cardState(session({ status: "shell" }))).toBe("shell");
  });

  test("a session with a question waits for an answer", () => {
    const question = { text: "Which file?", options: ["a.py"] };
    const s = session({ status: "waiting", waiting_for: "approval", question });
    expect(cardState(s)).toBe("answer");
  });

  test("a session waiting for permission waits for approval", () => {
    expect(cardState(session({ status: "waiting", waiting_for: "permission to run Bash" }))).toBe("approval");
  });

  test("a session waiting with no question or permission waits for an answer", () => {
    expect(cardState(session({ status: "waiting" }))).toBe("answer");
  });

  test("a moved session is moved", () => {
    expect(cardState(session({ status: "moved", moved_to: { id: "x", name: "billing-cd" } }))).toBe("moved");
  });

  test.each(["error", "cancelled", "interrupted", "stopped"])(
    "a bridge session that is %s has stopped",
    (status) => {
      expect(cardState(session({ kind: "bridge-session", status }))).toBe("stopped");
    },
  );

  test("the state the bridge reports wins over the app's own reading", () => {
    expect(cardState(session({ status: "waiting", state: "approval" }))).toBe("approval");
    expect(cardState(session({ status: "busy", state: "idle" }))).toBe("idle");
  });

  test("a session waiting for input has its own state", () => {
    expect(cardState(session({ status: "waiting", state: "input", waiting_kind: "input" }))).toBe("input");
  });

  test("a state the app does not know falls back to the app's own reading", () => {
    expect(cardState(session({ status: "busy", state: "something-new" }))).toBe("working");
  });

  test("a status the app does not know is shown as idle", () => {
    expect(cardState(session({ status: "something-new" }))).toBe("idle");
  });
});

describe("how each state looks", () => {
  test("every state has its own icon, label and meaning", () => {
    const looks = Object.values(LOOK);
    expect(looks).toHaveLength(8);
    expect(new Set(looks.map((l) => l.icon)).size).toBe(8);
    expect(new Set(looks.map((l) => l.label)).size).toBe(8);
    expect(new Set(looks.map((l) => l.meaning)).size).toBe(8);
  });

  test("every kind of waiting is amber, as in the design draft", () => {
    expect([LOOK.answer.tone, LOOK.approval.tone, LOOK.input.tone]).toEqual(["amber", "amber", "amber"]);
  });

  test("the states that are not waiting each have a colour of their own", () => {
    const rest = [LOOK.working, LOOK.idle, LOOK.shell, LOOK.moved, LOOK.stopped].map((l) => l.tone);
    expect(rest).toEqual(["green", "grey", "slate", "faded", "red"]);
    expect(rest).not.toContain("amber");
  });
});

describe("the order of the cards", () => {
  test("sessions waiting for the owner come first", () => {
    const sorted = sortForCards([
      session({ id: "a", status: "busy", minutes_since_update: 0 }),
      session({ id: "b", status: "waiting", minutes_since_update: 30 }),
      session({ id: "c", status: "idle", minutes_since_update: 1 }),
    ]);
    expect(sorted.map((s) => s.id)).toEqual(["b", "a", "c"]);
  });

  test("otherwise the most recently changed session comes first", () => {
    const sorted = sortForCards([
      session({ id: "a", minutes_since_update: 9 }),
      session({ id: "b", minutes_since_update: 2 }),
    ]);
    expect(sorted.map((s) => s.id)).toEqual(["b", "a"]);
  });

  test("a session waiting for input also comes first", () => {
    const sorted = sortForCards([
      session({ id: "a", status: "busy", minutes_since_update: 0 }),
      session({ id: "b", state: "input", minutes_since_update: 30 }),
    ]);
    expect(sorted.map((s) => s.id)).toEqual(["b", "a"]);
  });

  test("sorting leaves the list it was given as it was", () => {
    const given = [
      session({ id: "a", minutes_since_update: 9 }),
      session({ id: "b", minutes_since_update: 2 }),
    ];
    sortForCards(given);
    expect(given.map((s) => s.id)).toEqual(["a", "b"]);
  });
});

describe("the time a card has been in its state", () => {
  test.each([
    [0, "just now"],
    [1, "1 min"],
    [59, "59 min"],
    [60, "1 h"],
    [150, "2 h"],
    [24 * 60, "1 d"],
    [3 * 24 * 60 + 5, "3 d"],
  ])("%i minutes reads %s", (minutes, text) => {
    expect(timeInState(minutes)).toBe(text);
  });
});

describe("how long a session has been in its state", () => {
  const now = Date.parse("2026-11-02T15:00:00Z");

  test("time in state counts from when the state changed, when the bridge says", () => {
    const s = session({ minutes_since_update: 1, state_since: "2026-11-02T14:48:30Z" });
    expect(minutesInState(s, now)).toBe(11);
  });

  test("without a time of change the last update is used", () => {
    expect(minutesInState(session({ minutes_since_update: 4 }), now)).toBe(4);
  });

  test("a time of change in the future reads as just now", () => {
    expect(minutesInState(session({ state_since: "2026-11-02T15:02:00Z" }), now)).toBe(0);
  });
});

describe("time in a state, in words", () => {
  test.each([
    [0, "just now"],
    [1, "1 minute"],
    [57, "57 minutes"],
    [60, "1 hour"],
    [150, "2 hours"],
    [24 * 60, "1 day"],
    [3 * 24 * 60 + 5, "3 days"],
  ])("%i minutes reads as %s", (minutes, words) => {
    expect(timeInWords(minutes)).toBe(words);
  });
});
