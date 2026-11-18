// The activity view's numbers: the bridge's recording switch, its series over time, and the live list.

export type Window = "1h" | "6h" | "24h" | "7d";
export const WINDOWS: Window[] = ["1h", "6h", "24h", "7d"];
/** How long each point covers in each window, so a chart never has more than about 360 points. */
export const BUCKET_S: Record<Window, number> = { "1h": 60, "6h": 300, "24h": 900, "7d": 3600 };

/** How long recording may run before it switches itself off. */
export type Duration = "1h" | "8h" | "24h" | "7d";

/** GET /api/v1/activity: whether the bridge is recording, until when, and what may be asked for. */
export interface Activity {
  on: boolean;
  until: string | null;
  durations: Duration[];
  scopes: { orgs: string[]; sessions: { name: string; org: string; role: string }[] };
}

/** One bucket's counts, summed over the sessions in the scope. */
export interface Point {
  t: string;
  tok_in: number;
  tok_out: number;
  n_read: number;
  n_write: number;
  n_run: number;
  n_mcp: number;
  n_agent: number;
  tool_ms: number;
  cpu_ms: number;
  rss_mb_max: number;
  busy_s: number;
  idle_s: number;
  waiting_s: number;
}

/** GET /api/v1/activity/series: the buckets that have a row, and the spans that were recorded. */
export interface ActivitySeries {
  scope: string;
  window: Window;
  bucket_s: number;
  from: string;
  to: string;
  recording: { from: string; to: string }[];
  points: Point[];
}

/** One session as it is right now. */
export interface NowSession {
  name: string;
  org: string;
  role: string;
  status: "busy" | "idle" | "waiting";
  status_since: string;
  call: { kind: string; tool: string; program: string | null; started: string } | null;
  turn_started: string | null;
  state: "ok" | "yellow" | "red";
  cpu_pct: number;
  rss_mb: number;
  child: { program: string; age_s: number } | null;
}

/** GET /api/v1/activity/now. */
export interface ActivityNow {
  at: string;
  sessions: NowSession[];
}

/** What the code-health page's activity section shows, and what the owner picked in it. */
export interface ActivityView {
  state: Activity;
  scope: string;
  window: Window;
  for: Duration;
  series: ActivitySeries | null;
  now: ActivityNow | null;
  /** The bridge's own sentence when it refused a switch or a clear. */
  problem: string | null;
}

export const newView = (state: Activity): ActivityView => ({
  state,
  scope: "all",
  window: "1h",
  for: "8h",
  series: null,
  now: null,
  problem: null,
});

const empty = (t: string): Point => ({
  t,
  tok_in: 0,
  tok_out: 0,
  n_read: 0,
  n_write: 0,
  n_run: 0,
  n_mcp: 0,
  n_agent: 0,
  tool_ms: 0,
  cpu_ms: 0,
  rss_mb_max: 0,
  busy_s: 0,
  idle_s: 0,
  waiting_s: 0,
});

/** Every bucket from start to end: its counts, zero when recorded but empty, or null when not recorded. */
export function slots(series: ActivitySeries): (Point | null)[] {
  const step = series.bucket_s * 1000;
  const from = Date.parse(series.from);
  const count = Math.round((Date.parse(series.to) - from) / step);
  const byBucket = new Map(series.points.map((p) => [Math.floor((Date.parse(p.t) - from) / step), p]));
  const spans = series.recording.map((r) => [Date.parse(r.from), Date.parse(r.to)] as const);
  return Array.from({ length: count }, (_, i) => {
    const t = from + i * step;
    const point = byBucket.get(i);
    if (point) return point;
    // RULE: a bucket outside every recorded span is a gap, never a zero
    return spans.some(([a, b]) => t >= a && t < b) ? empty(new Date(t).toISOString()) : null;
  });
}
