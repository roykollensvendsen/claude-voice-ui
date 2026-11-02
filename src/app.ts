// The app: signs in, shows the cards, and keeps them current.
import { type Bridge, SignedOut, type SignIn, type UpdateStep } from "./bridge";
import { type Change, whatsNew } from "./changes";
import { type Key, LANGUAGES, type Language, pickLanguage, setLanguage, t } from "./i18n";
import { type EventSourceLike, follow } from "./live";
import { browserKeep, type Keep, recall, remember } from "./remember";
import { byNumber, cardState, type Session, waitsForOwner } from "./states";
import { IDLE } from "./update";
import {
  type Actions,
  type Home,
  hasPrompt,
  homeScreen,
  signInScreen,
  type Theme,
  type UpdateActions,
  type View,
} from "./view";

export interface Deps {
  bridge: Bridge;
  openEvents: (url: string) => EventSourceLike;
  /** Where this phone remembers open and hidden cards; the browser's storage when left out. */
  keep?: Keep;
  /** The build this page came from, and how to ask which build is deployed now. */
  version?: { built: string; latest(): Promise<string>; changes?(): Promise<Change[]> };
  /** Load the page again; the browser's own reload when left out. */
  reload?: () => void;
}

/** How often the page asks whether a newer build of itself has been deployed. */
const VERSION_MS = 60_000;

/** How long after the sessions move a tap is taken as aimed at where they were. */
const SETTLE_MS = 800;
/** How long the order stays still after the finger lifts. */
const AFTER_LIFT_MS = 400;
/** How long a tapped tile flashes. */
const PICKED_MS = 700;

const EXPANDED = "cvu.expanded";
const HIDDEN = "cvu.hidden";
const VIEW = "cvu.view";
const THEME = "cvu.theme";
const LANG = "cvu.lang";
/** The build this phone last loaded, where What's new starts. */
const BUILD = "cvu.build";

function recalledLanguage(keep: Keep | undefined): Language | "system" {
  const saved = recall<string>(keep, LANG, "system");
  return Object.hasOwn(LANGUAGES, saved) ? (saved as Language) : "system";
}

/** Show the page in the chosen language, or the first of the phone's that the page has. */
function applyLanguage(choice: Language | "system") {
  setLanguage(choice === "system" ? pickLanguage(navigator.languages ?? [navigator.language]) : choice);
}

/** Mark the page with the chosen theme; without a mark the stylesheet follows the phone. */
function applyTheme(theme: Theme) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

/** Changes of state arrive on the stream; the timer catches what a dropped stream missed. */
// RULE: the sessions are fetched again every minute
const POLL_MS = 60_000;
/** How long the speech bubble stays on the session the voice last reached, once nothing more happens. */
// RULE: after two quiet minutes the speech bubble goes away
const FOCUS_MS = 2 * 60_000;
/** The bridge's dependency check runs other programs and takes seconds, so it is asked seldom. */
// RULE: the check is asked again every five minutes, not on every refresh
const DOCTOR_MS = 5 * 60_000;
/** The plan's figures move only when a session answers, so once a minute is plenty. */
// RULE: usage is asked again every minute
const USAGE_MS = 60_000;

const REFUSED: Record<Exclude<SignIn, "ok">, Key> = {
  wrong: "signin.wrong",
  "too-many": "signin.tooMany",
  unreachable: "signin.unreachable",
};

/** Whether the owner is typing an answer of his own. */
const typing = () =>
  document.activeElement instanceof HTMLInputElement && document.activeElement.matches(".prompt .own");

/** Start the app in `root`. The returned function stops it: no more timers, no more stream. */
export function start(root: HTMLElement, deps: Deps): () => void {
  const keep = "keep" in deps ? deps.keep : browserKeep();
  const home: Home = {
    sessions: [],
    active: null,
    focus: null,
    peeks: [],
    placed: [],
    prompts: [],
    settings: null,
    replies: {},
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
    // RULE: the view chosen is remembered
    view: recall<View>(keep, VIEW, "grid") === "cards" ? "cards" : "grid",
    legendOpen: false,
    usageOpen: false,
    newVersion: false,
    whatsNew: null,
    // RULE: the theme chosen is remembered
    theme: (["light", "dark"] as const).find((t) => t === recall<string>(keep, THEME, "system")) ?? "system",
    menuOpen: false,
    // RULE: the language chosen is remembered
    language: recalledLanguage(keep),
    picked: null,
    doctorOpen: false,
  };
  let watching = false;
  let unfollow: (() => void) | null = null;
  let poll: ReturnType<typeof setInterval> | undefined;
  let focusTimer: ReturnType<typeof setTimeout> | undefined;
  const peekTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let doctorTimer: ReturnType<typeof setInterval> | undefined;
  let usageTimer: ReturnType<typeof setInterval> | undefined;
  let versionTimer: ReturnType<typeof setInterval> | undefined;
  let latestBuild = "";
  if (deps.version) remember(keep, BUILD, deps.version.built);

  /** Only says a newer build is out; reloading waits for the owner's tap. */
  async function checkVersion() {
    if (!deps.version || home.newVersion) return;
    try {
      // RULE: a new version is loaded only when the notice is tapped
      latestBuild = await deps.version.latest();
      if (latestBuild !== deps.version.built) {
        home.newVersion = true;
        if (watching) draw();
      }
    } catch {
      // Offline or not deployed this way: the page carries on as it is.
    }
  }

  // Tiles re-sort live, so a finger could land on one that has just slid under it.
  let pressing = false;
  let liftTimer: ReturnType<typeof setTimeout> | undefined;
  let pickedTimer: ReturnType<typeof setTimeout> | undefined;
  let waitingDraw = false;
  let pressedId: string | undefined;
  let pressedAt = 0;
  let movedAt = 0;
  let shownOrder: string[] = [];

  let inView: IntersectionObserver | undefined;
  /** The speech bubble at the top is needed only while the session it leads to is off the screen. */
  function hideJumpWhileInView() {
    inView?.disconnect();
    const jump = root.querySelector<HTMLElement>(".mic-jump");
    const target = jump && root.querySelector(`[data-session="${CSS.escape(jump.dataset.target ?? "")}"]`);
    if (!jump || !target || typeof IntersectionObserver === "undefined") return;
    inView = new IntersectionObserver(([entry]) => {
      jump.hidden = Boolean(entry?.isIntersecting);
    });
    inView.observe(target);
  }

  /** Each session keeps the place it was first shown in; new ones join at the end, in number order. */
  function place() {
    const first = home.placed.length === 0;
    const known = new Set(home.placed);
    const fresh = byNumber(home.sessions.filter((s) => !known.has(s.id))).map((s) => s.id);
    home.placed = first ? fresh : [...home.placed, ...fresh];
  }

  const draw = () => {
    // RULE: the order holds still while a finger is on the screen
    // A redraw would also throw away an answer being typed, so it waits until the field is left.
    if (pressing || typing()) {
      waitingDraw = true;
      return;
    }
    waitingDraw = false;
    bringBackWaiting();
    place();
    root.replaceChildren(homeScreen(home, actions));
    hideJumpWhileInView();
    const order = [...root.querySelectorAll<HTMLElement>("[data-session]")].map(
      (x) => x.dataset.session ?? "",
    );
    // Only a tile that changed place counts as a move; one joining at the end moves nothing under a finger.
    if (order.some((id, i) => shownOrder.includes(id) && shownOrder.indexOf(id) !== i)) movedAt = Date.now();
    shownOrder = order;
  };

  const onPress = (e: Event) => {
    clearTimeout(liftTimer);
    pressing = true;
    pressedAt = Date.now();
    pressedId = (e.target as Element | null)?.closest<HTMLElement>("[data-session]")?.dataset.session;
  };
  const onLift = () => {
    // Still for a moment after the finger lifts, so the click that follows finds the tile it was
    // aimed at, and the owner sees where they tapped.
    clearTimeout(liftTimer);
    liftTimer = setTimeout(() => {
      pressing = false;
      if (waitingDraw) draw();
    }, AFTER_LIFT_MS);
  };
  root.addEventListener("pointerdown", onPress);
  document.addEventListener("pointerup", onLift);
  document.addEventListener("pointercancel", onLift);

  /** A tap counts only if it began on the same session, and not just after the sessions moved. */
  function steadyTap(id: string): boolean {
    const began = pressedId;
    pressedId = undefined;
    if (began === undefined) return true;
    // RULE: a tap just after the sessions moved chooses nothing
    return began === id && pressedAt - movedAt >= SETTLE_MS;
  }

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
            started.outcome === "running" ? t("update.alreadyRunning") : t("update.notAClone");
        }
      } catch (error) {
        home.update = { ...IDLE };
        failed(error);
      }
      draw();
    },
  };

  applyTheme(home.theme);
  applyLanguage(home.language);

  const actions: Actions = {
    pick: (id) => {
      if (steadyTap(id)) void pick(id);
    },
    openPage: (id) => openPage(id),
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
    setView(view) {
      home.view = view;
      remember(keep, VIEW, view);
      draw();
    },
    toggleMenu() {
      home.menuOpen = !home.menuOpen;
      draw();
    },
    setLanguage(choice) {
      home.language = choice;
      applyLanguage(choice);
      remember(keep, LANG, choice);
      draw();
    },
    setTheme(theme) {
      home.theme = theme;
      applyTheme(theme);
      remember(keep, THEME, theme);
      draw();
    },
    async toggleWhatsNew() {
      if (home.whatsNew) {
        home.whatsNew = null;
        draw();
        return;
      }
      try {
        // Asked for only now, on the owner's tap; the page never fetches it by itself.
        const since = recall(keep, BUILD, deps.version?.built ?? "");
        home.whatsNew = whatsNew((await deps.version?.changes?.()) ?? [], since);
      } catch {
        home.whatsNew = { feat: [], fix: [] };
      }
      draw();
    },
    async changeSettings(change) {
      try {
        home.settings = await deps.bridge.changeSettings(change);
        draw();
      } catch (error) {
        failed(error);
      }
    },
    async answer(prompt, reply, said) {
      const done = await deps.bridge.answer(prompt.id, reply).catch((error) => {
        failed(error);
        return null;
      });
      if (done === null) return;
      if (typeof done === "object") {
        home.replies[prompt.id] = { error: done.refused };
      } else {
        home.prompts = home.prompts.filter((x) => x.id !== prompt.id);
        home.replies[prompt.session] = {
          note: done === "ok" ? t("prompt.answered", { answer: said }) : t("prompt.gone"),
        };
      }
      draw();
    },
    nextWaiting() {
      // In the order shown, the first waiting session after the one whose page is open, round to the start.
      const byId = new Map(home.sessions.map((s) => [s.id, s]));
      const queue = home.placed.filter((id) => {
        const s = byId.get(id);
        return s && (waitsForOwner(s) || hasPrompt(home, s)) && !(id in home.hidden);
      });
      if (!queue.length) return;
      const at = home.open ? queue.indexOf(home.open.id) : -1;
      openPage(queue[(at + 1) % queue.length] as string);
    },
    reload() {
      // The build about to load is the one the next What's new counts from.
      if (latestBuild) remember(keep, BUILD, latestBuild);
      (deps.reload ?? (() => location.reload()))();
    },
    toggleUsage() {
      home.usageOpen = !home.usageOpen;
      draw();
    },
    toggleLegend() {
      home.legendOpen = !home.legendOpen;
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
    inView?.disconnect();
    unfollow?.();
    unfollow = null;
    clearInterval(poll);
    clearTimeout(focusTimer);
    for (const timer of peekTimers.values()) clearTimeout(timer);
    peekTimers.clear();
    clearInterval(doctorTimer);
    clearInterval(usageTimer);
    clearInterval(versionTimer);
  }

  function showSignIn(error: string | null = null) {
    stopWatching();
    root.replaceChildren(signInScreen(error, signIn));
  }

  function failed(error: unknown) {
    // RULE: being signed out while watching returns to the sign-in page
    if (error instanceof SignedOut) showSignIn();
    else {
      home.problem = t("problem.unreachable");
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

  async function readSettings() {
    // A bridge from before settings answers 404; the menu then leaves them out.
    home.settings = await deps.bridge.settings().catch(() => null);
    draw();
  }

  async function readPrompts() {
    try {
      home.prompts = await deps.bridge.prompts();
      draw();
    } catch (error) {
      failed(error);
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
      if (!watching && !(error instanceof SignedOut)) showSignIn(t(REFUSED.unreachable));
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
        // The stream carries only changes, so what is open is read again on every connect.
        if (state === "live") void readPrompts();
        if (home.update.phase === "running") {
          if (state === "reconnecting") home.update.restarting = true;
          else void readUpdate();
        }
        draw();
      },
      update: updateStep,
      prompt(p) {
        home.prompts = [...home.prompts.filter((x) => x.id !== p.id), p];
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
    });
    void readPrompts();
    void readSettings();
    poll = setInterval(() => void refresh(), POLL_MS);
    doctorTimer = setInterval(() => {
      void checkDoctor();
      void checkBridge();
    }, DOCTOR_MS);
    void checkDoctor();
    void checkBridge();
    usageTimer = setInterval(() => void checkUsage(), USAGE_MS);
    versionTimer = setInterval(() => void checkVersion(), VERSION_MS);
    void checkUsage();
  }

  async function signIn(secret: string) {
    const outcome = await deps.bridge.signIn(secret);
    if (outcome === "ok") await refresh();
    else showSignIn(t(REFUSED[outcome]));
  }

  async function pick(id: string) {
    home.picked = id;
    try {
      navigator.vibrate?.(30);
    } catch {
      // A phone that will not buzz still shows the flash.
    }
    clearTimeout(pickedTimer);
    pickedTimer = setTimeout(() => {
      home.picked = null;
      draw();
    }, PICKED_MS);
    draw();
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
    if (watching && !document.hidden) {
      void refresh();
      // A phone that slept through a deploy hears of it as soon as the page is looked at again.
      void checkVersion();
    }
  };
  document.addEventListener("visibilitychange", onVisible);
  // Leaving the answer field lets through the redraw that waited for it.
  const onLeave = () =>
    queueMicrotask(() => {
      if (waitingDraw) draw();
    });
  document.addEventListener("focusout", onLeave);
  void refresh();
  return () => {
    stopWatching();
    document.removeEventListener("visibilitychange", onVisible);
    document.removeEventListener("focusout", onLeave);
    document.removeEventListener("pointerup", onLift);
    document.removeEventListener("pointercancel", onLift);
    clearTimeout(liftTimer);
    clearTimeout(pickedTimer);
  };
}
