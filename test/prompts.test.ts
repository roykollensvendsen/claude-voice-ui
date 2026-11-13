import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { start } from "../src/app";
import type { Bridge, Prompt } from "../src/bridge";
import { bridge } from "../src/bridge";
import { FakeSource, fakeBridge, longPress, session } from "./fakes";

let root: HTMLElement;
let stop: (() => void) | undefined;

const ASKER = session({ id: "q-1", name: "asker", number: 1, state: "answer" });
const RUNNER = session({ id: "r-2", name: "runner", number: 2, state: "approval" });
const QUESTION: Prompt = {
  id: "p1",
  session: "q-1",
  kind: "question",
  question: {
    text: "Which colour?",
    header: "Colour",
    options: [
      { label: "blue", description: "Calm" },
      { label: "red", description: "Loud" },
    ],
    multi: false,
  },
  tool: null,
  input: null,
  cut: false,
  asked_at: "",
};
const MANY: Prompt = { ...QUESTION, id: "p3", question: { ...QUESTION.question!, multi: true } };
const APPROVAL: Prompt = {
  id: "p2",
  session: "r-2",
  kind: "approval",
  question: null,
  tool: "Bash",
  input: "rm -rf build",
  cut: false,
  asked_at: "",
};

async function open(b: Bridge) {
  stop = start(root, { bridge: b, openEvents: (url) => new FakeSource(url) });
  await vi.advanceTimersByTimeAsync(0);
}

function withPrompts(...prompts: Prompt[]) {
  const b = fakeBridge([{ sessions: [ASKER, RUNNER], active: null }]);
  b.prompts.mockResolvedValue(prompts);
  return b;
}

const box = () => root.querySelector<HTMLElement>(".detail .prompt");
const buttonIn = (label: string) =>
  [...(box()?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find((b) =>
    b.textContent?.startsWith(label),
  );

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

describe("answering a question from the phone", () => {
  test("a session's page shows its open question with each option as a button", async () => {
    await open(withPrompts(QUESTION));
    await longPress(root, "q-1");
    expect(box()?.textContent).toContain("Which colour?");
    expect(buttonIn("blue")?.textContent).toBe("blueCalm");
    expect(buttonIn("red")).toBeDefined();
  });

  test("tapping an option sends it as the answer, and the question goes", async () => {
    const b = withPrompts(QUESTION);
    await open(b);
    await longPress(root, "q-1");
    buttonIn("blue")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.answer).toHaveBeenCalledWith("p1", { answer: "blue" });
    expect(box()).toBeNull();
    expect(root.querySelector(".detail .answered")?.textContent).toBe("Answered: blue");
  });

  test("a question that takes several answers sends the ones ticked", async () => {
    const b = withPrompts(MANY);
    await open(b);
    await longPress(root, "q-1");
    const ticks = box()?.querySelectorAll<HTMLInputElement>("input[type=checkbox]") ?? [];
    expect(ticks).toHaveLength(2);
    ticks[0]?.click();
    ticks[1]?.click();
    buttonIn("Send")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.answer).toHaveBeenCalledWith("p3", { answer: ["blue", "red"] });
  });

  test("an answer of its own can be written instead", async () => {
    const b = withPrompts(QUESTION);
    await open(b);
    await longPress(root, "q-1");
    const own = box()?.querySelector<HTMLInputElement>("input.own");
    if (own) own.value = "green";
    buttonIn("Send")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.answer).toHaveBeenCalledWith("p1", { answer: { text: "green" } });
  });
});

describe("answering an approval from the phone", () => {
  test("the page shows what would run, with Allow and Deny", async () => {
    await open(withPrompts(APPROVAL));
    await longPress(root, "r-2");
    expect(box()?.querySelector(".tool")?.textContent).toBe("Bash");
    expect(box()?.querySelector("pre")?.textContent).toBe("rm -rf build");
    expect(buttonIn("Allow")).toBeDefined();
    expect(buttonIn("Deny")).toBeDefined();
  });

  test.each([
    ["Allow", "allow"],
    ["Deny", "deny"],
  ])("%s sends that decision", async (label, decision) => {
    const b = withPrompts(APPROVAL);
    await open(b);
    await longPress(root, "r-2");
    buttonIn(label)?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.answer).toHaveBeenCalledWith("p2", { decision });
  });

  test("a cut command says it was cut", async () => {
    await open(withPrompts({ ...APPROVAL, cut: true }));
    await longPress(root, "r-2");
    expect(box()?.textContent).toContain("cut short");
  });
});

describe("prompts that change under the phone", () => {
  test("an answer that no longer fits says why, and the question stays", async () => {
    const b = withPrompts(QUESTION);
    b.answer.mockResolvedValue({ refused: "that option is not offered" });
    await open(b);
    await longPress(root, "q-1");
    buttonIn("blue")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(box()?.querySelector(".error")?.textContent).toBe("that option is not offered");
  });

  test("an answer that fails says why under the question", async () => {
    const b = withPrompts(QUESTION);
    b.answer.mockRejectedValue(new TypeError("Failed to fetch"));
    await open(b);
    await longPress(root, "q-1");
    buttonIn("blue")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(box()?.querySelector(".error")?.textContent).toBe(
      "The answer did not reach the bridge: no connection. Try again.",
    );
    expect(root.querySelector(".notice")).toBeNull();
  });

  async function refusedWith(done: { refused: string; status?: number }) {
    const b = withPrompts(QUESTION);
    b.answer.mockResolvedValue(done);
    await open(b);
    await longPress(root, "q-1");
    buttonIn("blue")?.click();
    await vi.advanceTimersByTimeAsync(0);
    return box()?.querySelector(".error")?.textContent;
  }

  test("an answer the bridge refuses for another reason says its status and its words", async () => {
    expect(await refusedWith({ refused: "the session is busy", status: 500 })).toBe(
      "The bridge refused the answer (500): the session is busy",
    );
  });

  test("a refusal without the bridge's words still says what happened", async () => {
    expect(await refusedWith({ refused: "", status: 500 })).toBe(
      "The bridge refused the answer (500): it did not say why. Try again.",
    );
    expect(await refusedWith({ refused: "" })).toBe(
      "The bridge refused the answer: it did not say why. Try again.",
    );
  });

  test("an answer refused as coming from another page says where to answer instead", async () => {
    expect(await refusedWith({ refused: "not from an allowed page", status: 403 })).toBe(
      "The bridge refused the answer (403): not from an allowed page. " +
        "Open this page at the bridge's own address, on the tailnet, and answer again.",
    );
  });

  test("a question answered elsewhere says so and goes", async () => {
    const b = withPrompts(QUESTION);
    b.answer.mockResolvedValue("gone");
    await open(b);
    await longPress(root, "q-1");
    buttonIn("blue")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(box()).toBeNull();
    expect(root.querySelector(".detail .answered")?.textContent).toBe("Already answered somewhere else.");
  });

  test("a prompt opened on the stream shows, and one closed goes", async () => {
    await open(withPrompts());
    await longPress(root, "q-1");
    expect(box()).toBeNull();
    FakeSource.last?.emit("prompt", QUESTION);
    expect(box()?.textContent).toContain("Which colour?");
    FakeSource.last?.emit("prompt_closed", { id: "p1", how: "screen" });
    expect(box()).toBeNull();
  });

  test("the open prompts are read again whenever the stream connects", async () => {
    const b = withPrompts();
    await open(b);
    const before = b.prompts.mock.calls.length;
    FakeSource.last?.onopen?.(new Event("open"));
    await vi.advanceTimersByTimeAsync(0);
    expect(b.prompts.mock.calls.length).toBe(before + 1);
  });

  test("the count at the top counts open prompts too", async () => {
    const quiet = session({ id: "q-1", name: "asker", number: 1, status: "busy" });
    const b = fakeBridge([{ sessions: [quiet], active: null }]);
    b.prompts.mockResolvedValue([QUESTION]);
    await open(b);
    expect(root.querySelector("header .waiting-count")?.textContent).toBe("❓1");
  });
});

describe("the bridge's prompts calls", () => {
  test("an answer is posted, and 409 and 404 are told apart", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "no such option" }), { status: 409 }))
      .mockResolvedValueOnce(new Response("{}", { status: 404 }));
    const api = bridge(fetch);
    expect(await api.answer("p1", { answer: "blue" })).toBe("ok");
    expect(fetch).toHaveBeenCalledWith("/api/v1/prompts/p1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: "blue" }),
    });
    expect(await api.answer("p1", { answer: "x" })).toEqual({ refused: "no such option" });
    expect(await api.answer("p1", { answer: "x" })).toBe("gone");
  });

  test("any other refusal from the bridge comes back with its status and its words", async () => {
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    const api = (r: Response) => bridge(vi.fn().mockResolvedValue(r));
    expect(
      await api(reply(403, { error: "not from an allowed page" })).answer("p1", { answer: "blue" }),
    ).toEqual({
      refused: "not from an allowed page",
      status: 403,
    });
    expect(await api(new Response("oops", { status: 500 })).answer("p1", { answer: "blue" })).toEqual({
      refused: "",
      status: 500,
    });
  });
});
