// The team's work on the home page: what waits on the owner, and the open pull requests by repository.
import { type Work } from "../bridge";
import { type Key, t } from "../i18n";
import { ago, button, el, matches } from "../view/dom";
import { terminalRow } from "../view/terminal";
import { type Actions, type Home } from "../view/types";

const CHECKS: Record<Work["open_prs"][number]["checks"], Key> = {
  pass: "work.checksPass",
  fail: "work.checksFail",
  pending: "work.checksRunning",
};

/** What the owner has to do, shown first. The team's words are text, never markup. */
export function waitingBlock(home: Home, act: Actions): HTMLElement[] {
  const items = home.work?.waiting_on_owner ?? [];
  if (!items.length) return [];
  return [
    el(
      "section",
      "work-waiting",
      el("h2", undefined, t("work.waiting")),
      el(
        "ul",
        undefined,
        ...items.map((w) => {
          const s = w.session ? home.sessions.find((x) => matches(x, w.session ?? "")) : undefined;
          const command = w.command
            ? [
                el(
                  "div",
                  "command",
                  el("code", undefined, w.command),
                  button(
                    t(home.copied === w.id ? "work.copied" : "work.copy"),
                    () => act.copy(w.id, w.command ?? ""),
                    "copy",
                  ),
                ),
              ]
            : [];
          const to = s ? [button(s.name || s.id, () => act.openPage(s.id), "to-session")] : [];
          return el(
            "li",
            undefined,
            el("span", "text", w.text),
            el("span", "since muted", ago(w.since)),
            ...command,
            ...to,
            ...terminalRow(home, s, act),
          );
        }),
      ),
    ),
  ];
}

/** The open pull requests, grouped by repository in the order the bridge gave them. */
export function prsBlock(home: Home): HTMLElement[] {
  const work = home.work;
  const unreadable = work?.unreadable ?? [];
  if (!work || (!work.open_prs.length && !unreadable.length)) return [];
  const repos = [...new Set(work.open_prs.map((p) => p.repo))];
  const group = (repo: string) => [
    el("h3", undefined, repo),
    el(
      "ul",
      undefined,
      ...work.open_prs
        .filter((p) => p.repo === repo)
        .map((p) => {
          const link = el("a", undefined, `#${p.number} ${p.title}`);
          link.href = p.url;
          link.target = "_blank";
          link.rel = "noopener";
          const draft = p.draft ? [el("span", "draft muted", t("work.draft"))] : [];
          return el("li", undefined, link, el("span", `checks ${p.checks}`, t(CHECKS[p.checks])), ...draft);
        }),
    ),
  ];
  const missing = unreadable.length
    ? [el("p", "unreadable muted", t("work.unreadable", { repos: unreadable.join(", ") }))]
    : [];
  return [el("section", "work-prs", el("h2", undefined, t("work.prs")), ...repos.flatMap(group), ...missing)];
}
