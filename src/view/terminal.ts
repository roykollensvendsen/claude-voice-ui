// Bringing a session's terminal window forward, offered only on the bridge's own computer.
import { type Focused } from "../bridge";
import { type Key, t } from "../i18n";
import { type Session } from "../states";
import { button, el } from "../view/dom";
import { type Actions, type Home } from "../view/types";

/** The words for what the bridge did, or for why it would not. */
const said = (answer: Focused) => t(`terminal.${"done" in answer ? answer.done : answer.reason}` as Key);

/** The button, and what the bridge said the last time it was pressed for this session. */
export function terminalRow(home: Home, s: Session | undefined, act: Actions): HTMLElement[] {
  // RULE: a terminal is offered only on this computer, and only for a session that runs on it
  if (!home.here || !s || s.machine) return [];
  const answer = home.opened?.session === s.id ? home.opened.answer : null;
  const note = answer ? [el("p", "opened muted", said(answer))] : [];
  return [button(t("terminal.open"), () => act.openTerminal(s.id), "open-terminal"), ...note];
}
