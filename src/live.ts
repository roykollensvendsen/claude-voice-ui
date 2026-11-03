// The bridge's stream of live events: focus, peek, active, news, status, git, update, output, prompts, settings and summaries.
import type { Active, Prompt, SessionDetail, Settings, UpdateStep } from "./bridge";
import type { Git } from "./git";

/** The part of the browser's EventSource this app uses, so a test can stand in for it. */
export interface EventSourceLike {
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  close(): void;
}

/** A tool call aimed at a session. `session` is what the caller passed: a name or an id. */
export interface Focus {
  session: string;
  tool: string;
  at: string;
}

export interface News {
  kind: string;
  session: string;
  text: string;
}

/** A session's state changed. `session` is its id. */
export interface Status {
  session: string;
  name: string;
  state: string;
  previous?: string;
  since: string;
  doing: string;
  at: string;
}

/** A session folder's git status changed. `session` is its id. */
export interface GitChange {
  session: string;
  git: Git | null;
}

/** A session's transcript gained a turn. */
export interface NewTurn {
  session: string;
  index: number;
  role: string;
}

export interface Handlers {
  focus(focus: Focus): void;
  /** Someone only looked at a session; the same fields as a focus. */
  peek(peek: Focus): void;
  active(active: Active | null): void;
  news(news: News): void;
  status(status: Status): void;
  git(change: GitChange): void;
  update(step: UpdateStep): void;
  output(turn: NewTurn): void;
  /** A session holds a question or an approval for the phone. */
  prompt(prompt: Prompt): void;
  promptClosed(closed: { id: string; how: string }): void;
  /** How new sessions start changed; the whole object. */
  settings(settings: Settings): void;
  /** A summary asked for is ready, or failed. */
  summary(change: Pick<SessionDetail, "summary" | "summary_state"> & { session: string }): void;
  connection(state: "live" | "reconnecting"): void;
}

export const EVENTS_URL = "/api/v1/events";

/** Follow the stream until the returned function is called. The browser reconnects on its own. */
export function follow(open: (url: string) => EventSourceLike, on: Handlers): () => void {
  const source = open(EVENTS_URL);
  source.onopen = () => on.connection("live");
  source.onerror = () => on.connection("reconnecting");
  const parse = (event: MessageEvent) => JSON.parse(String(event.data));
  source.addEventListener("focus", (e) => on.focus(parse(e)));
  source.addEventListener("peek", (e) => on.peek(parse(e)));
  source.addEventListener("active", (e) => on.active(parse(e)));
  source.addEventListener("news", (e) => on.news(parse(e)));
  source.addEventListener("status", (e) => on.status(parse(e)));
  source.addEventListener("git", (e) => on.git(parse(e)));
  source.addEventListener("update", (e) => on.update(parse(e)));
  source.addEventListener("output", (e) => on.output(parse(e)));
  source.addEventListener("prompt", (e) => on.prompt(parse(e)));
  source.addEventListener("prompt_closed", (e) => on.promptClosed(parse(e)));
  source.addEventListener("settings", (e) => on.settings(parse(e)));
  source.addEventListener("summary", (e) => on.summary(parse(e)));
  return () => source.close();
}
