// Which programme sections are open. One opens by itself when the page first shows it busy, and
// again when something new in it waits or failed; none ever folds by itself.

import type { Home } from "../view";
import { alarmsIn, busy, sectionSessions } from "../view/programmes";

export function settleSections(home: Home) {
  for (const [key, list] of sectionSessions(home)) {
    const shown = list.filter((s) => !(s.id in home.hidden));
    const alarms = alarmsIn(shown);
    const was = home.sections[key];
    if (!was) {
      home.sections[key] = { open: busy(shown), alarms };
      continue;
    }
    // RULE: a section folded by hand stays folded until something new waits in it
    if (alarms.some((id) => !was.alarms.includes(id))) was.open = true;
    was.alarms = alarms;
  }
}
