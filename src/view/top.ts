// The top of the page: the menu, the notices, usage, the update and what is missing.
import { type Settings } from "../bridge";
import { type Key, type Language, NAMES, plural, t } from "../i18n";
import { waitsForOwner } from "../states";
import { resultText, stepText } from "../update";
import { planBars, tightest, usageLevel, voiceLine, warningText } from "../usage";
import { button, el, hasPrompt, matches } from "../view/dom";
import { type Actions, type Connection, type Home, type Theme, type UpdateActions } from "../view/types";

export const CONNECTION: Record<Connection, Key> = {
  connecting: "connection.connecting",
  live: "connection.live",
  reconnecting: "connection.reconnecting",
};

/** A speech bubble at the top that leads to the session the voice is talking to, when there is one. */
export function micJump(home: Home): HTMLElement[] {
  const s = home.focus ? home.sessions.find((x) => matches(x, home.focus)) : undefined;
  if (!s) return [];
  const jump = button(
    s.number ? `💬 ${s.number}` : "💬",
    () => {
      document.querySelector(`[data-session="${CSS.escape(s.id)}"]`)?.scrollIntoView({ block: "center" });
    },
    "mic-jump",
  );
  jump.dataset.target = s.id;
  jump.setAttribute("aria-label", t("focus.jump", { name: s.name || s.id }));
  return [jump];
}

/** The top bar's menu: the theme, and signing out. */
export function menu(home: Home, act: Actions): HTMLElement[] {
  if (!home.menuOpen) return [];
  const choice = (label: string, theme: Theme) => {
    const b = button(label, () => act.setTheme(theme));
    b.setAttribute("aria-pressed", String(home.theme === theme));
    return b;
  };
  const speak = (label: string, language: Language | "system") => {
    const b = button(label, () => act.setLanguage(language));
    b.setAttribute("aria-pressed", String(home.language === language));
    return b;
  };
  const set = (label: string, on: boolean, change: Partial<Settings>) => {
    const b = button(label, () => act.changeSettings(change));
    b.setAttribute("aria-pressed", String(on));
    return b;
  };
  const row = (name: string, label: string, ...choices: HTMLElement[]) =>
    el("div", `row ${name}`, el("span", "label", label), el("div", "choices", ...choices));
  const s = home.settings;
  return [
    el(
      "div",
      "menu",
      row(
        "theme",
        t("menu.theme"),
        choice(t("menu.themeSystem"), "system"),
        choice(t("menu.light"), "light"),
        choice(t("menu.dark"), "dark"),
      ),
      row(
        "language",
        t("menu.language"),
        speak(t("menu.languageSystem"), "system"),
        ...(Object.keys(NAMES) as Language[]).map((l) => speak(NAMES[l], l)),
      ),
      ...(s
        ? [
            row(
              "start-in",
              t("settings.startIn"),
              set(t("settings.window"), s.start_in === "terminal", { start_in: "terminal" }),
              set(t("settings.background"), s.start_in === "background", { start_in: "background" }),
            ),
            row(
              "remote-control",
              t("settings.remoteControl"),
              set(t("settings.on"), s.remote_control, { remote_control: true }),
              set(t("settings.off"), !s.remote_control, { remote_control: false }),
            ),
          ]
        : []),
      button(t("menu.health"), act.openHealth, "open-health"),
      button(t("menu.signOut"), act.signOut, "signout"),
    ),
  ];
}

/** The notice of a newer build, with what it brings behind a tap. Commit subjects are shown as written. */
export function newVersion(home: Home, act: Actions): HTMLElement[] {
  if (!home.newVersion) return [];
  const toggle = button(t("page.whatsNew"), act.toggleWhatsNew, "whats-new-toggle");
  toggle.setAttribute("aria-expanded", String(Boolean(home.whatsNew)));
  const w = home.whatsNew;
  const group = (title: string, items: string[]) =>
    items.length
      ? [el("h3", undefined, title), el("ul", undefined, ...items.map((x) => el("li", undefined, x)))]
      : [];
  const list = w
    ? [
        el(
          "div",
          "whats-new",
          ...group(t("page.new"), w.feat),
          ...group(t("page.fixed"), w.fix),
          ...(w.feat.length || w.fix.length ? [] : [el("p", "muted", t("page.noChanges"))]),
        ),
      ]
    : [];
  return [
    el("div", "new-version-row", button(t("page.newVersion"), act.reload, "new-version"), toggle),
    ...list,
  ];
}

/** How many sessions wait for the owner; a tap opens the next one's page, question first. */
export function waitingCount(home: Home, act: Actions): HTMLElement[] {
  const count = home.sessions.filter(
    (s) => (waitsForOwner(s) || hasPrompt(home, s)) && !(s.id in home.hidden),
  ).length;
  if (!count) return [];
  const b = button(`❓${count}`, act.nextWaiting, "waiting-count");
  b.setAttribute("aria-label", plural(count, "waiting.count"));
  return [b];
}

/** The plan's tightest limit as one percentage in the top bar; a tap opens the bars below it. */
export function usageButton(home: Home, act: Actions): HTMLElement[] {
  const u = home.usage;
  if (!u) return [];
  const percent = tightest(u);
  const level = usageLevel(percent ?? 0, u.warning?.status);
  const b = button(percent === null ? "–%" : `${percent}%`, act.toggleUsage, `usage-button level-${level}`);
  b.setAttribute("aria-expanded", String(home.usageOpen));
  b.setAttribute("aria-label", t("usage.label"));
  return [b];
}

export function usagePanel(home: Home): HTMLElement[] {
  const u = home.usage;
  if (!u || !home.usageOpen) return [];
  const bars = planBars(u, Date.now()).map((b) => {
    const fill = el("div", "fill");
    fill.style.width = `${b.percent}%`;
    return el(
      "div",
      `bar${b.stale ? " stale" : ""}`,
      el(
        "div",
        "bar-head",
        el("span", undefined, b.title),
        el("span", undefined, `${b.percent}% · ${b.note}`),
      ),
      el("div", "track", fill),
    );
  });
  const warning = warningText(u);
  return [
    el(
      "section",
      "usage",
      ...(warning ? [el("div", `usage-warning ${warning.severity}`, warning.text)] : []),
      ...(bars.length ? bars : [el("p", "muted", t("usage.noFigures"))]),
      ...(u.plan?.label ? [el("p", "label", u.plan.label)] : []),
      el(
        "p",
        "voice",
        el("span", undefined, t("usage.voiceToday", { line: voiceLine(u) })),
        el("span", "label", ` (${u.voice.label})`),
      ),
    ),
  ];
}

export function updatePanel(home: Home, act: UpdateActions): HTMLElement[] {
  const u = home.update;
  const behind = home.bridge?.git?.tracking?.behind ?? 0;
  if (u.phase === "idle" && behind <= 0) return [];
  const parts: (Node | string)[] = [];
  if (u.phase === "idle") {
    parts.push(el("span", undefined, plural(behind, "update.behind")), button(t("update.button"), act.ask));
  } else if (u.phase === "confirm") {
    parts.push(
      el("p", undefined, t("update.confirm")),
      button(t("update.now"), act.confirm, "primary"),
      button(t("update.cancel"), act.cancel),
    );
  } else {
    if (u.message) parts.push(el("p", undefined, u.message));
    if (u.note) parts.push(el("p", "muted", u.note));
    parts.push(
      el("ol", "steps", ...u.steps.map((st) => el("li", `step${st.ok ? "" : " failed"}`, stepText(st)))),
    );
    if (u.phase === "running" && u.restarting) parts.push(el("p", "muted", t("update.restarting")));
    if (u.phase === "done") parts.push(el("p", `result ${u.result ?? ""}`, resultText(u)));
  }
  return [el("section", "bridge-update", ...parts)];
}

export function missing(home: Home, onToggle: () => void): HTMLElement[] {
  const failing = home.doctor?.checks.filter((c) => !c.ok) ?? [];
  if (!failing.length) return [];
  // RULE: a missing required thing shows a red banner
  const severity = failing.some((c) => c.required) ? "required" : "optional";
  const count = plural(failing.length, "doctor.missing");
  const banner = el(
    "button",
    `doctor-banner ${severity}`,
    `${count}: ${failing.map((c) => c.title).join(", ")}`,
  );
  banner.type = "button";
  banner.setAttribute("aria-expanded", String(home.doctorOpen));
  banner.addEventListener("click", onToggle);
  if (!home.doctorOpen) return [banner];
  const items = failing.map((c) => {
    const item = el(
      "li",
      c.required ? "required" : "optional",
      el("b", undefined, c.title),
      ...(c.affects ? [el("div", "affects", t("doctor.without", { affects: c.affects }))] : []),
      ...(c.detail ? [el("div", "detail", c.detail)] : []),
    );
    if (c.fix) item.append(el("pre", "fix", el("code", undefined, c.fix)));
    if (c.fix_url) {
      const link = el("a", undefined, t("doctor.howToFix"));
      link.href = c.fix_url;
      link.target = "_blank";
      link.rel = "noopener";
      item.append(link);
    }
    return item;
  });
  return [banner, el("ul", "doctor-panel", ...items)];
}
