// The bridge's event API, as this app uses it. The specification is API.md.
import type { Git } from "./git";
import type { Session } from "./states";
import type { Usage } from "./usage";

/** The session the voice sends to by default. */
export interface Active {
  id: string;
  name: string;
  kind: string;
  set_by: string;
  set_at: string;
}

export interface Snapshot {
  sessions: Session[];
  active: Active | null;
}

/** One dependency the bridge checks, as GET /api/v1/doctor gives it. */
export interface Check {
  id: string;
  title: string;
  ok: boolean;
  required: boolean;
  /** What the owner loses while it is missing, in words. */
  affects: string;
  detail: string;
  /** Text for a person to run or follow. Never a secret. */
  fix: string;
  fix_url: string | null;
}

export interface Doctor {
  ready: boolean;
  checked_at: string;
  checks: Check[];
}

/** The bridge's own version, and where its folder stands against its branch. */
export interface BridgeInfo {
  version: string;
  git: Git | null;
}

export interface UpdateStep {
  step: string;
  ok: boolean;
  detail: string;
  at: string;
  /** Sent with the last step. */
  result?: UpdateResult;
}

export type UpdateResult = "updated" | "up_to_date" | "stopped" | "rolled_back";

/** The latest update, as GET /api/v1/update gives it. */
export interface UpdateRun {
  running: boolean;
  steps: UpdateStep[];
  result: UpdateResult | null;
  detail: string;
  to?: string;
}

export interface UpdateStart {
  outcome: "started" | "running" | "unavailable";
  note: string;
}

export type SignIn = "ok" | "wrong" | "too-many" | "unreachable";

/** The bridge answered 401: the sign-in cookie is missing or has run out. */
export class SignedOut extends Error {
  constructor() {
    super("signed out");
  }
}

export interface Bridge {
  signIn(secret: string): Promise<SignIn>;
  signOut(): Promise<void>;
  snapshot(): Promise<Snapshot>;
  choose(session: string): Promise<Active>;
  doctor(): Promise<Doctor>;
  usage(): Promise<Usage>;
  bridgeInfo(): Promise<BridgeInfo>;
  startUpdate(): Promise<UpdateStart>;
  lastUpdate(): Promise<UpdateRun>;
}

/** The API is always at /api/v1 on the page's own origin, wherever the page itself is served. */
const BASE = "/api/v1";

const JSON_HEADERS = { "Content-Type": "application/json" };

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

async function read<T>(response: Response): Promise<T> {
  if (response.status === 401) throw new SignedOut();
  if (!response.ok) throw new Error(`the bridge answered ${response.status}`);
  return (await response.json()) as T;
}

export function bridge(fetch: Fetch = globalThis.fetch.bind(globalThis)): Bridge {
  return {
    async signIn(secret) {
      let response: Response;
      try {
        response = await fetch(`${BASE}/signin`, {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ secret }),
        });
      } catch {
        return "unreachable";
      }
      if (response.status === 204) return "ok";
      if (response.status === 401) return "wrong";
      if (response.status === 429) return "too-many";
      return "unreachable";
    },
    async signOut() {
      await fetch(`${BASE}/signout`, { method: "POST" });
    },
    async snapshot() {
      return read<Snapshot>(await fetch(`${BASE}/sessions`, { cache: "no-store" }));
    },
    async doctor() {
      return read<Doctor>(await fetch(`${BASE}/doctor`, { cache: "no-store" }));
    },
    async usage() {
      return read<Usage>(await fetch(`${BASE}/usage`, { cache: "no-store" }));
    },
    async bridgeInfo() {
      return read<BridgeInfo>(await fetch(`${BASE}/bridge`, { cache: "no-store" }));
    },
    async startUpdate() {
      const response = await fetch(`${BASE}/update`, { method: "POST" });
      if (response.status === 409) return { outcome: "running", note: "" };
      if (response.status === 404) return { outcome: "unavailable", note: "" };
      const body = await read<{ note?: string }>(response);
      return { outcome: "started", note: body.note ?? "" };
    },
    async lastUpdate() {
      return read<UpdateRun>(await fetch(`${BASE}/update`, { cache: "no-store" }));
    },
    async choose(session) {
      return read<Active>(
        await fetch(`${BASE}/active`, {
          method: "PUT",
          headers: JSON_HEADERS,
          body: JSON.stringify({ session }),
        }),
      );
    },
  };
}
