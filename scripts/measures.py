#!/usr/bin/env python3
"""Check that the code-health page has words for every measure the bridge publishes.

The bridge lists the measures it sends in docs/event-api/measures.json in its
own repository. The page names each one through MEASURES in
src/view/health.ts, which points at a key in src/i18n/en.json. Every other
language must have every key, which tests/test_translations.py checks, so
English is enough here.

    python scripts/measures.py [path or URL of measures.json]

With no argument it reads the bridge's main branch on GitHub. Exit 1 names
each measure the page has no words for.
"""

from __future__ import annotations

import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).parent.parent
PUBLISHED = (
    "https://raw.githubusercontent.com/roykollensvendsen/claude-voice/main/docs/event-api/measures.json"
)
LIST = re.compile(r"export const MEASURES[^=]*=\s*\{(?P<body>.*?)\n\};", re.DOTALL)
ENTRY = re.compile(r'^\s*(?P<id>[a-z_]+):\s*"(?P<key>[^"]+)",?\s*$', re.MULTILINE)


def page_measures(source: str) -> dict[str, str]:
    """The page's own list: each measure id, and the key of its words."""
    found = LIST.search(source)
    if not found:
        msg = "src/view/health.ts has no MEASURES list to check against"
        raise ValueError(msg)
    return {m["id"]: m["key"] for m in ENTRY.finditer(found["body"])}


def missing(published: list[dict[str, str]], source: str, words: dict[str, str]) -> list[str]:
    """One line for each published measure the page cannot name, saying what is missing."""
    named = page_measures(source)
    lines = []
    for measure in published:
        key = named.get(measure["id"])
        if key is None:
            lines.append(
                f"{measure['id']}: the page has no words for it (add it to MEASURES in src/view/health.ts)"
            )
        elif key not in words:
            lines.append(f"{measure['id']}: {key} is not in src/i18n/en.json")
    return lines


def read(where: str) -> list[dict[str, str]]:
    """The published list, from a file or from a URL."""
    if where.startswith("https://"):
        with urllib.request.urlopen(where, timeout=30) as response:  # noqa: S310 - https only, checked above
            return json.load(response)
    return json.loads(pathlib.Path(where).read_text(encoding="utf-8"))


def main(argv: list[str]) -> int:
    """Check the list at argv[1], or the bridge's on GitHub; exit 1 naming each measure missing."""
    where = argv[1] if len(argv) > 1 else PUBLISHED
    source = (ROOT / "src" / "view" / "health.ts").read_text(encoding="utf-8")
    words = json.loads((ROOT / "src" / "i18n" / "en.json").read_text(encoding="utf-8"))
    try:
        published = read(where)
    except (urllib.error.URLError, TimeoutError) as error:
        sys.stdout.write(
            f"Could not read {where}: {error}.\n"
            "Try again with: gh workflow run measures --repo roykollensvendsen/claude-voice-ui\n"
        )
        return 1
    lines = missing(published, source, words)
    for line in lines:
        sys.stdout.write(f"{line}\n")
    if lines:
        return 1
    sys.stdout.write(f"Every measure in {where} has words on the page.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
