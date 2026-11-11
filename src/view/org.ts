// A programme's Organisation view: each role, why it exists, who fills it, and what it may not do.
import type { OrgProgramme, OrgRole } from "../bridge";
import { type Key, t } from "../i18n";
import { button, el } from "../view/dom";
import type { Actions, Home } from "../view/types";

const ROUTES: Record<string, Key> = {
  facts: "org.route.facts", // not shown
  proposals: "org.route.proposals", // not shown
  decisions: "org.route.decisions", // not shown
  quality: "org.route.quality", // not shown
};

function role(r: OrgRole, org: OrgProgramme): HTMLElement {
  // RULE: each role shows its purpose, who fills it, its limits and routing, and an unfilled one is marked
  const unfilled = org.unfilled.includes(r.id) || !r.sessions.length;
  const part = r.component ? (org.components.find((c) => c.id === r.component)?.name ?? r.component) : "";
  const who = unfilled
    ? t("org.unfilled")
    : `${r.session_names.join(", ")} · ${t(r.running ? "org.running" : "org.stopped")}`;
  const limits = Array.isArray(r.limits) ? r.limits.join("; ") : r.limits;
  const routes = r.routing.map((x) => (ROUTES[x] ? t(ROUTES[x]) : x)).join(", ");
  const item = el(
    "li",
    unfilled ? "role unfilled" : "role",
    el("span", "role-name", r.name),
    ...(part ? [el("span", "role-component muted", part)] : []),
    el("p", "role-purpose", r.purpose),
    el("p", "role-sessions", who),
    ...(limits ? [el("p", "role-limits muted", limits)] : []),
    ...(routes ? [el("p", "role-routing muted", t("org.routes", { routes }))] : []),
  );
  return item;
}

export function orgScreen(open: NonNullable<Home["org"]>, home: Home, act: Actions): HTMLElement {
  const name = home.programmes.find((p) => p.id === open.programme)?.name ?? open.programme;
  const org = open.data;
  const back = button(t("detail.back"), act.closeOrg, "back");
  if (org === undefined)
    return el("section", "org", back, el("h2", undefined, name), el("p", "muted", t("org.reading")));
  if (org === null)
    return el("section", "org", back, el("h2", undefined, name), el("p", "notice", t("org.none")));
  return el(
    "section",
    "org",
    back,
    el("h2", undefined, org.name),
    el("ul", "roles", ...org.roles.map((r) => role(r, org))),
  );
}
