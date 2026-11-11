// Under Other: groups of sessions that clearly work together, each with a hint that it could be a programme.
import { plural, t } from "../i18n";
import type { Session } from "../states";
import type { ProgrammeHint } from "../team";
import { button, el } from "../view/dom";
import { sessionList } from "../view/machines";
import type { Actions, Home } from "../view/types";

/** Where the owner reads how a programme is written down. */
export const HOW_TO =
  "https://github.com/roykollensvendsen/claude-voice/blob/main/docs/org-chart.md#the-file"; // not shown

/** What the group has in common, in words. */
function note(hint: ProgrammeHint, count: number): string {
  if (hint.reason === "messages") return t("hint.messages", { count });
  if (hint.reason === "folder") return t("hint.folder", { count, folder: hint.detail ?? "" });
  return t("hint.prefix", { count, prefix: hint.detail ?? "" });
}

function hintBox(home: Home, act: Actions, hint: ProgrammeHint, members: Session[]): HTMLElement {
  const how = el("a", "hint-how", t("hint.how"));
  how.href = HOW_TO;
  how.target = "_blank";
  how.rel = "noopener";
  const away = button("×", () => act.dismissHint(hint.id), "hint-dismiss");
  away.setAttribute("aria-label", t("hint.dismiss"));
  const count = hint.messages ? [el("span", "hint-count muted", plural(hint.messages, "hint.count"))] : [];
  const box = el(
    "div",
    "hint",
    el("div", "hint-top", el("span", "hint-note", note(hint, members.length)), away),
    ...count,
    how,
    sessionList(home, act, members, null),
  );
  box.dataset.hint = hint.id;
  return box;
}

/** The hinted groups first, each together, then the sessions in no hint. */
export function otherInside(home: Home, act: Actions, list: Session[]): HTMLElement[] {
  const byId = new Map(list.map((s) => [s.id, s]));
  const used = new Set<string>();
  const boxes = home.hints.flatMap((hint) => {
    const members = hint.sessions.flatMap((id) => byId.get(id) ?? []).filter((s) => !used.has(s.id));
    // RULE: a hint with fewer than two of its sessions on the page is not shown
    if (members.length < 2 || home.dismissedHints.includes(hint.id)) return [];
    for (const s of members) used.add(s.id);
    return [hintBox(home, act, hint, members)];
  });
  const rest = list.filter((s) => !used.has(s.id));
  return [...boxes, ...(rest.length ? [sessionList(home, act, rest, null)] : [])];
}
