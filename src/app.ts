// The app: signs in, shows the cards, and keeps them current.
import { type Bridge, SignedOut, type SignIn, type UpdateStep } from "./bridge";
import { type EventSourceLike, follow } from "./live";
import { browserKeep, type Keep, recall, remember } from "./remember";
import { cardState, type Session } from "./states";
import { IDLE } from "./update";
import { type Actions, type Home, homeScreen, signInScreen, type UpdateActions } from "./view";

export interface Deps {
  bridge: Bridge;
  openEvents: (url: string) => EventSourceLike;
  /** Where this phone remembers open and hidden cards; the browser's storage when left out. */
  keep?: Keep;
}

const EXPANDED = "cvu.expanded";
const HIDDEN = "cvu.hidden";

/** Changes of state arrive on the stream; the timer catches what a dropped stream missed. */
// RULE: the sessions are fetched again every minute
const POLL_MS = 60_000;
/** How long the bar keeps showing the session the voice last reached, once nothing more happens. */
// RULE: after two quiet minutes the bar goes back to the active session
const FOCUS_MS = 2 * 60_000;
/** The bridge's dependency check runs other programs and takes seconds, so it is asked seldom. */
// RULE: the check is asked again every five minutes, not on every refresh
const DOCTOR_MS = 5 * 60_000;
/** The plan's figures move only when a session answers, so once a minute is plenty. */
// RULE: usage is asked again every minute
const USAGE_MS = 60_000;

const REFUSED: Record<Exclude<SignIn, "ok">, string> = {
  wrong: "Wrong secret.",
  "too-many": "Too many wrong tries. Wait ten minutes.",
  unreachable: "Can't reach the bridge.",
};

/** Start the app in `root`. The returned function stops it: no more timers, no more stream. */
export function start(root: HTMLElement, deps: Deps): () => void {
  const keep = "keep" in deps ? deps.keep : browserKeep();
  const home: Home = {
    sessions: [],
    active: null,
    focus: null,
    connection: "connecting",
    problem: null,
    doctor: null,
    usage: null,
    bridge: null,
    update: { ...IDLE },
    open: null,
    expanded: new Set(recall<string[]>(keep, EXPANDED, [])),
    hidden: recall<Record<string, string>>(keep, HIDDEN, {}),
    more: new Set(),
    hiddenOpen: false,
    doctorOpen: false,
  };
  let watching = false;
  let unfollow: (() => void) | null = null;
  let poll: ReturnType<typeof setInterval> | undefined;
  let focusTimer: ReturnType<typeof setTimeout> | undefined;
  let doctorTimer: ReturnType<typeof setInterval> | undefined;
  let usageTimer: ReturnType<typeof setInterval> | undefined;

  const draw = () => {
    bringBackWaiting();
    root.replaceChildren(homeScreen(home, actions));
  };

  /** What a session was doing, and since when, so a later wait can be told from the one it was hidden in. */
  const moment = (s: Session) => `${cardState(s)}|${s.state_since ?? ""}`;
  const WAITS = new Set(["answer", "approval", "input"]);

  function bringBackWaiting() {
    let changed = false;
    for (const s of home.sessions) {
      const at = home.hidden[s.id];
      // RULE: a hidden session comes back when it starts waiting
      if (at !== undefined && WAITS.has(cardState(s)) && at !== moment(s)) {
        delete home.hidden[s.id];
        changed = true;
      }
    }
    if (changed) remember(keep, HIDDEN, home.hidden);
  }

  const updating: UpdateActions = {
    ask() {
      // RULE: the update starts only after the owner confirms
      home.update = { ...IDLE, phase: "confirm" };
      draw();
    },
    cancel() {
      home.update = { ...IDLE };
      draw();
    },
    async confirm() {
      home.update = { ...IDLE, phase: "running" };
      draw();
      try {
        const started = await deps.bridge.startUpdate();
        if (started.outcome === "started") home.update.note = started.note;
        else {
          home.update.phase = "done";
          home.update.message =
            started.outcome === "running"
              ? "An update is already running."
              : "This bridge does not run from a git clone, so it cannot update itself.";
        }
      } catch (error) {
        home.update = { ...IDLE };
        failed(error);
      }
      draw();
    },
  };

  const actions: Actions = {
    pick: (id) => void pick(id),
    back() {
      home.open = null;
      draw();
    },
    signOut: () => void signOut(),
    toggleDoctor,
    toggleCard(id) {
      if (!home.expanded.delete(id)) home.expanded.add(id);
      remember(keep, EXPANDED, [...home.expanded]);
      draw();
    },
    showMore(id) {
      home.more.add(id);
      draw();
    },
    hide(id) {
      const s = home.sessions.find((x) => x.id === id);
      home.hidden[id] = s ? moment(s) : "";
      home.expanded.delete(id);
      remember(keep, HIDDEN, home.hidden);
      remember(keep, EXPANDED, [...home.expanded]);
      draw();
    },
    unhide(id) {
      delete home.hidden[id];
      remember(keep, HIDDEN, home.hidden);
      draw();
    },
    toggleHidden() {
      home.hiddenOpen = !home.hiddenOpen;
      draw();
    },
    update: updating,
  };

  /** Read one part of the open page, unless the owner has moved on to another. */
  async function load<T>(id: string, read: () => Promise<T>, put: (value: T) => void) {
    try {
      const value = await read();
      if (home.open?.id !== id) return;
      put(value);
      draw();
    } catch (error) {
      if (error instanceof SignedOut) failed(error);
    }
  }

  function openPage(id: string) {
    home.open = { id, turns: [], lastIndex: undefined, pending: null, prs: [] };
    draw();
    void moreOutput(id);
    void readPending(id);
    void load(
      id,
      () => deps.bridge.prs(id),
      (r) => {
        if (home.open) home.open.prs = r.prs;
      },
    );
  }

  function moreOutput(id: string): Promise<void> {
    const after = home.open?.lastIndex;
    let more = false;
    return load(
      id,
      // RULE: a new turn announced on the stream is fetched after the last one shown
      () => deps.bridge.output(id, home.open?.lastIndex),
      (out) => {
        if (!home.open) return;
        home.open.turns.push(...out.turns);
        home.open.lastIndex = out.next_after || home.open.turns.at(-1)?.index;
        // The stream names only the last of several new turns, and one read brings at most six.
        // A first read without `after` is the latest six; what is left then is older, and stays out.
        more = after !== undefined && out.turns_left > 0 && out.turns.length > 0;
      },
    ).then(() => (more ? moreOutput(id) : undefined));
  }

  function readPending(id: string) {
    return load(
      id,
      () => deps.bridge.pending(id),
      (p) => {
        if (home.open) home.open.pending = p;
      },
    );
  }

  function updateStep(step: UpdateStep) {
    if (home.update.phase !== "running") home.update = { ...IDLE, phase: "running" };
    home.update.steps.push(step);
    if (step.step === "done" || step.result) {
      home.update.phase = "done";
      home.update.result = step.result ?? null;
      void readUpdate();
    }
    draw();
  }

  /** After the restart nothing is replayed, so the rest of the run is read in one go. */
  async function readUpdate() {
    try {
      const run = await deps.bridge.lastUpdate();
      home.update.steps = run.steps;
      home.update.restarting = false;
      if (!run.running) {
        home.update.phase = "done";
        home.update.result = run.result ?? home.update.result;
        home.update.detail = run.detail;
        home.update.to = run.to ?? "";
        void checkBridge();
      }
      draw();
    } catch {
      // The bridge may still be starting; the next reconnect asks again.
    }
  }

  async function checkBridge() {
    try {
      home.bridge = await deps.bridge.bridgeInfo();
      if (watching) draw();
    } catch (error) {
      if (error instanceof SignedOut) failed(error);
    }
  }

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
    clearInterval(usageTimer);
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

  async function checkUsage() {
    try {
      home.usage = await deps.bridge.usage();
      if (watching) draw();
    } catch (error) {
      // Figures that did not come leave the last ones up; the cards matter more than the bars.
      if (error instanceof SignedOut) failed(error);
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
      output(t) {
        if (home.open?.id === t.session) void moreOutput(t.session);
      },
      status(st) {
        if (home.open?.id === st.session) void readPending(st.session);
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
        if (home.update.phase === "running") {
          if (state === "reconnecting") home.update.restarting = true;
          else void readUpdate();
        }
        draw();
      },
      update: updateStep,
    });
    poll = setInterval(() => void refresh(), POLL_MS);
    doctorTimer = setInterval(() => {
      void checkDoctor();
      void checkBridge();
    }, DOCTOR_MS);
    void checkDoctor();
    void checkBridge();
    usageTimer = setInterval(() => void checkUsage(), USAGE_MS);
    void checkUsage();
  }

  async function signIn(secret: string) {
    const outcome = await deps.bridge.signIn(secret);
    if (outcome === "ok") await refresh();
    else showSignIn(REFUSED[outcome]);
  }

  async function pick(id: string) {
    openPage(id);
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
