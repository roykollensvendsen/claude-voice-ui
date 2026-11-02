// How much of the plan is used, how full a session's context is, and an estimate of voice activity.
// The figures are the bridge's (GET /api/v1/usage); this only words them. Never a money figure.
import { type Key, plural, t } from "./i18n";

export interface Window {
  used_percentage: number;
  resets_at: string;
  /** Past its reset: the figure is from the previous window. */
  stale: boolean;
}

export interface VoiceDay {
  connections: number;
  minutes: number;
  tool_calls: number;
  chars_out: number;
  est_tokens: number;
}

export interface Usage {
  plan: { as_of: string; label: string; five_hour: Window | null; seven_day: Window | null } | null;
  warning: { status: "allowed_warning" | "rejected"; used_percentage: number; at: string } | null;
  voice: { label: string; today: VoiceDay; last_7_days: (VoiceDay & { day?: string })[] };
}

export interface Bar {
  title: string;
  percent: number;
  note: string;
  stale: boolean;
}

export function resetsIn(at: string, now: number): string {
  const minutes = Math.floor((Date.parse(at) - now) / 60_000);
  if (!(minutes > 0)) return t("usage.resetsNow");
  if (minutes < 60) return t("usage.inMin", { min: minutes });
  if (minutes < 24 * 60) {
    const rest = minutes % 60;
    const h = Math.floor(minutes / 60);
    return rest ? t("usage.inHMin", { h, min: rest }) : t("usage.inH", { h });
  }
  return t("usage.inDH", { d: Math.floor(minutes / (24 * 60)), h: Math.floor((minutes % (24 * 60)) / 60) });
}

export function planBars(usage: Usage, now: number): Bar[] {
  const windows: [Key, Window | null | undefined][] = [
    ["usage.fiveHours", usage.plan?.five_hour],
    ["usage.weekly", usage.plan?.seven_day],
  ];
  return windows.flatMap(([title, w]) =>
    w
      ? [
          {
            title: t(title),
            percent: Math.min(100, Math.max(0, w.used_percentage)),
            note: w.stale ? t("usage.oldFigure") : t("usage.resets", { when: resetsIn(w.resets_at, now) }),
            stale: w.stale,
          },
        ]
      : [],
  );
}

export function warningText(usage: Usage): { text: string; severity: "warn" | "stop" } | null {
  const w = usage.warning;
  if (!w) return null;
  // RULE: a reached limit says so
  if (w.status === "rejected") return { text: t("usage.reached"), severity: "stop" };
  return { text: t("usage.close", { percent: w.used_percentage }), severity: "warn" };
}

/** The highest share used of any current window: the limit that will be met first. */
export function tightest(usage: Usage): number | null {
  if (usage.warning?.status === "rejected") return 100;
  const shown = planBars(usage, Date.now()).filter((b) => !b.stale);
  return shown.length ? Math.max(...shown.map((b) => b.percent)) : null;
}

/** How the top bar's percentage is coloured: grey, then yellow, then red as the limit nears. */
export function usageLevel(
  percent: number,
  warning?: "allowed_warning" | "rejected",
): "ok" | "warn" | "full" {
  // RULE: the percentage turns from grey to yellow to red near the limit
  if (warning === "rejected" || percent >= 90) return "full";
  if (warning === "allowed_warning" || percent >= 70) return "warn";
  return "ok";
}

function tokens(n: number): string {
  return n < 1000 ? `~${n}` : `~${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

export function voiceLine(usage: Usage): string {
  const today = usage.voice.today;
  if (!today.connections && !today.tool_calls) return t("usage.voiceNone");
  return [
    plural(today.connections, "usage.conversations"),
    t("usage.minutes", { count: today.minutes }),
    plural(today.tool_calls, "usage.toolCalls"),
    t("usage.tokens", { count: tokens(today.est_tokens) }),
  ].join(" · ");
}

/** How a context figure is coloured: a session near full soon has to compact or start over. */
export function contextTone(percent: number): "ok" | "warn" | "full" {
  if (percent >= 95) return "full";
  if (percent >= 80) return "warn";
  return "ok";
}
