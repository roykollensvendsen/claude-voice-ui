// The bridge's stream of live events: focus, active, news and status.
import type { Active } from "./bridge";

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

export interface Handlers {
  focus(focus: Focus): void;
  active(active: Active | null): void;
  news(news: News): void;
  status(status: Status): void;
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
  source.addEventListener("active", (e) => on.active(parse(e)));
  source.addEventListener("news", (e) => on.news(parse(e)));
  source.addEventListener("status", (e) => on.status(parse(e)));
  return () => source.close();
}
