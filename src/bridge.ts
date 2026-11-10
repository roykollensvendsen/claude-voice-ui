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

/** Another computer the bridge reaches, as GET /api/v1/sessions lists it. The bridge's own is not listed. */
export interface Machine {
  name: string;
  /** Absent from a bridge that gives only `reachable`. */
  state?: "online" | "slow" | "offline" | "agent_down" | "not_approved"; // not shown
  reachable: boolean;
  /** Why it is not reachable, in the bridge's words; null while it is. */
  error: string | null;
  checked_at: string | null;
  last_seen: string | null;
  /** Whether it offers its Claude Code sessions at all. */
  sessions: boolean;
}

export interface Snapshot {
  sessions: Session[];
  active: Active | null;
  /** Absent from a bridge that reaches no other computer. */
  machines?: Machine[];
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

/** One turn of a session's conversation; texts are cut to 600 characters. */
export interface Turn {
  index: number;
  role: string;
  text: string;
  cut: boolean;
  length: number;
}

export interface Output {
  status: string;
  turns: Turn[];
  next_after: number;
  turns_left: number;
}

export interface Pending {
  waiting: boolean;
  question: { text: string; options?: string[] } | null;
  approvals: { id: string; number: number; tool: string; summary: string }[];
}

/** A question or an approval a session holds for the phone, as GET /api/v1/prompts gives it. */
export interface Prompt {
  id: string;
  /** The Claude session's id, the same as a session's `id`. */
  session: string;
  kind: "question" | "approval";
  question: {
    text: string;
    header: string;
    options: { label: string; description: string }[];
    multi: boolean;
  } | null;
  tool: string | null;
  /** What an approval would run: the command, the file or short JSON, at most 300 characters. */
  input: string | null;
  cut: boolean;
  asked_at: string;
}

/** What a session's own page shows, as GET /api/v1/sessions/{session}/detail gives it. */
export interface SessionDetail {
  session: string;
  number: number | null;
  name: string;
  context: { used_percentage: number; as_of: string } | null;
  tool_calls: { total: number; by_tool: Record<string, number> };
  subagents: { running: number; total: number };
  /** At most the 50 newest, newest first. */
  timeline: { at: string | null; kind: string; text: string; url?: string }[];
  summary: string | null;
  summary_state: "none" | "generating" | "ready" | "error";
  summary_error: string | null;
  summary_at: string | null;
}

/** One measure of a repository's code, as GET /api/v1/health/software gives it. */
export interface Metric {
  id: string;
  label: string;
  value: number | string;
  unit: string;
  text: string;
  status: "ok" | "warn" | "bad" | "unknown";
  url: string;
  /** Up to 30 earlier values, oldest first. */
  trend: number[];
}

export interface SoftwareHealth {
  as_of: string;
  repos: { name: string; url: string; as_of: string; metrics: Metric[] }[];
}

/** How the bridge starts new sessions, as GET /api/v1/settings gives it. */
export interface Settings {
  remote_control: boolean;
  start_in: "terminal" | "background";
  updated_at: string | null;
}

export type Reply =
  | { answer: string | string[] | { text: string } }
  | { decision: "allow" | "deny"; reason?: string };

/** "gone" when it was answered or closed elsewhere; `refused` when the answer does not fit it. */
export type Answered = "ok" | "gone" | { refused: string };

export interface Pr {
  number: number;
  title: string;
  url: string;
  draft: boolean;
}

export interface Prs {
  prs: Pr[];
}

/** Whether the page was opened on the bridge's own computer, and not through Tailscale or another site. */
export type Whoami = { here: boolean };

/** What the bridge did when asked to open a session's terminal, or (403, 409, 501) why it would not. */
export type Focused =
  | { done: "raised" | "attached" } // not shown
  | { reason: "not_here" | "not_local" | "no_window" | "not_running" | "no_window_list" }; // not shown

/** What the team's sessions wait on the owner for, and the open pull requests, as GET /api/v1/work gives them. */
export interface Work {
  as_of: string;
  waiting_on_owner: {
    id: string;
    text: string;
    /** An exact command for the owner to run, when there is one. */
    command: string | null;
    since: string;
    repo: string | null;
    /** The session it is about, by the name on its page. */
    session: string | null;
  }[];
  open_prs: {
    repo: string;
    number: number;
    title: string;
    url: string;
    checks: "pass" | "fail" | "pending"; // not shown
    draft: boolean;
  }[];
  /** Repositories whose pull requests could not be read just now. */
  unreadable?: string[];
}

export type SignIn = "ok" | "wrong" | "too-many" | "unreachable";

/** The bridge answered 401: the sign-in cookie is missing or has run out. */
export class SignedOut extends Error {
  constructor() {
    super("signed out"); // not shown
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
  output(session: string, after?: number): Promise<Output>;
  pending(session: string): Promise<Pending>;
  prs(session: string): Promise<Prs>;
  prompts(): Promise<Prompt[]>;
  answer(prompt: string, reply: Reply): Promise<Answered>;
  detail(session: string): Promise<SessionDetail>;
  /** Asks for a new summary in `language`; it arrives on the stream. */
  /** Ask for a new summary; the bridge's reason when it refuses, otherwise null. */
  summarize(session: string, language: string): Promise<string | null>;
  health(): Promise<SoftwareHealth>;
  settings(): Promise<Settings>;
  changeSettings(change: Partial<Settings>): Promise<Settings>;
  /** The team's work; null from a bridge that has none. */
  work(): Promise<Work | null>;
  /** Where the page was opened (an older bridge means not here), and bringing a terminal forward there. */
  whoami(): Promise<Whoami>;
  focus(session: string): Promise<Focused>;
}

/** The API is always at /api/v1 on the page's own origin, wherever the page itself is served. */
const BASE = "/api/v1";

const JSON_HEADERS = { "Content-Type": "application/json" };

const one = (session: string) => `${BASE}/sessions/${encodeURIComponent(session)}`;

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

async function read<T>(response: Response): Promise<T> {
  if (response.status === 401) throw new SignedOut();
  if (!response.ok) throw new Error(`the bridge answered ${response.status}`); // not shown
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
    async output(session, after) {
      const more = after === undefined ? "" : `&after=${after}`;
      return read<Output>(await fetch(`${one(session)}/output?limit=6${more}`, { cache: "no-store" }));
    },
    async pending(session) {
      return read<Pending>(await fetch(`${one(session)}/pending`, { cache: "no-store" }));
    },
    async prs(session) {
      return read<Prs>(await fetch(`${one(session)}/prs`, { cache: "no-store" }));
    },
    async detail(session) {
      return read<SessionDetail>(await fetch(`${one(session)}/detail`, { cache: "no-store" }));
    },
    async summarize(session, language) {
      const response = await fetch(`${one(session)}/summary`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ language }),
      });
      if (response.status === 401) throw new SignedOut();
      if (response.ok) return null;
      // Refused, as for a session on another machine: the bridge's own reason.
      const refused = (await response.json().catch(() => ({}))) as { error?: string };
      return refused.error ?? String(response.status);
    },
    async health() {
      return read<SoftwareHealth>(await fetch(`${BASE}/health/software`, { cache: "no-store" }));
    },
    async settings() {
      return read<Settings>(await fetch(`${BASE}/settings`, { cache: "no-store" }));
    },
    async changeSettings(change) {
      return read<Settings>(
        await fetch(`${BASE}/settings`, {
          method: "PUT",
          headers: JSON_HEADERS,
          body: JSON.stringify(change),
        }),
      );
    },
    async prompts() {
      return (await read<{ prompts: Prompt[] }>(await fetch(`${BASE}/prompts`, { cache: "no-store" })))
        .prompts;
    },
    async answer(prompt, reply) {
      const response = await fetch(`${BASE}/prompts/${encodeURIComponent(prompt)}`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(reply),
      });
      if (response.status === 404) return "gone";
      // 502: the other computer the prompt belongs to did not take the answer.
      if (response.status === 409 || response.status === 502) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        return { refused: body.error ?? "" };
      }
      await read<unknown>(response);
      return "ok";
    },
    async work() {
      const response = await fetch(`${BASE}/work`, { cache: "no-store" });
      if (response.status === 404) return null;
      return read<Work>(response);
    },
    async whoami() {
      const response = await fetch(`${BASE}/whoami`, { cache: "no-store" });
      if (response.status === 404) return { here: false };
      return read<Whoami>(response);
    },
    async focus(session) {
      const response = await fetch(`${one(session)}/focus`, { method: "POST" });
      if ([403, 409, 501].includes(response.status)) return (await response.json()) as Focused;
      return read<Focused>(response);
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
