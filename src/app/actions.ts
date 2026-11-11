// What a tap on the page asks for.
import { whatsNew } from "../changes";
import { t } from "../i18n";
import { recall, remember } from "../remember";
import { type Session, waitsForOwner } from "../states";
import { type Actions, hasPrompt, type UpdateActions } from "../view";
import type { Context } from "./context";
import {
  applyLanguage,
  applyTheme,
  BUILD,
  EXPANDED,
  FOLDED,
  GROUP_BY,
  HIDDEN,
  LANG,
  THEME,
  VIEW,
} from "./preferences";

/** What the actions need from the rest of the app. */
/** How long a copy button says it copied. */
const COPIED_MS = 1500;
/** How often an open code-health page looks again while the bridge measures. */
const HEALTH_POLL_MS = 30_000;

/**
 * Copy text, and say whether it worked. The clipboard is hidden on a page opened over plain http,
 * and may refuse; then the text is selected in a hidden read-only box and copied from there.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Refused; try the selection below.
  }
  const box = document.createElement("textarea");
  box.value = text;
  box.readOnly = true;
  box.className = "copy-source";
  document.body.append(box);
  box.focus();
  box.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    box.remove();
  }
}

export interface Means {
  /** Whether a tap on `id` began there, and not just after the sessions moved. */
  steadyTap(id: string): boolean;
  pick(id: string): void;
  openPage(id: string): void;
  signOut(): void;
  toggleDoctor(): void;
  /** What a session is doing now, so a later wait can be told from the one it was hidden in. */
  moment(s: Session): string;
  /** The newest build the page has heard of, or "" before it has asked. */
  latestBuild(): string;
  update: UpdateActions;
}

export function tapActions({ home, deps, keep, draw, failed }: Context, means: Means): Actions {
  /** Read the measures into the open page, and look again while the bridge measures. */
  async function readHealth() {
    const shown = home.health;
    try {
      const data = await deps.bridge.health();
      if (home.health !== shown) return;
      const next = { data };
      home.health = next;
      // RULE: the code-health page looks again only while it is open and the bridge is measuring
      if (data.refreshing)
        setTimeout(() => {
          if (home.health === next) void readHealth();
        }, HEALTH_POLL_MS);
    } catch (error) {
      failed(error);
    }
    draw();
  }

  return {
    pick: (id) => {
      if (means.steadyTap(id)) means.pick(id);
    },
    openPage: (id) => means.openPage(id),
    back() {
      home.open = null;
      draw();
    },
    signOut: () => means.signOut(),
    toggleDoctor: () => means.toggleDoctor(),
    toggleCard(id) {
      if (!home.expanded.delete(id)) home.expanded.add(id);
      remember(keep, EXPANDED, [...home.expanded]);
      draw();
    },
    toggleGroup(key) {
      if (!home.folded.delete(key)) home.folded.add(key);
      remember(keep, FOLDED, [...home.folded]);
      draw();
    },
    showMore(id) {
      home.more.add(id);
      draw();
    },
    hide(id) {
      const s = home.sessions.find((x) => x.id === id);
      home.hidden[id] = s ? means.moment(s) : "";
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
    async summarize() {
      const open = home.open;
      if (!open?.info) return;
      open.info.summary_state = "generating";
      draw();
      // The page never makes one by itself: only this tap asks.
      const refused = await deps.bridge.summarize(open.id, t("summary.language")).catch((error) => {
        failed(error);
        return null;
      });
      if (refused === null || !open.info) return;
      open.info.summary_state = "error";
      open.info.summary_error = refused;
      draw();
    },
    async openHealth() {
      home.menuOpen = false;
      home.health = { data: null };
      draw();
      await readHealth();
    },
    dismissRestart() {
      home.restarted = null;
      draw();
    },
    copy(id, command) {
      void copyText(command).then((done) => {
        if (!done) return;
        home.copied = id;
        draw();
        setTimeout(() => {
          if (home.copied !== id) return;
          home.copied = null;
          draw();
        }, COPIED_MS);
      });
    },
    async openTerminal(session) {
      try {
        home.opened = { session, answer: await deps.bridge.focus(session) };
        draw();
      } catch (error) {
        failed(error);
      }
    },
    setGroupBy(by) {
      home.groupBy = by;
      remember(keep, GROUP_BY, by);
      draw();
    },
    toggleSection(key) {
      const section = home.sections[key];
      if (section) section.open = !section.open;
      draw();
    },
    async openOrg(programme) {
      home.org = { programme };
      draw();
      try {
        const data = await deps.bridge.org(programme);
        if (home.org?.programme === programme) home.org = { programme, data };
      } catch (error) {
        failed(error);
      }
      draw();
    },
    closeOrg() {
      home.org = null;
      draw();
    },
    closeHealth() {
      home.health = null;
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
      means.openPage(queue[(at + 1) % queue.length] as string);
    },
    reload() {
      // The build about to load is the one the next What's new counts from.
      const latest = means.latestBuild();
      if (latest) remember(keep, BUILD, latest);
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
    update: means.update,
  };
}
