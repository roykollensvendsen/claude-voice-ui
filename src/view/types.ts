// The state the screens are drawn from, and what a tap on them asks for.
import {
  type Active,
  type BridgeInfo,
  type Doctor,
  type Focused,
  type Machine,
  type Pending,
  type Pr,
  type Prompt,
  type Reply,
  type SessionDetail,
  type Settings,
  type SoftwareHealth,
  type Turn,
  type Work,
} from "../bridge";
import { type Language } from "../i18n";
import { type Session } from "../states";
import { type UpdateState } from "../update";
import { type Usage } from "../usage";

export type Connection = "connecting" | "live" | "reconnecting";

export interface Home {
  sessions: Session[];
  active: Active | null;
  /** The other computers the bridge reaches, each with whether it answers. */
  machines: Machine[];
  /** The session the voice is talking to right now, by name or id, while that is recent. */
  focus: string | null;
  /** Sessions the voice only looked at lately, by id or name as the bridge gave them. */
  peeks: string[];
  connection: Connection;
  problem: string | null;
  doctor: Doctor | null;
  usage: Usage | null;
  bridge: BridgeInfo | null;
  update: UpdateState;
  /** Groups of sessions folded away by their heading: a machine's name, or the hub's own. */
  folded: Set<string>;
  /** Cards opened with their arrow. */
  expanded: Set<string>;
  /** Hidden sessions, each with its state when it was hidden, so a new wait brings it back. */
  hidden: Record<string, string>;
  /** Cards whose long question is shown in full. */
  more: Set<string>;
  hiddenOpen: boolean;
  /** The session just tapped, flashed for a moment as the tap's confirmation. */
  picked: string | null;
  view: View;
  legendOpen: boolean;
  usageOpen: boolean;
  /** A newer build of the page has been deployed. */
  newVersion: boolean;
  /** The list behind What's new, once tapped open; null while closed. */
  whatsNew: { feat: string[]; fix: string[] } | null;
  theme: Theme;
  menuOpen: boolean;
  /** "system" follows the phone's own language. */
  language: Language | "system";
  /** The session whose page is open, or null for the cards. */
  open: Detail | null;
  /** Session ids in the order shown since the page opened; an ended one keeps its place as a gap. */
  placed: string[];
  /** Questions and approvals the sessions hold for the phone. */
  prompts: Prompt[];
  /** How the bridge starts new sessions; null when it has no such settings. */
  settings: Settings | null;
  /** The page of how both programs' code is doing, when open; `data` is null while it loads. */
  health: { data: SoftwareHealth | null } | null;
  /** What came of an answer: a refusal by prompt id, or a note by session id once it is gone. */
  replies: Record<string, { error?: string; note?: string }>;
  /** Whether the owner has opened the list of what is missing. */
  doctorOpen: boolean;
  /** Why the last message to a session could not be handed over, by session id. */
  undelivered: Record<string, string>;
  /** When the bridge started again while the page watched, until the note is put away. */
  restarted: string | null;
  /** The team's work: what waits on the owner, and the open pull requests; null from a bridge without it. */
  work: Work | null;
  /** The waiting item whose command was just copied, for a moment. */
  copied: string | null;
  /** Whether the page was opened on the bridge's own computer, where a terminal can be brought forward. */
  here: boolean;
  /** What the bridge said when last asked to open a session's terminal. */
  opened: { session: string; answer: Focused } | null;
}

export interface Detail {
  id: string;
  turns: Turn[];
  /** The last turn shown, so the next fetch asks only for what came after. */
  lastIndex: number | undefined;
  pending: Pending | null;
  prs: Pr[];
  /** What the bridge reads from the transcript; null until it has come. */
  info: SessionDetail | null;
}

export type View = "grid" | "cards";

/** "system" follows the phone's own setting. */
export type Theme = "system" | "light" | "dark";

export interface Actions {
  pick(id: string): void;
  openPage(id: string): void;
  back(): void;
  signOut(): void;
  toggleDoctor(): void;
  toggleCard(id: string): void;
  showMore(id: string): void;
  hide(id: string): void;
  unhide(id: string): void;
  toggleHidden(): void;
  /** Fold a machine's group away, or open it again. */
  toggleGroup(key: string): void;
  setView(view: View): void;
  toggleLegend(): void;
  toggleUsage(): void;
  reload(): void;
  nextWaiting(): void;
  changeSettings(change: Partial<Settings>): void;
  openHealth(): void;
  closeHealth(): void;
  dismissRestart(): void;
  /** Copy a waiting item's command, so the owner can paste it. */
  copy(id: string, command: string): void;
  /** Bring a session's terminal window forward on this computer. */
  openTerminal(session: string): void;
  /** Ask for a new summary of the open session. */
  summarize(): void;
  /** `said` is the answer in words, for the note shown once it is sent. */
  answer(prompt: Prompt, reply: Reply, said: string): void;
  toggleWhatsNew(): void;
  toggleMenu(): void;
  setTheme(theme: Theme): void;
  setLanguage(language: Language | "system"): void;
  update: UpdateActions;
}

export interface UpdateActions {
  ask(): void;
  cancel(): void;
  confirm(): void;
}
