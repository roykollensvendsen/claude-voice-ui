// The shapes of the team's work as the bridge gives them: what waits on the owner, the programmes the
// sessions belong to and who fills their roles, and opening a session's terminal.
import type { Named } from "./states";

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

/** A larger piece of work with sessions of its own, in the order the bridge shows them. */
export interface Programme extends Named {
  order: number;
}

/** One role in a programme, and the sessions that fill it. */
export interface OrgRole extends Named {
  /** The part of the programme it serves, by id; null for a role across the whole programme. */
  component: string | null;
  programme_wide: boolean;
  address: string | null;
  purpose: string;
  limits: string | string[];
  /** What it passes on: facts, proposals, decisions or quality. */
  routing: string[];
  session_names: string[];
  sessions: string[];
  running: boolean;
}

/** A programme's organisation, as GET /api/v1/org/{programme} gives it. Read-only. */
export interface OrgProgramme extends Named {
  aliases: string[];
  components: (Named & { aliases: string[] })[];
  roles: OrgRole[];
  /** The roles no session fills, by id. */
  unfilled: string[];
}

/** Sessions in no programme that clearly work together, as the bridge sees it; strongest reason first. */
export interface ProgrammeHint {
  /** The same for the same set of sessions; a new id when the group changes. */
  id: string;
  sessions: string[];
  reason: "messages" | "folder" | "prefix"; // not shown
  /** The folder's name for "folder", the shared start of the names for "prefix", else null. */
  detail: string | null;
  /** The messages between them in the last 7 days, for "messages". */
  messages: number | null;
}
