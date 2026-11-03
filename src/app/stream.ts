// What the bridge's stream of live events changes on the page.
import type { Handlers } from "../live";
import type { Context } from "./context";
import type { SessionPage } from "./page";
import type { Updating } from "./updating";

/** How long the speech bubble stays on the session the voice last reached, once nothing more happens. */
// RULE: after two quiet minutes the speech bubble goes away
export const FOCUS_MS = 2 * 60_000;

export interface Reads {
  refresh(): Promise<void>;
  readPrompts(): Promise<void>;
}

/** The handlers for `follow`, and `stop` to clear the timers they leave running. */
export function streamHandlers(
  { home, draw }: Context,
  page: SessionPage,
  update: Updating,
  reads: Reads,
): { handlers: Handlers; stop(): void } {
  let focusTimer: ReturnType<typeof setTimeout> | undefined;
  const peekTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const handlers: Handlers = {
    focus(f) {
      home.focus = f.session;
      clearTimeout(focusTimer);
      focusTimer = setTimeout(() => {
        home.focus = null;
        draw();
      }, FOCUS_MS);
      draw();
    },
    peek(p) {
      // Each look keeps its own two minutes; a new look at the same session starts them again.
      clearTimeout(peekTimers.get(p.session));
      if (!home.peeks.includes(p.session)) home.peeks = [...home.peeks, p.session];
      peekTimers.set(
        p.session,
        setTimeout(() => {
          peekTimers.delete(p.session);
          home.peeks = home.peeks.filter((key) => key !== p.session);
          draw();
        }, FOCUS_MS),
      );
      draw();
    },
    active(a) {
      home.active = a;
      draw();
    },
    news: () => void reads.refresh(),
    output(t) {
      if (home.open?.id !== t.session) return;
      void page.moreOutput(t.session);
      void page.readDetail(t.session);
    },
    status(st) {
      if (home.open?.id === st.session) void page.readPending(st.session);
      const s = home.sessions.find((x) => x.id === st.session);
      // A session the page has not seen yet comes with the rest of the list.
      if (!s) return void reads.refresh();
      s.state = st.state;
      s.state_since = st.since;
      s.doing = st.doing;
      draw();
    },
    git(change) {
      const s = home.sessions.find((x) => x.id === change.session);
      if (!s) return;
      s.git = change.git;
      draw();
    },
    connection(state) {
      home.connection = state;
      // The stream carries only changes, so what is open is read again on every connect.
      if (state === "live") void reads.readPrompts();
      if (home.update.phase === "running") {
        if (state === "reconnecting") home.update.restarting = true;
        else void update.read();
      }
      draw();
    },
    update: update.step,
    prompt(p) {
      home.prompts = [...home.prompts.filter((x) => x.id !== p.id), p];
      draw();
    },
    summary(change) {
      const info = home.open?.id === change.session ? home.open.info : null;
      if (!info) return;
      info.summary_state = change.summary_state;
      if (change.summary) info.summary = change.summary;
      // The age shown comes with the next read of the page; until then it is new.
      if (change.summary_state === "ready") info.summary_at = new Date().toISOString();
      draw();
    },
    settings(settings) {
      home.settings = settings;
      draw();
    },
    promptClosed(closed) {
      home.prompts = home.prompts.filter((x) => x.id !== closed.id);
      draw();
    },
  };
  return {
    handlers,
    stop() {
      clearTimeout(focusTimer);
      for (const timer of peekTimers.values()) clearTimeout(timer);
      peekTimers.clear();
    },
  };
}
