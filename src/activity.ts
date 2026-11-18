// The activity view's numbers: the bridge's recording switch, its series over time, and the live list.

export type Window = "1h" | "6h" | "24h" | "7d";
export const WINDOWS: Window[] = ["1h", "6h", "24h", "7d"];

/** GET /api/v1/activity: whether the bridge is recording, until when, and what may be asked for. */
export interface Activity {
  on: boolean;
  until: string | null;
  durations: Window[];
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

/** Every bucket from start to end: its counts, zero when recorded but empty, or null when not recorded. */
export function slots(_series: ActivitySeries): (Point | null)[] {
  return [];
}
