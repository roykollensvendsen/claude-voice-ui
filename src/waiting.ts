// Whether an item waiting on the owner still needs him, from what the page already knows.
import type { Session } from "./states";
import type { Work } from "./team";

/** How an item waiting on the owner is shown: hidden, faded with a reason, or as it is (null). */
export type WaitingMark = "hidden" | "session-ended" | "maybe-done" | null;

/**
 * What the page knows says about an item: its prompt (when the team linked one and the prompts were
 * read), and its session as found on the page now (undefined when it is not there).
 */
export function waitingMark(
  item: Work["waiting_on_owner"][number],
  s: Session | undefined,
  prompts: string[] | null,
): WaitingMark {
  // RULE: a failed read of the pending prompts hides nothing
  if (item.prompt && prompts && !prompts.includes(item.prompt)) return "hidden";
  if (!item.session) return null;
  // RULE: an item whose session has ended is shown faded, never hidden
  if (!s) return "session-ended";
  // RULE: an item whose session has moved on to another is hidden
  if (s.moved_to) return "hidden";
  return workingSince(s, item.since) ? "maybe-done" : null;
}

/** Whether the session has started a turn since `since`: working now, and since later than that. */
function workingSince(s: Session, since: string): boolean {
  // RULE: an item whose session only went idle after it was written is not marked as done
  const working = (s.state ?? s.status) === "busy";
  return working && Date.parse(s.state_since ?? "") > Date.parse(since);
}
