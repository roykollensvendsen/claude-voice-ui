// The app: signs in, shows the cards, and keeps them current.

import { tapActions } from "./app/actions";
import type { Context, Deps } from "./app/context";
import { freshHome } from "./app/home";
import { sessionPage } from "./app/page";
import { applyLanguage, applyTheme, BUILD, HIDDEN } from "./app/preferences";
import { streamHandlers } from "./app/stream";
import { updating } from "./app/updating";
import { SignedOut, type SignIn } from "./bridge";
import { type Key, t } from "./i18n";
import { follow } from "./live";
import { browserKeep, remember } from "./remember";
import { byNumber, cardState, type Session } from "./states";
import { homeScreen, signInScreen } from "./view";

export type { Deps } from "./app/context";

/** How often the page asks whether a newer build of itself has been deployed. */
const VERSION_MS = 60_000;

/** How long after the sessions move a tap is taken as aimed at where they were. */
const SETTLE_MS = 800;
/** How long the order stays still after the finger lifts. */
const AFTER_LIFT_MS = 400;
/** How long a tapped tile flashes. */
const PICKED_MS = 700;

/** Changes of state arrive on the stream; the timer catches what a dropped stream missed. */
// RULE: the sessions are fetched again every minute
const POLL_MS = 60_000;
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
  const home = freshHome(keep);
  let watching = false;
  let unfollow: (() => void) | null = null;
  let poll: ReturnType<typeof setInterval> | undefined;
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

  const ctx: Context = {
    home,
    deps,
    keep,
    draw: () => draw(),
    failed: (error) => failed(error),
    watching: () => watching,
  };
  const page = sessionPage(ctx);
  const update = updating(ctx);
  const stream = streamHandlers(ctx, page, update, { refresh, readPrompts, readSettings });

  applyTheme(home.theme);
  applyLanguage(home.language);

  const actions = tapActions(ctx, {
    steadyTap,
    pick: (id) => void pick(id),
    openPage: page.open,
    signOut: () => void signOut(),
    toggleDoctor,
    moment,
    latestBuild: () => latestBuild,
    update: update.actions,
  });

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
    stream.stop();
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
      home.machines = snapshot.machines ?? [];
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
    unfollow = follow(deps.openEvents, stream.handlers);
    void readPrompts();
    void readSettings();
    poll = setInterval(() => void refresh(), POLL_MS);
    doctorTimer = setInterval(() => {
      void checkDoctor();
      void update.checkBridge();
    }, DOCTOR_MS);
    void checkDoctor();
    void update.checkBridge();
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
