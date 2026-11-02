// How much of the plan is used, how full a session's context is, and an estimate of voice activity.
// The figures are the bridge's (GET /api/v1/usage); this only words them. Never a money figure.

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
  if (!(minutes > 0)) return "now";
  if (minutes < 60) return `in ${minutes} min`;
  if (minutes < 24 * 60) {
    const rest = minutes % 60;
    return `in ${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ""}`;
  }
  return `in ${Math.floor(minutes / (24 * 60))} d ${Math.floor((minutes % (24 * 60)) / 60)} h`;
}

export function planBars(usage: Usage, now: number): Bar[] {
  const windows: [string, Window | null | undefined][] = [
    ["5 hours", usage.plan?.five_hour],
    ["Weekly", usage.plan?.seven_day],
  ];
  return windows.flatMap(([title, w]) =>
    w
      ? [
          {
            title,
            percent: Math.min(100, Math.max(0, w.used_percentage)),
            note: w.stale ? "old figure" : `resets ${resetsIn(w.resets_at, now)}`,
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
  if (w.status === "rejected") return { text: "The plan's limit is reached", severity: "stop" };
  return { text: `Close to the plan's limit: ${w.used_percentage}% used`, severity: "warn" };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function tokens(n: number): string {
  return n < 1000 ? `~${n}` : `~${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

export function voiceLine(usage: Usage): string {
  const t = usage.voice.today;
  if (!t.connections && !t.tool_calls) return "none yet";
  return [
    plural(t.connections, "conversation"),
    `${t.minutes} min`,
    plural(t.tool_calls, "tool call"),
    `${tokens(t.est_tokens)} tokens`,
  ].join(" · ");
}

/** How a context figure is coloured: a session near full soon has to compact or start over. */
export function contextTone(percent: number): "ok" | "warn" | "full" {
  if (percent >= 95) return "full";
  if (percent >= 80) return "warn";
  return "ok";
}
