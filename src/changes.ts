// What a newer build brings, read from the commit messages: new features and fixes, nothing else.

export interface Change {
  hash: string;
  /** Null for any other commit, kept so that a build made on it can be found. */
  kind: "feat" | "fix" | null;
  text: string;
}

const SUBJECT = /^(feat|fix)(\([^)]*\))?!?: (.+)$/;

/** Each line `hash<TAB>subject`, newest first, as `git log --format=%h%x09%s` writes them. */
export function parseLog(log: string): Change[] {
  return log.split("\n").flatMap((line) => {
    const [hash = "", subject = ""] = line.split("\t");
    if (!hash) return [];
    const m = SUBJECT.exec(subject.trim());
    return [m ? { hash, kind: m[1] as Change["kind"], text: m[3] ?? "" } : { hash, kind: null, text: "" }];
  });
}

/** The changes after the build the page runs, whose id starts with its commit; all of them if it is not listed. */
export function whatsNew(changes: readonly Change[], built: string): { feat: string[]; fix: string[] } {
  const commit = built.split("-")[0] ?? "";
  const mine = changes.findIndex((c) => c.hash === commit);
  const newer = mine === -1 ? changes : changes.slice(0, mine);
  return {
    feat: newer.filter((c) => c.kind === "feat").map((c) => c.text),
    fix: newer.filter((c) => c.kind === "fix").map((c) => c.text),
  };
}
