// One session's own page: what waits for an answer, what its transcript tells, and its last turns.
import { type Pending, type Prompt, type SessionDetail, type Turn } from "../bridge";
import { type Key, plural, t } from "../i18n";
import { cardState, LOOK, minutesInState, timeInWords } from "../states";
import { ago, button, claudeLink, el, gitRow, matches, stateLine } from "../view/dom";
import { type Actions, type Detail, type Home } from "../view/types";

/** A question to answer with a tap, ticks or words of one's own, or an approval to allow or deny. */
export function promptBlock(p: Prompt, home: Home, act: Actions): HTMLElement {
  const error = home.replies[p.id]?.error;
  const parts: (HTMLElement | string)[] = [];
  if (p.kind === "approval") {
    parts.push(
      el("b", "tool", p.tool ?? ""),
      el("pre", undefined, p.input ?? ""),
      ...(p.cut ? [el("p", "muted", t("prompt.cut"))] : []),
      el(
        "div",
        "decide",
        button(t("prompt.allow"), () => act.answer(p, { decision: "allow" }, t("prompt.allow")), "allow"),
        button(t("prompt.deny"), () => act.answer(p, { decision: "deny" }, t("prompt.deny")), "deny"),
      ),
    );
  } else if (p.question) {
    const q = p.question;
    const option = (o: { label: string; description: string }) =>
      el("span", undefined, el("b", undefined, o.label), el("span", "muted", o.description));
    const ticks: HTMLInputElement[] = [];
    const choices = q.options.map((o) => {
      if (!q.multi) return button("", () => act.answer(p, { answer: o.label }, o.label), "option");
      const tick = el("input");
      tick.type = "checkbox";
      tick.value = o.label;
      ticks.push(tick);
      return el("label", "option", tick);
    });
    choices.forEach((c, i) => {
      const o = q.options[i];
      if (o) c.append(...option(o).childNodes);
    });
    const own = el("input", "own");
    own.placeholder = t("prompt.own");
    const send = button(t("prompt.send"), () => {
      const text = own.value.trim();
      if (text) act.answer(p, { answer: { text } }, text);
      else if (q.multi) {
        const picked = ticks.filter((x) => x.checked).map((x) => x.value);
        if (picked.length) act.answer(p, { answer: picked }, picked.join(", "));
      }
    });
    parts.push(
      ...(q.header ? [el("div", "muted", q.header)] : []),
      el("div", "question-text", q.text),
      el("div", "options", ...choices),
      el("div", "own-row", own, send),
    );
  }
  return el("section", "prompt", ...parts, ...(error ? [el("p", "error", error)] : []));
}

export const MOST_USED = 3;

export const TIMELINE: Record<string, Key> = {
  prompt: "timeline.prompt",
  question: "timeline.question",
  error: "timeline.error",
  commit: "timeline.commit",
  pr_opened: "timeline.prOpened",
  pr_merged: "timeline.prMerged",
  compact: "timeline.compact",
};

/** What the transcript tells: context, tools, helpers, the summary, and a timeline. */
export function sessionInfo(info: SessionDetail, act: Actions): HTMLElement[] {
  const facts = [
    ...(info.context ? [t("detail.context", { percent: info.context.used_percentage })] : []),
    plural(info.tool_calls.total, "detail.toolCalls"),
    ...(info.subagents.total
      ? [plural(info.subagents.total, "detail.helpers", { running: info.subagents.running })]
      : []),
  ];
  const tools = Object.entries(info.tool_calls.by_tool).sort((a, b) => b[1] - a[1]);
  const rest = tools.length - MOST_USED;
  const used = [
    ...tools.slice(0, MOST_USED).map(([name, n]) => `${name} ${n}`),
    ...(rest > 0 ? [plural(rest, "detail.otherTools")] : []),
  ];
  const generating = info.summary_state === "generating";
  const refresh = button("↻", act.summarize, "refresh");
  refresh.disabled = generating;
  refresh.setAttribute("aria-label", t("summary.refresh"));
  const summary = el(
    "section",
    "summary",
    el("div", "summary-head", el("h3", undefined, t("summary.title")), refresh),
    ...(generating ? [el("p", "muted", t("summary.generating"))] : []),
    ...(info.summary ? [el("p", undefined, info.summary)] : []),
    ...(info.summary && info.summary_at && !generating
      ? [el("div", "muted", t("summary.made", { time: ago(info.summary_at) }))]
      : []),
    ...(info.summary_state === "error"
      ? [el("p", "error", t("summary.failed", { why: info.summary_error ?? "" }))]
      : []),
    ...(!info.summary && !generating ? [el("p", "muted", t("summary.none"))] : []),
  );
  const items = info.timeline.map((item) => {
    const key = TIMELINE[item.kind];
    const said = key ? t(key, { text: item.text }) : item.text;
    const body: HTMLElement | string = item.url
      ? Object.assign(el("a", undefined, said), {
          href: item.url,
          target: "_blank",
          rel: "noopener",
        })
      : said;
    return el("li", `kind-${item.kind}`, ...(item.at ? [el("span", "when", ago(item.at))] : []), body);
  });
  return [
    el("div", "facts", facts.join(" · ")),
    ...(used.length ? [el("div", "tools muted", used.join(" · "))] : []),
    summary,
    ...(items.length ? [el("h3", undefined, t("timeline.title")), el("ol", "timeline", ...items)] : []),
  ];
}

export function pendingBlock(p: Pending | null): HTMLElement[] {
  if (!p || (!p.question && !p.approvals.length)) return [];
  const parts: HTMLElement[] = [];
  if (p.question) {
    const options = el("ul", "options", ...(p.question.options ?? []).map((o) => el("li", undefined, o)));
    parts.push(
      el(
        "div",
        "question",
        el("b", undefined, t("pending.yourChoice")),
        el("div", undefined, p.question.text),
        options,
      ),
    );
  }
  for (const a of p.approvals) {
    parts.push(
      el(
        "div",
        "question",
        t("pending.approval", { number: a.number, tool: a.tool, summary: a.summary }).trim(),
      ),
    );
  }
  // RULE: an approval it waits on is shown, to be answered by voice or at the screen
  if (p.approvals.length) parts.push(el("p", "muted", t("pending.answerElsewhere")));
  return [el("section", "pending", ...parts)];
}

export function turn(said: Turn): HTMLElement {
  return el(
    "div",
    `turn ${said.role}`,
    el("div", "who", said.role === "user" ? t("turn.you") : t("turn.claude")),
    el("div", "text", said.text),
    ...(said.cut ? [el("div", "cut", t("turn.cut", { count: said.length }))] : []),
  );
}

export function detailScreen(home: Home, d: Detail, act: Actions): HTMLElement {
  const s = home.sessions.find((x) => x.id === d.id);
  const back = button(t("detail.back"), act.back, "back");
  const prompts = home.prompts.filter((p) => (s ? matches(s, p.session) : p.session === d.id));
  const note = prompts.length ? undefined : home.replies[d.id]?.note;
  const prs = d.prs.map((pr) => {
    const link = el("a", undefined, `#${pr.number} ${pr.title}${pr.draft ? t("detail.draft") : ""}`);
    link.href = pr.url;
    link.target = "_blank";
    link.rel = "noopener";
    return el("li", undefined, link);
  });
  return el(
    "section",
    "detail",
    back,
    el("h2", undefined, s?.name ?? d.id),
    // What waits for an answer comes first, so the count at the top lands right on it.
    ...prompts.map((p) => promptBlock(p, home, act)),
    ...(note ? [el("p", "answered", note)] : []),
    ...(s
      ? [
          el("div", "meta", [s.project, s.kind].filter(Boolean).join(" · ")),
          el(
            "p",
            "words",
            t("session.stateFor", {
              state: LOOK[cardState(s)].label,
              time: timeInWords(minutesInState(s, Date.now())),
            }),
          ),
          stateLine(s),
          ...gitRow(s),
          ...claudeLink(s, t("session.openInClaude")),
        ]
      : [el("p", "notice", t("detail.gone"))]),
    ...(prompts.length ? [] : pendingBlock(d.pending)),
    ...(d.info ? sessionInfo(d.info, act) : []),
    el("div", "turns", ...d.turns.map(turn)),
    ...(prs.length ? [el("h3", undefined, t("detail.prs")), el("ul", "prs", ...prs)] : []),
  );
}
