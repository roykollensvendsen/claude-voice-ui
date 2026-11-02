// The bridge's event API, as this app uses it. The specification is API.md.
import type { Session } from "./states";

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
