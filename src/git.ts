// A session folder's git status, as the bridge reports it, turned into the short line on a card.

/** How far a branch is from another, counted in commits. */
export interface Distance {
  name: string;
  ahead: number;
  behind: number;
}

/** One session's git status, as GET /api/v1/sessions gives it; null outside a repository. */
export interface Git {
  branch: string | null;
  commit: { hash: string; subject: string };
  dirty: boolean;
  changed_files: number;
  /** The remote branch this one pushes to. */
  tracking: Distance | null;
  /** The repository's main branch. */
  main: Distance | null;
  /** A fork's parent repository, when there is one. */
  parent: Distance | null;
  checked_at: string;
}

export interface Mark {
  text: string;
  /** "behind" is what the update button will attach to. */
  kind: "dirty" | "ahead" | "behind";
}

export interface GitLine {
  branch: string;
  commit: string;
  marks: Mark[];
}

function distance(d: Distance | null, name: string): Mark[] {
  if (!d || (d.ahead === 0 && d.behind === 0)) return [];
  const arrows = [d.ahead ? `↑${d.ahead}` : "", d.behind ? `↓${d.behind}` : ""].filter(Boolean).join(" ");
  // RULE: being behind is marked as behind even when also ahead
  return [{ text: `${arrows} ${name}`, kind: d.behind ? "behind" : "ahead" }];
}

export function gitLine(git: Git): GitLine {
  const dirty: Mark[] = git.dirty
    ? [{ text: git.changed_files ? `${git.changed_files} changed` : "changed", kind: "dirty" }]
    : [];
  return {
    branch: git.branch ?? "detached",
    commit: `${git.commit.hash} ${git.commit.subject}`,
    marks: [
      ...dirty,
      ...distance(git.tracking, git.tracking?.name ?? ""),
      // "origin/main" reads as "main": which remote holds it rarely matters on a card.
      ...distance(git.main, git.main?.name.replace(/^[^/]+\//, "") ?? ""),
      ...distance(git.parent, git.parent?.name ?? ""),
    ],
  };
}
