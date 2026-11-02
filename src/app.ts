// The app: signs in, shows the cards, and keeps them current.
import { type Bridge, SignedOut, type SignIn } from "./bridge";
import { type EventSourceLike, follow } from "./live";
import { type Home, homeScreen, signInScreen } from "./view";

export interface Deps {
  bridge: Bridge;
  openEvents: (url: string) => EventSourceLike;
}

/** Changes of state arrive on the stream; the timer catches what a dropped stream missed. */
// RULE: the sessions are fetched again every minute
const POLL_MS = 60_000;
/** How long the bar keeps showing the session the voice last reached, once nothing more happens. */
// RULE: after two quiet minutes the bar goes back to the active session
const FOCUS_MS = 2 * 60_000;
/** The bridge's dependency check runs other programs and takes seconds, so it is asked seldom. */
// RULE: the check is asked again every five minutes, not on every refresh
const DOCTOR_MS = 5 * 60_000;

const REFUSED: Record<Exclude<SignIn, "ok">, string> = {
  wrong: "Wrong secret.",
  "too-many": "Too many wrong tries. Wait ten minutes.",
  unreachable: "Can't reach the bridge.",
};

/** Start the app in `root`. The returned function stops it: no more timers, no more stream. */
export function start(root: HTMLElement, deps: Deps): () => void {
  const home: Home = {
    sessions: [],
    active: null,
    focus: null,
    connection: "connecting",
    problem: null,
    doctor: null,
    doctorOpen: false,
  };
  let watching = false;
  let unfollow: (() => void) | null = null;
  let poll: ReturnType<typeof setInterval> | undefined;
  let focusTimer: ReturnType<typeof setTimeout> | undefined;
  let doctorTimer: ReturnType<typeof setInterval> | undefined;

  const draw = () => root.replaceChildren(homeScreen(home, pick, signOut, toggleDoctor));

  function toggleDoctor() {
    home.doctorOpen = !home.doctorOpen;
    draw();
  }

  async function checkDoctor() {
    try {
      home.doctor = await deps.bridge.doctor();
      if (watching) draw();
    } catch (error) {
      // An unanswered check says nothing about what is missing, so the banner stays as it was.
      if (error instanceof SignedOut) failed(error);
    }
  }

  function stopWatching() {
    watching = false;
    unfollow?.();
    unfollow = null;
    clearInterval(poll);
    clearTimeout(focusTimer);
    clearInterval(doctorTimer);
  }

  function showSignIn(error: string | null = null) {
    stopWatching();
    root.replaceChildren(signInScreen(error, signIn));
  }

  function failed(error: unknown) {
    // RULE: being signed out while watching returns to the sign-in page
    if (error instanceof SignedOut) showSignIn();
    else {
      home.problem = "Can't reach the bridge. Trying again.";
      if (watching) draw();
    }
  }

  async function refresh() {
    try {
      const snapshot = await deps.bridge.snapshot();
      home.sessions = snapshot.sessions;
      home.active = snapshot.active;
      home.problem = null;
      if (!watching) watch();
      draw();
    } catch (error) {
      if (!watching && !(error instanceof SignedOut)) showSignIn(REFUSED.unreachable);
      else failed(error);
    }
  }

  function watch() {
    watching = true;
    home.connection = "connecting";
    unfollow = follow(deps.openEvents, {
      focus(f) {
        home.focus = f.session;
        clearTimeout(focusTimer);
        focusTimer = setTimeout(() => {
          home.focus = null;
          draw();
        }, FOCUS_MS);
        draw();
      },
      active(a) {
        home.active = a;
        draw();
      },
      news: () => void refresh(),
      status(st) {
        const s = home.sessions.find((x) => x.id === st.session);
        // A session the page has not seen yet comes with the rest of the list.
        if (!s) return void refresh();
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
        draw();
      },
    });
    poll = setInterval(() => void refresh(), POLL_MS);
    doctorTimer = setInterval(() => void checkDoctor(), DOCTOR_MS);
    void checkDoctor();
  }

  async function signIn(secret: string) {
    const outcome = await deps.bridge.signIn(secret);
    if (outcome === "ok") await refresh();
    else showSignIn(REFUSED[outcome]);
  }

  async function pick(id: string) {
    try {
      home.active = await deps.bridge.choose(id);
      draw();
    } catch (error) {
      failed(error);
    }
  }

  async function signOut() {
    stopWatching();
    try {
      await deps.bridge.signOut();
    } finally {
      showSignIn();
    }
  }

  const onVisible = () => {
    if (watching && !document.hidden) void refresh();
  };
  document.addEventListener("visibilitychange", onVisible);
  void refresh();
  return () => {
    stopWatching();
    document.removeEventListener("visibilitychange", onVisible);
  };
}
