// Stand-ins for the bridge and its event stream, shared by the app's tests.
import { vi } from "vitest";
import {
  type Active,
  type Bridge,
  type BridgeInfo,
  type Doctor,
  type Output,
  type Pending,
  type Prs,
  SignedOut,
  type SignIn,
  type Snapshot,
  type UpdateRun,
  type UpdateStart,
} from "../src/bridge";
import type { EventSourceLike } from "../src/live";
import type { Session } from "../src/states";
import type { Usage } from "../src/usage";

export class FakeSource implements EventSourceLike {
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

export function session(over: Partial<Session>): Session {
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

export const ONE = session({
  id: "a1",
  name: "billing-ab",
  project: "billing",
  status: "busy",
  doing: "Fixing totals.",
});
export const TWO = session({
  id: "b2",
  name: "docs-cd",
  project: "docs",
  status: "idle",
  minutes_since_update: 12,
});
export const ACTIVE_ONE: Active = {
  id: "a1",
  name: "billing-ab",
  kind: "terminal",
  set_by: "voice",
  set_at: "",
};

export const ALL_OK: Doctor = { ready: true, checked_at: "", checks: [] };
export const NO_USAGE: Usage = {
  plan: null,
  warning: null,
  voice: {
    label: "estimate, voice activity via the bridge",
    today: { connections: 0, minutes: 0, tool_calls: 0, chars_out: 0, est_tokens: 0 },
    last_7_days: [],
  },
};

export function check(over: Partial<Doctor["checks"][number]>): Doctor["checks"][number] {
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

export function fakeBridge(snapshots: (Snapshot | "signed-out")[], signIn: SignIn = "ok") {
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
    usage: vi.fn(async (): Promise<Usage> => NO_USAGE),
    bridgeInfo: vi.fn(async (): Promise<BridgeInfo> => ({ version: "bfe9eae", git: null })),
    startUpdate: vi.fn(
      async (): Promise<UpdateStart> => ({
        outcome: "started",
        note: "The voice connection drops for a few seconds while the bridge restarts.",
      }),
    ),
    lastUpdate: vi.fn(
      async (): Promise<UpdateRun> => ({ running: false, steps: [], result: null, detail: "" }),
    ),
    output: vi.fn(
      async (_id: string, _after?: number): Promise<Output> => ({
        status: "idle",
        turns: [],
        next_after: 0,
        turns_left: 0,
      }),
    ),
    pending: vi.fn(
      async (_id: string): Promise<Pending> => ({ waiting: false, question: null, approvals: [] }),
    ),
    prs: vi.fn(async (_id: string): Promise<Prs> => ({ prs: [] })),
  } satisfies Bridge & { snapshotCalls: () => number };
}

/** Hold a finger on a session long enough to open its page, then lift it. */
export async function longPress(root: HTMLElement, id: string) {
  root.querySelector(`[data-session="${id}"]`)?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  await vi.advanceTimersByTimeAsync(500);
  document.dispatchEvent(new Event("pointerup", { bubbles: true }));
  root.querySelector<HTMLElement>(`[data-session="${id}"]`)?.click();
  // The page waits a moment after the finger lifts before it redraws.
  await vi.advanceTimersByTimeAsync(500);
}
