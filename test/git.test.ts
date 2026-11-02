import { describe, expect, test } from "vitest";
import { type Git, gitLine } from "../src/git";

function git(over: Partial<Git> = {}): Git {
  return {
    branch: "feat/totals",
    commit: { hash: "a1b2c3d", subject: "Fix the export totals" },
    dirty: false,
    changed_files: 0,
    tracking: null,
    main: null,
    parent: null,
    checked_at: "",
    ...over,
  };
}

describe("the git line on a card", () => {
  test("it names the branch and the last commit", () => {
    const line = gitLine(git());
    expect(line.branch).toBe("feat/totals");
    expect(line.commit).toBe("a1b2c3d Fix the export totals");
  });

  test("a detached checkout says so instead of a branch", () => {
    expect(gitLine(git({ branch: null })).branch).toBe("detached");
  });

  test("uncommitted changes are counted", () => {
    expect(gitLine(git({ dirty: true, changed_files: 3 })).marks).toEqual([
      { text: "3 changed", kind: "dirty" },
    ]);
  });

  test("a dirty tree with no count still says it has changes", () => {
    expect(gitLine(git({ dirty: true, changed_files: 0 })).marks).toEqual([
      { text: "changed", kind: "dirty" },
    ]);
  });

  test("ahead and behind main reads as arrows against main's short name", () => {
    const line = gitLine(git({ main: { name: "origin/main", ahead: 2, behind: 5 } }));
    expect(line.marks).toEqual([{ text: "↑2 ↓5 main", kind: "behind" }]);
  });

  test("only the arrows that are not zero are shown", () => {
    expect(gitLine(git({ main: { name: "origin/main", ahead: 3, behind: 0 } })).marks).toEqual([
      { text: "↑3 main", kind: "ahead" },
    ]);
  });

  test("even with main shows nothing about main", () => {
    expect(gitLine(git({ main: { name: "origin/main", ahead: 0, behind: 0 } })).marks).toEqual([]);
  });

  test("commits not yet pushed are counted against the tracked branch", () => {
    const line = gitLine(git({ tracking: { name: "origin/feat/totals", ahead: 1, behind: 0 } }));
    expect(line.marks).toEqual([{ text: "↑1 origin/feat/totals", kind: "ahead" }]);
  });

  test("a fork shows how far it is from its parent", () => {
    const line = gitLine(git({ parent: { name: "upstream/main", ahead: 0, behind: 7 } }));
    expect(line.marks).toEqual([{ text: "↓7 upstream/main", kind: "behind" }]);
  });

  test("the marks come in the order changes, tracked branch, main, parent", () => {
    const line = gitLine(
      git({
        dirty: true,
        changed_files: 1,
        tracking: { name: "origin/feat/totals", ahead: 1, behind: 0 },
        main: { name: "origin/main", ahead: 2, behind: 0 },
        parent: { name: "upstream/main", ahead: 0, behind: 4 },
      }),
    );
    expect(line.marks.map((m) => m.text)).toEqual([
      "1 changed",
      "↑1 origin/feat/totals",
      "↑2 main",
      "↓4 upstream/main",
    ]);
  });
});
