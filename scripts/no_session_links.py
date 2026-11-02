#!/usr/bin/env python3
"""Refuse a commit message that links to a Claude session.

A `Claude-Session:` line, or any address of a claude.ai/code session, points
into one person's account: to everyone else reading this public history it is
a dead link that says nothing. Credit stays as it is (`Co-Authored-By:`), and so
does an ordinary mention of claude.ai.

    python scripts/no_session_links.py origin/main..HEAD
    python scripts/no_session_links.py --file .git/COMMIT_EDITMSG

Only the commits of a range are read. Continuous integration passes the range
a pull request or a push adds, so older history, which the owner chose to keep
as it is, is never checked. The second form is what the commit-msg hook uses.
Exit 1 names every message that fails.
"""

from __future__ import annotations

import pathlib
import re
import subprocess
import sys

SESSION = re.compile(r"claude-session\s*:|claude\.ai/code/session_", re.IGNORECASE)
REASON = "links to a Claude session; leave out the Claude-Session line and claude.ai/code/session addresses"
#: `--file PATH`, the form the commit-msg hook uses.
FILE_FORM = 2


def offence(message: str) -> str | None:
    """Why `message` is refused, or None."""
    # RULE: a commit message never links to a Claude session
    if SESSION.search(message):
        return REASON
    return None


def offenders(commit_range: str, cwd: str | None = None) -> list[tuple[str, str]]:
    """(hash, subject) of every commit in `commit_range` whose message is refused."""
    out = subprocess.run(  # noqa: S603
        ["git", "log", "--format=%H%x00%B%x01", commit_range],  # noqa: S607
        capture_output=True,
        text=True,
        check=True,
        cwd=cwd,
    ).stdout
    found = []
    for record in out.split("\x01"):
        if "\x00" not in record:
            continue
        sha, message = record.strip("\n").split("\x00", 1)
        if offence(message):
            found.append((sha, message.strip().splitlines()[0]))
    return found


def main() -> int:
    """Check one message file, or every commit in a range; exit 1 if any links a session."""
    args = sys.argv[1:]
    if len(args) == FILE_FORM and args[0] == "--file":
        text = pathlib.Path(args[1]).read_text(encoding="utf-8")
        message = "\n".join(line for line in text.splitlines() if not line.startswith("#"))
        reason = offence(message)
        if reason:
            print(f"The commit message {reason}.", file=sys.stderr)  # noqa: T201
            return 1
        return 0
    if len(args) != 1:
        print(__doc__, file=sys.stderr)  # noqa: T201
        return 2
    found = offenders(args[0])
    for sha, subject in found:
        print(f"{sha[:12]} {subject}: links to a Claude session", file=sys.stderr)  # noqa: T201
    if not found:
        print(f"No commit in {args[0]} links to a Claude session.")  # noqa: T201
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
